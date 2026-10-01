import { MAX_CONTACT_IMPORT_RECORDS, type ContactImportCandidate } from "../domain/contactImport";

const MICROSOFT_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const GOOGLE_PEOPLE_BASE_URL = "https://people.googleapis.com/v1";
const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";
export const MICROSOFT_CONTACT_SCOPES = ["User.Read", "Contacts.Read"] as const;
export const GOOGLE_CONTACT_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/contacts.readonly"] as const;
const MAX_PROVIDER_PAGES = 100;
const MAX_PROVIDER_REQUEST_ATTEMPTS = 3;
const MAX_PROVIDER_RETRY_DELAY_MS = 5_000;

export interface ProviderRequestOptions {
  signal?: AbortSignal;
  wait?: (milliseconds: number) => Promise<void>;
}

export interface ContactProviderCollection {
  id: string;
  label: string;
  count: number;
}

export interface ContactProviderImportData {
  candidates: ContactImportCandidate[];
  collections: ContactProviderCollection[];
}

export interface MicrosoftGraphContact {
  id: string;
  changeKey?: string;
  displayName?: string;
  title?: string;
  givenName?: string;
  surname?: string;
  generation?: string;
  companyName?: string;
  jobTitle?: string;
  department?: string;
  emailAddresses?: Array<{ address?: string }>;
  businessPhones?: string[];
  homePhones?: string[];
  mobilePhone?: string;
  businessAddress?: MicrosoftGraphAddress;
  homeAddress?: MicrosoftGraphAddress;
  otherAddress?: MicrosoftGraphAddress;
  personalNotes?: string;
  categories?: string[];
}

interface MicrosoftGraphAddress {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryOrRegion?: string;
}

interface MicrosoftGraphContactFolder {
  id: string;
  displayName?: string;
}

export interface GooglePerson {
  resourceName?: string;
  etag?: string;
  names?: Array<{ displayName?: string; givenName?: string; familyName?: string; honorificPrefix?: string; honorificSuffix?: string }>;
  emailAddresses?: Array<{ value?: string; type?: string; metadata?: { primary?: boolean } }>;
  phoneNumbers?: Array<{ value?: string; type?: string; metadata?: { primary?: boolean } }>;
  organizations?: Array<{ name?: string; title?: string; department?: string; metadata?: { primary?: boolean } }>;
  addresses?: Array<{ streetAddress?: string; postalCode?: string; city?: string; region?: string; country?: string; type?: string; metadata?: { primary?: boolean } }>;
  biographies?: Array<{ value?: string; metadata?: { primary?: boolean } }>;
  memberships?: Array<{ contactGroupMembership?: { contactGroupResourceName?: string } }>;
}

interface GoogleContactGroup {
  resourceName?: string;
  name?: string;
  groupType?: "USER_CONTACT_GROUP" | "SYSTEM_CONTACT_GROUP";
}

interface GoogleTokenResponse { access_token?: string; error?: string }
interface GoogleTokenClient { requestAccessToken: (options?: { prompt?: string }) => void }
interface GoogleAccountsOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }) => GoogleTokenClient;
  revoke: (token: string, callback?: () => void) => void;
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleAccountsOAuth2 } };
  }
}

function providerMethodType(value = ""):
  "work" | "mobile" | "home" | "other" {
  const normalized = value.toLocaleLowerCase();
  if (/mobile|cell/.test(normalized)) return "mobile";
  if (/home/.test(normalized)) return "home";
  if (/work|business/.test(normalized)) return "work";
  return "other";
}

function microsoftAddress(address: MicrosoftGraphAddress | undefined, type: "work" | "home" | "other") {
  if (!address || ![address.street, address.city, address.state, address.postalCode, address.countryOrRegion].some(Boolean)) return [];
  return [{
    type,
    street: address.street ?? "",
    postalCode: address.postalCode ?? "",
    city: address.city ?? "",
    region: address.state ?? "",
    country: address.countryOrRegion ?? "",
    primary: type === "work",
  }];
}

export function microsoftContactCandidate(contact: MicrosoftGraphContact, providerAccountId: string, collectionId?: string): ContactImportCandidate {
  const phones = [
    ...(contact.businessPhones ?? []).map((value, index) => ({ value, type: "work" as const, primary: index === 0 })),
    ...(contact.mobilePhone ? [{ value: contact.mobilePhone, type: "mobile" as const, primary: !(contact.businessPhones?.length) }] : []),
    ...(contact.homePhones ?? []).map((value) => ({ value, type: "home" as const, primary: false })),
  ];
  return {
    sourceKey: contact.id,
    collectionIds: collectionId ? [collectionId] : undefined,
    prefix: contact.title ?? "",
    givenName: contact.givenName ?? "",
    familyName: contact.surname ?? "",
    suffix: contact.generation ?? "",
    fullName: contact.displayName ?? "",
    companyName: contact.companyName ?? "",
    jobTitle: contact.jobTitle ?? "",
    department: contact.department ?? "",
    emails: (contact.emailAddresses ?? []).filter((email) => email.address).map((email, index) => ({ value: email.address!, type: "work", primary: index === 0 })),
    phones,
    addresses: [
      ...microsoftAddress(contact.businessAddress, "work"),
      ...microsoftAddress(contact.homeAddress, "home"),
      ...microsoftAddress(contact.otherAddress, "other"),
    ],
    notes: contact.personalNotes ?? "",
    tags: contact.categories ?? [],
    externalIdentity: {
      provider: "microsoft",
      providerAccountId,
      externalContactId: contact.id,
      sourceRevision: contact.changeKey,
    },
    warnings: [],
  };
}

function providerRequestError(status: number): Error {
  if (status === 401) return new Error("provider_session_expired");
  if (status === 403) return new Error("provider_permission_denied");
  if (status === 429) return new Error("provider_throttled");
  if (status >= 500) return new Error("provider_unavailable");
  return new Error(`provider_request_failed:${status}`);
}

export function providerAuthorizationError(error: unknown): Error {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const description = [candidate.errorCode, candidate.error, candidate.subError, candidate.type, candidate.message, error]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase();
  if (/popup_failed_to_open|popup_window_error|popup.*blocked/.test(description)) return new Error("provider_popup_blocked");
  if (/user_cancel|popup_closed|cancelled|canceled/.test(description)) return new Error("provider_consent_cancelled");
  if (/access_denied|consent_required|aadsts65004/.test(description)) return new Error("provider_permission_denied");
  if (/interaction_required|login_required|token_renewal|invalid_grant/.test(description)) return new Error("provider_session_expired");
  if (/conditional|aadsts50076|aadsts50079|claims_challenge/.test(description)) return new Error("provider_conditional_access");
  return new Error("provider_authorization_failed");
}

function providerRetryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("Retry-After")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const retryAt = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(retryAt)) return Math.max(0, Math.min(MAX_PROVIDER_RETRY_DELAY_MS, retryAt));
  }
  return Math.min(MAX_PROVIDER_RETRY_DELAY_MS, 250 * (2 ** attempt));
}

async function requestProviderPage(url: string, accessToken: string, options: ProviderRequestOptions): Promise<Response> {
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < MAX_PROVIDER_REQUEST_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: options.signal });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (attempt === MAX_PROVIDER_REQUEST_ATTEMPTS - 1) throw new Error("provider_network_failed");
      await wait(Math.min(MAX_PROVIDER_RETRY_DELAY_MS, 250 * (2 ** attempt)));
      continue;
    }
    if (response.ok) return response;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_PROVIDER_REQUEST_ATTEMPTS - 1) throw providerRequestError(response.status);
    await wait(providerRetryDelay(response, attempt));
  }
  throw new Error("provider_unavailable");
}

export async function fetchProviderPages<T>(
  initialUrl: string,
  accessToken: string,
  nextLinkName: "@odata.nextLink" | "nextPageToken",
  options: ProviderRequestOptions = {},
): Promise<T[]> {
  const values: T[] = [];
  let nextUrl: string | undefined = initialUrl;
  for (let page = 0; nextUrl && page < MAX_PROVIDER_PAGES; page += 1) {
    const response = await requestProviderPage(nextUrl, accessToken, options);
    const body = await response.json() as { value?: T[]; connections?: T[]; contactGroups?: T[]; "@odata.nextLink"?: string; nextPageToken?: string };
    values.push(...(body.value ?? body.connections ?? body.contactGroups ?? []));
    if (values.length > MAX_CONTACT_IMPORT_RECORDS) throw new Error("too_many_records");
    const nextPage = body[nextLinkName];
    if (nextLinkName === "nextPageToken" && nextPage) {
      const url = new URL(initialUrl);
      url.searchParams.set("pageToken", nextPage);
      nextUrl = url.toString();
    } else nextUrl = nextPage;
  }
  if (nextUrl) throw new Error("provider_pagination_limit");
  return values;
}

function combineProviderCandidates(candidates: ContactImportCandidate[]): ContactImportCandidate[] {
  const bySourceKey = new Map<string, ContactImportCandidate>();
  for (const candidate of candidates) {
    const existing = bySourceKey.get(candidate.sourceKey);
    if (!existing) bySourceKey.set(candidate.sourceKey, candidate);
    else bySourceKey.set(candidate.sourceKey, {
      ...existing,
      collectionIds: [...new Set([...(existing.collectionIds ?? []), ...(candidate.collectionIds ?? [])])],
      tags: [...new Set([...existing.tags, ...candidate.tags])],
    });
  }
  return [...bySourceKey.values()];
}

function providerCollections(
  definitions: Array<{ id: string; label: string }>,
  candidates: ContactImportCandidate[],
): ContactProviderCollection[] {
  return definitions.map((definition) => ({
    ...definition,
    count: candidates.filter((candidate) => candidate.collectionIds?.includes(definition.id)).length,
  })).filter((collection) => collection.count > 0);
}

export async function importMicrosoftContacts(options: ProviderRequestOptions = {}): Promise<ContactProviderImportData> {
  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim();
  if (!clientId) throw new Error("provider_not_configured:microsoft");
  const { PublicClientApplication } = await import("@azure/msal-browser");
  const application = new PublicClientApplication({
    auth: {
      clientId,
      authority: "https://login.microsoftonline.com/common",
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: "memoryStorage" },
  });
  await application.initialize();
  try {
    let authentication;
    let accessToken: string;
    try {
      authentication = await application.loginPopup({ scopes: [...MICROSOFT_CONTACT_SCOPES], prompt: "select_account" });
      if (options.signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
      accessToken = authentication.accessToken || (await application.acquireTokenSilent({ scopes: [...MICROSOFT_CONTACT_SCOPES], account: authentication.account })).accessToken;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw providerAuthorizationError(error);
    }
    const selectFields = [
      "id", "changeKey", "displayName", "title", "givenName", "surname", "generation", "companyName", "jobTitle", "department",
      "emailAddresses", "businessPhones", "homePhones", "mobilePhone", "businessAddress", "homeAddress", "otherAddress", "personalNotes", "categories",
    ].join(",");
    const defaultCollection = { id: "microsoft:default", label: "Contacts" };
    const folders = await fetchProviderPages<MicrosoftGraphContactFolder>(
      `${MICROSOFT_GRAPH_BASE_URL}/me/contactFolders?$top=100&$select=id,displayName`,
      accessToken,
      "@odata.nextLink",
      options,
    );
    const rootContacts = await fetchProviderPages<MicrosoftGraphContact>(
      `${MICROSOFT_GRAPH_BASE_URL}/me/contacts?$top=100&$select=${encodeURIComponent(selectFields)}`,
      accessToken,
      "@odata.nextLink",
      options,
    );
    const providerAccountId = authentication.account?.homeAccountId ?? authentication.account?.username ?? "microsoft-account";
    const folderCandidates: ContactImportCandidate[] = [];
    for (const folder of folders) {
      const collectionId = `microsoft:${folder.id}`;
      const contacts = await fetchProviderPages<MicrosoftGraphContact>(
        `${MICROSOFT_GRAPH_BASE_URL}/me/contactFolders/${encodeURIComponent(folder.id)}/contacts?$top=100&$select=${encodeURIComponent(selectFields)}`,
        accessToken,
        "@odata.nextLink",
        options,
      );
      folderCandidates.push(...contacts.map((contact) => microsoftContactCandidate(contact, providerAccountId, collectionId)));
    }
    const candidates = combineProviderCandidates([
      ...rootContacts.map((contact) => microsoftContactCandidate(contact, providerAccountId, defaultCollection.id)),
      ...folderCandidates,
    ]);
    if (candidates.length > MAX_CONTACT_IMPORT_RECORDS) throw new Error("too_many_records");
    return {
      candidates,
      collections: providerCollections([
        defaultCollection,
        ...folders.map((folder) => ({ id: `microsoft:${folder.id}`, label: folder.displayName?.trim() || "Unnamed folder" })),
      ], candidates),
    };
  } finally {
    await application.clearCache();
  }
}

function loadGoogleIdentity(): Promise<GoogleAccountsOAuth2> {
  if (window.google?.accounts.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`);
    const script = existingScript ?? document.createElement("script");
    const onLoad = () => window.google?.accounts.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error("provider_unavailable:google"));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("provider_unavailable:google")), { once: true });
    if (!existingScript) {
      script.src = GOOGLE_IDENTITY_SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

function requestGoogleAccessToken(oauth2: GoogleAccountsOAuth2, clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_CONTACT_SCOPES.join(" "),
      callback: (response) => response.access_token ? resolve(response.access_token) : reject(providerAuthorizationError(response.error)),
      error_callback: (error) => reject(providerAuthorizationError(error)),
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}

export function googlePersonCandidate(person: GooglePerson, providerAccountId: string, groupNames: ReadonlyMap<string, string> = new Map()): ContactImportCandidate {
  const name = person.names?.find((value) => value.displayName) ?? person.names?.[0];
  const organization = person.organizations?.find((value) => value.metadata?.primary) ?? person.organizations?.[0];
  const membershipIds = (person.memberships ?? []).map((membership) => membership.contactGroupMembership?.contactGroupResourceName ?? "").filter(Boolean);
  return {
    sourceKey: person.resourceName ?? crypto.randomUUID(),
    collectionIds: ["google:all", ...membershipIds],
    prefix: name?.honorificPrefix ?? "",
    givenName: name?.givenName ?? "",
    familyName: name?.familyName ?? "",
    suffix: name?.honorificSuffix ?? "",
    fullName: name?.displayName ?? "",
    companyName: organization?.name ?? "",
    jobTitle: organization?.title ?? "",
    department: organization?.department ?? "",
    emails: (person.emailAddresses ?? []).filter((email) => email.value).map((email, index) => ({
      value: email.value!, type: providerMethodType(email.type), primary: email.metadata?.primary ?? index === 0,
    })),
    phones: (person.phoneNumbers ?? []).filter((phone) => phone.value).map((phone, index) => ({
      value: phone.value!, type: providerMethodType(phone.type), primary: phone.metadata?.primary ?? index === 0,
    })),
    addresses: (person.addresses ?? []).map((address, index) => ({
      type: providerMethodType(address.type), street: address.streetAddress ?? "", postalCode: address.postalCode ?? "",
      city: address.city ?? "", region: address.region ?? "", country: address.country ?? "",
      primary: address.metadata?.primary ?? index === 0,
    })),
    notes: person.biographies?.find((value) => value.metadata?.primary)?.value ?? person.biographies?.[0]?.value ?? "",
    tags: membershipIds.map((collectionId) => groupNames.get(collectionId) ?? collectionId.split("/").at(-1) ?? "").filter(Boolean),
    externalIdentity: {
      provider: "google", providerAccountId, externalContactId: person.resourceName ?? "", sourceRevision: person.etag,
    },
    warnings: [],
  };
}

export async function importGoogleContacts(options: ProviderRequestOptions = {}): Promise<ContactProviderImportData> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new Error("provider_not_configured:google");
  const oauth2 = await loadGoogleIdentity();
  const accessToken = await requestGoogleAccessToken(oauth2, clientId);
  try {
    if (options.signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
    const userResponse = await requestProviderPage("https://openidconnect.googleapis.com/v1/userinfo", accessToken, options);
    const user = await userResponse.json() as { sub?: string; email?: string };
    const groups = await fetchProviderPages<GoogleContactGroup>(
      `${GOOGLE_PEOPLE_BASE_URL}/contactGroups?pageSize=1000&groupFields=name`,
      accessToken,
      "nextPageToken",
      options,
    );
    const userGroups = groups.filter((group) => group.resourceName && group.groupType !== "SYSTEM_CONTACT_GROUP");
    const groupNames = new Map(userGroups.map((group) => [
      group.resourceName!,
      group.name?.trim() || group.resourceName!.split("/").at(-1) || "Unnamed group",
    ]));
    const fields = "names,emailAddresses,phoneNumbers,organizations,addresses,biographies,memberships,metadata";
    const contacts = await fetchProviderPages<GooglePerson>(
      `${GOOGLE_PEOPLE_BASE_URL}/people/me/connections?pageSize=1000&personFields=${encodeURIComponent(fields)}`,
      accessToken,
      "nextPageToken",
      options,
    );
    const candidates = contacts.map((contact) => googlePersonCandidate(contact, user.sub ?? user.email ?? "google-account", groupNames));
    return {
      candidates,
      collections: providerCollections(
        [
          { id: "google:all", label: "All contacts" },
          ...userGroups.map((group) => ({ id: group.resourceName!, label: groupNames.get(group.resourceName!)! })),
        ],
        candidates,
      ),
    };
  } finally {
    oauth2.revoke(accessToken);
  }
}
