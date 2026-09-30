import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { buildContactsDataExport } from "./contactPrivacyExport";

describe("contacts privacy export", () => {
  it("exports a selected contact with related companies, assignments, and identities without unrelated records", () => {
    const database = createSeedDatabase();
    const selected = database.contacts[0];
    database.contacts.push({ ...structuredClone(selected), id: "unrelated-contact", displayName: "Unrelated" });
    database.externalContactIdentities.push({
      id: "identity-export", organizationId: database.organization.id, contactId: selected.id,
      provider: "microsoft", providerAccountId: "account", externalContactId: "external", lastImportedAt: "2026-09-29T00:00:00.000Z",
    });

    const exported = buildContactsDataExport(database, { contactIds: [selected.id] }, "2026-09-29T00:00:00.000Z");

    expect(exported.format).toBe("quicksige.contacts.v1");
    expect(exported.contacts.map((contact) => contact.id)).toEqual([selected.id]);
    expect(exported.contacts.some((contact) => contact.id === "unrelated-contact")).toBe(false);
    expect(exported.affiliations.every((affiliation) => affiliation.contactId === selected.id)).toBe(true);
    expect(exported.externalIdentities).toEqual([expect.objectContaining({ id: "identity-export" })]);
    expect(JSON.stringify(exported)).not.toContain("accessToken");
  });

  it("includes affiliated people when a company is the selected portability subject", () => {
    const database = createSeedDatabase();
    const company = database.companies[0];
    const exported = buildContactsDataExport(database, { companyIds: [company.id] });

    expect(exported.companies.map((candidate) => candidate.id)).toEqual([company.id]);
    expect(exported.contacts.map((contact) => contact.id)).toEqual(expect.arrayContaining(
      database.contactAffiliations.filter((affiliation) => affiliation.companyId === company.id).map((affiliation) => affiliation.contactId),
    ));
  });
});
