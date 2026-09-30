import type { AppDatabase } from "./types";

export interface ContactsDataExport {
  format: "quicksige.contacts.v1";
  exportedAt: string;
  organization: { id: string; name: string };
  contacts: AppDatabase["contacts"];
  companies: AppDatabase["companies"];
  affiliations: AppDatabase["contactAffiliations"];
  projectAssignments: Array<AppDatabase["projectContactAssignments"][number] & { projectName: string }>;
  externalIdentities: AppDatabase["externalContactIdentities"];
}

/** Builds the complete portable record set needed for an authorized access or portability request. */
export function buildContactsDataExport(
  database: AppDatabase,
  selection: { contactIds?: string[]; companyIds?: string[] } = {},
  exportedAt = new Date().toISOString(),
): ContactsDataExport {
  const requestedContactIds = new Set(selection.contactIds ?? []);
  const requestedCompanyIds = new Set(selection.companyIds ?? []);
  const allRecords = requestedContactIds.size === 0 && requestedCompanyIds.size === 0;
  const organizationId = database.organization.id;

  if (allRecords) {
    database.contacts.filter((contact) => contact.organizationId === organizationId).forEach((contact) => requestedContactIds.add(contact.id));
    database.companies.filter((company) => company.organizationId === organizationId).forEach((company) => requestedCompanyIds.add(company.id));
  } else {
    database.contactAffiliations.forEach((affiliation) => {
      if (requestedContactIds.has(affiliation.contactId)) requestedCompanyIds.add(affiliation.companyId);
      if (requestedCompanyIds.has(affiliation.companyId)) requestedContactIds.add(affiliation.contactId);
    });
  }

  const contacts = database.contacts.filter((contact) => contact.organizationId === organizationId && requestedContactIds.has(contact.id));
  const companies = database.companies.filter((company) => company.organizationId === organizationId && requestedCompanyIds.has(company.id));
  const contactIds = new Set(contacts.map((contact) => contact.id));
  const companyIds = new Set(companies.map((company) => company.id));
  const affiliations = database.contactAffiliations.filter((affiliation) => (
    affiliation.organizationId === organizationId && contactIds.has(affiliation.contactId) && companyIds.has(affiliation.companyId)
  ));

  return {
    format: "quicksige.contacts.v1",
    exportedAt,
    organization: { id: database.organization.id, name: database.organization.name },
    contacts: structuredClone(contacts),
    companies: structuredClone(companies),
    affiliations: structuredClone(affiliations),
    projectAssignments: database.projectContactAssignments
      .filter((assignment) => assignment.organizationId === organizationId && contactIds.has(assignment.contactId))
      .map((assignment) => ({
        ...structuredClone(assignment),
        projectName: database.projects.find((project) => project.id === assignment.projectId)?.name ?? "",
      })),
    externalIdentities: structuredClone(database.externalContactIdentities.filter((identity) => (
      identity.organizationId === organizationId && contactIds.has(identity.contactId)
    ))),
  };
}
