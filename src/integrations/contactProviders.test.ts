import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { commitContactImport } from "../domain/contactImportCommit";
import {
  fetchProviderPages,
  GOOGLE_CONTACT_SCOPES,
  googlePersonCandidate,
  importGoogleContacts,
  importMicrosoftContacts,
  MICROSOFT_CONTACT_SCOPES,
  microsoftContactCandidate,
  providerAuthorizationError,
} from "./contactProviders";

describe("contact provider adapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reports unconfigured connectors before loading an OAuth SDK or requesting credentials", async () => {
    vi.stubEnv("VITE_MICROSOFT_CLIENT_ID", "");
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");

    await expect(importMicrosoftContacts()).rejects.toThrow("provider_not_configured:microsoft");
    await expect(importGoogleContacts()).rejects.toThrow("provider_not_configured:google");
  });

  it("declares only the reviewed delegated read-only scopes", () => {
    expect(MICROSOFT_CONTACT_SCOPES).toEqual(["User.Read", "Contacts.Read"]);
    expect(GOOGLE_CONTACT_SCOPES).toEqual(["openid", "email", "https://www.googleapis.com/auth/contacts.readonly"]);
    expect(MICROSOFT_CONTACT_SCOPES.join(" ")).not.toMatch(/ReadWrite|Mail|Directory/i);
    expect(GOOGLE_CONTACT_SCOPES.join(" ")).not.toMatch(/gmail|directory|contacts(?!\.readonly)/i);
  });

  it("maps only approved Microsoft Graph fields into the shared candidate", () => {
    const candidate = microsoftContactCandidate({
      id: "graph-contact-1", changeKey: "revision-2", displayName: "Ada Lovelace", givenName: "Ada", surname: "Lovelace",
      companyName: "Analytical Engines", jobTitle: "Engineer", department: "Planning",
      emailAddresses: [{ address: "ada@example.com" }], businessPhones: ["+44 20 1234"], mobilePhone: "+44 7700 900123",
      businessAddress: { street: "1 Engine Road", city: "London", postalCode: "SW1A", countryOrRegion: "UK" },
      personalNotes: "Project contact", categories: ["Safety"],
    }, "account-1");

    expect(candidate).toMatchObject({ displayName: "Ada Lovelace", companyName: "Analytical Engines", jobTitle: "Engineer" });
    expect(candidate.phones.map((phone) => phone.type)).toEqual(["work", "mobile"]);
    expect(candidate.externalIdentity).toEqual({ provider: "microsoft", providerAccountId: "account-1", externalContactId: "graph-contact-1", sourceRevision: "revision-2" });
    expect(JSON.stringify(candidate)).not.toContain("access_token");
  });

  it("does not persist provider tokens or unmapped raw payload fields in contacts, import journals, or audits", () => {
    const secret = "provider-secret-token";
    const candidate = microsoftContactCandidate({
      id: "graph-safe", displayName: "Safe Contact", emailAddresses: [{ address: "safe@example.com" }],
      ...({ access_token: secret, rawPrivateProfile: { secret } } as Record<string, unknown>),
    }, "account-safe");
    let sequence = 0;
    const result = commitContactImport(createSeedDatabase(), {
      source: "microsoft", sourceLabel: "Microsoft Outlook", decisions: [{ action: "create", candidate }],
    }, (prefix) => `${prefix}-${sequence += 1}`);
    const persisted = JSON.stringify(result.database);

    expect(persisted).not.toContain(secret);
    expect(persisted).not.toContain("access_token");
    expect(persisted).not.toContain("rawPrivateProfile");
    expect(result.database.auditEvents.at(-1)?.details).toMatch(/^contact-import-/);
  });

  it("maps saved Google People fields without importing unrelated profiles", () => {
    const candidate = googlePersonCandidate({
      resourceName: "people/c123", etag: "etag-1",
      names: [{ displayName: "Lin Chen", givenName: "Lin", familyName: "Chen" }],
      emailAddresses: [{ value: "lin@example.com", type: "work", metadata: { primary: true } }],
      phoneNumbers: [{ value: "+86 10 1234", type: "mobile" }],
      organizations: [{ name: "Example Construction", title: "Architect", department: "Design", metadata: { primary: true } }],
      addresses: [{ streetAddress: "88 Main Road", city: "Beijing", country: "China", type: "work" }],
      biographies: [{ value: "Project contact" }], memberships: [{ contactGroupMembership: { contactGroupResourceName: "contactGroups/safety" } }],
    }, "google-account-1", new Map([["contactGroups/safety", "Safety team"]]));

    expect(candidate).toMatchObject({ displayName: "Lin Chen", companyName: "Example Construction", jobTitle: "Architect", tags: ["Safety team"], collectionIds: ["google:all", "contactGroups/safety"] });
    expect(candidate.externalIdentity).toEqual({ provider: "google", providerAccountId: "google-account-1", externalContactId: "people/c123", sourceRevision: "etag-1" });
  });

  it("follows provider pagination without persisting the bearer token", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async (input, init) => {
        requests.push({ url: String(input), authorization: new Headers(init?.headers).get("Authorization") });
        return new Response(JSON.stringify({ value: [{ id: "one" }], "@odata.nextLink": "https://graph.example/page-2" }), { status: 200 });
      })
      .mockImplementationOnce(async (input, init) => {
        requests.push({ url: String(input), authorization: new Headers(init?.headers).get("Authorization") });
        return new Response(JSON.stringify({ value: [{ id: "two" }] }), { status: 200 });
      });

    const values = await fetchProviderPages<{ id: string }>("https://graph.example/page-1", "transient-token", "@odata.nextLink");

    expect(values).toEqual([{ id: "one" }, { id: "two" }]);
    expect(requests.map((request) => request.url)).toEqual(["https://graph.example/page-1", "https://graph.example/page-2"]);
    expect(requests.every((request) => request.authorization === "Bearer transient-token")).toBe(true);
  });

  it("retries throttled and transient provider responses within a bounded policy", async () => {
    const wait = vi.fn(async () => undefined);
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ id: "recovered" }] }), { status: 200 }));

    await expect(fetchProviderPages<{ id: string }>(
      "https://graph.example/contacts",
      "transient-token",
      "@odata.nextLink",
      { wait },
    )).resolves.toEqual([{ id: "recovered" }]);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("reports expired sessions immediately without retrying or exposing the token", async () => {
    const wait = vi.fn(async () => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(fetchProviderPages(
      "https://people.example/contacts",
      "secret-token-value",
      "nextPageToken",
      { wait },
    )).rejects.toThrow("provider_session_expired");
    expect(wait).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("reads Google contact-group collection pages through the shared paginator", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      contactGroups: [{ resourceName: "contactGroups/design", name: "Design" }],
    }), { status: 200 }));

    await expect(fetchProviderPages<{ resourceName: string; name: string }>(
      "https://people.example/contactGroups",
      "transient-token",
      "nextPageToken",
    )).resolves.toEqual([{ resourceName: "contactGroups/design", name: "Design" }]);
  });

  it("maps provider authentication outcomes without exposing raw identity errors", () => {
    expect(providerAuthorizationError({ errorCode: "popup_window_error" }).message).toBe("provider_popup_blocked");
    expect(providerAuthorizationError({ type: "popup_closed" }).message).toBe("provider_consent_cancelled");
    expect(providerAuthorizationError({ error: "access_denied" }).message).toBe("provider_permission_denied");
    expect(providerAuthorizationError({ subError: "interaction_required" }).message).toBe("provider_session_expired");
    expect(providerAuthorizationError({ message: "AADSTS50076 conditional access" }).message).toBe("provider_conditional_access");
    expect(providerAuthorizationError({ message: "secret diagnostic" }).message).toBe("provider_authorization_failed");
  });

  it("stops provider pagination when the import session is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new DOMException("cancelled", "AbortError"));

    await expect(fetchProviderPages(
      "https://people.example/contacts",
      "transient-token",
      "nextPageToken",
      { signal: controller.signal },
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
