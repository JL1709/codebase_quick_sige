import { contactDisplayName, ensureSinglePrimary, normalizeEmail, normalizePhone } from "./contacts";
import type { ContactImportCandidate } from "./contactImport";
import type {
  AppDatabase,
  Company,
  Contact,
  ContactAddress,
  ContactEmail,
  ContactImportBatch,
  ContactImportItem,
  ContactPhone,
  ContactSource,
  ProjectContactRole,
} from "./types";

export type ContactImportDecisionAction = "create" | "update" | "merge" | "skip";
export type ContactImportOverwriteField = "prefix" | "givenName" | "familyName" | "suffix" | "displayName" | "notes";

export interface ContactImportDecision {
  candidate: ContactImportCandidate;
  action: ContactImportDecisionAction;
  existingContactId?: string;
  overwriteFields?: ContactImportOverwriteField[];
}

export interface ContactImportCommitInput {
  source: ContactSource;
  sourceLabel: string;
  decisions: ContactImportDecision[];
  projectAssignment?: {
    projectId: string;
    roles: Array<Pick<ProjectContactRole, "role" | "roleDefinitionId" | "customLabel">>;
  };
}

export interface ContactImportCommitResult {
  database: AppDatabase;
  batch: ContactImportBatch;
}

function uniqueMethods<T extends { normalizedValue: string }>(existing: T[], incoming: T[]): T[] {
  const values = new Set(existing.map((value) => value.normalizedValue).filter(Boolean));
  return [...existing, ...incoming.filter((value) => !values.has(value.normalizedValue))];
}

function candidateEmails(candidate: ContactImportCandidate, id: (prefix: string) => string): ContactEmail[] {
  return ensureSinglePrimary(candidate.emails
    .map((email) => ({ ...email, id: id("email"), value: email.value.trim(), normalizedValue: normalizeEmail(email.value) }))
    .filter((email) => email.normalizedValue));
}

function candidatePhones(candidate: ContactImportCandidate, id: (prefix: string) => string): ContactPhone[] {
  return ensureSinglePrimary(candidate.phones
    .map((phone) => ({ ...phone, id: id("phone"), value: phone.value.trim(), normalizedValue: normalizePhone(phone.value) }))
    .filter((phone) => phone.normalizedValue));
}

function candidateAddresses(candidate: ContactImportCandidate, id: (prefix: string) => string): ContactAddress[] {
  return ensureSinglePrimary(candidate.addresses.map((address) => ({ ...address, id: id("address") })));
}

function createContact(
  organizationId: string,
  source: ContactSource,
  candidate: ContactImportCandidate,
  now: string,
  id: (prefix: string) => string,
): Contact {
  return {
    id: id("contact"),
    organizationId,
    prefix: candidate.prefix.trim(),
    givenName: candidate.givenName.trim(),
    familyName: candidate.familyName.trim(),
    suffix: candidate.suffix.trim(),
    displayName: candidate.displayName.trim(),
    emails: candidateEmails(candidate, id),
    phones: candidatePhones(candidate, id),
    addresses: candidateAddresses(candidate, id),
    notes: candidate.notes.trim(),
    tags: [...new Set(candidate.tags.map((tag) => tag.trim()).filter(Boolean))],
    lifecycle: "active",
    source,
    createdAt: now,
    updatedAt: now,
  };
}

function updateContact(
  existing: Contact,
  candidate: ContactImportCandidate,
  now: string,
  id: (prefix: string) => string,
  overwriteFields: ContactImportOverwriteField[] = [],
): Contact {
  const incomingEmails = candidateEmails(candidate, id);
  const incomingPhones = candidatePhones(candidate, id);
  const incomingAddresses = candidateAddresses(candidate, id);
  const overwrites = new Set(overwriteFields);
  const importedValue = (field: ContactImportOverwriteField, currentValue: string, nextValue: string) => (
    (overwrites.has(field) && nextValue.trim()) || currentValue || nextValue.trim()
  );
  return {
    ...existing,
    prefix: importedValue("prefix", existing.prefix, candidate.prefix),
    givenName: importedValue("givenName", existing.givenName, candidate.givenName),
    familyName: importedValue("familyName", existing.familyName, candidate.familyName),
    suffix: importedValue("suffix", existing.suffix, candidate.suffix),
    displayName: importedValue("displayName", existing.displayName, candidate.displayName),
    emails: ensureSinglePrimary(uniqueMethods(existing.emails, incomingEmails)),
    phones: ensureSinglePrimary(uniqueMethods(existing.phones, incomingPhones)),
    addresses: ensureSinglePrimary([
      ...existing.addresses,
      ...incomingAddresses.filter((address) => !existing.addresses.some((current) => (
        [current.street, current.postalCode, current.city, current.country].join("|").toLocaleLowerCase()
        === [address.street, address.postalCode, address.city, address.country].join("|").toLocaleLowerCase()
      ))),
    ]),
    notes: importedValue("notes", existing.notes, candidate.notes),
    tags: [...new Set([...existing.tags, ...candidate.tags.map((tag) => tag.trim()).filter(Boolean)])],
    lifecycle: "active",
    updatedAt: now,
  };
}

export function commitContactImport(
  current: AppDatabase,
  input: ContactImportCommitInput,
  id: (prefix: string) => string,
  now = new Date().toISOString(),
): ContactImportCommitResult {
  const database = structuredClone(current);
  const items: ContactImportItem[] = [];

  for (const decision of input.decisions) {
    if (decision.action === "skip") {
      items.push({ id: id("import-item"), sourceKey: decision.candidate.sourceKey, action: "skipped", messages: [] });
      continue;
    }

    const previousContact = decision.action === "update" || decision.action === "merge"
      ? database.contacts.find((contact) => contact.id === decision.existingContactId)
      : undefined;
    if ((decision.action === "update" || decision.action === "merge") && !previousContact) {
      items.push({ id: id("import-item"), sourceKey: decision.candidate.sourceKey, action: "failed", messages: ["contact_not_found"] });
      continue;
    }

    const contact = previousContact
      ? updateContact(previousContact, decision.candidate, now, id, decision.overwriteFields)
      : createContact(database.organization.id, input.source, decision.candidate, now, id);
    database.contacts = previousContact
      ? database.contacts.map((currentContact) => currentContact.id === contact.id ? contact : currentContact)
      : [contact, ...database.contacts];

    let company: Company | undefined;
    let previousCompany: Company | undefined;
    let companyCreated = false;
    const companyName = decision.candidate.companyName.trim();
    if (companyName) {
      company = database.companies.find((candidate) => candidate.name.trim().toLocaleLowerCase() === companyName.toLocaleLowerCase());
      if (company) previousCompany = structuredClone(company);
      if (!company) {
        companyCreated = true;
        company = {
          id: id("company"), organizationId: database.organization.id, name: companyName,
          website: "", domain: "",
          email: "", phone: "", notes: "", tags: [], lifecycle: "active", source: input.source,
          createdAt: now, updatedAt: now,
        };
        database.companies.unshift(company);
      } else if (company.lifecycle === "archived") {
        company = { ...company, lifecycle: "active", updatedAt: now };
        database.companies = database.companies.map((candidate) => candidate.id === company!.id ? company! : candidate);
      }
    }

    const affiliationIds: string[] = [];
    let previousAffiliation;
    if (company) {
      const existingAffiliation = database.contactAffiliations.find((affiliation) => affiliation.contactId === contact.id && affiliation.companyId === company!.id);
      if (existingAffiliation) {
        previousAffiliation = structuredClone(existingAffiliation);
        database.contactAffiliations = database.contactAffiliations.map((affiliation) => affiliation.id === existingAffiliation.id ? {
          ...affiliation,
          jobTitle: affiliation.jobTitle || decision.candidate.jobTitle.trim(),
          department: affiliation.department || decision.candidate.department.trim(),
          lifecycle: "active",
          updatedAt: now,
        } : affiliation);
      } else {
        const affiliationId = id("affiliation");
        affiliationIds.push(affiliationId);
        database.contactAffiliations.unshift({
          id: affiliationId, organizationId: database.organization.id, contactId: contact.id, companyId: company.id,
          jobTitle: decision.candidate.jobTitle.trim(), department: decision.candidate.department.trim(),
          primary: !database.contactAffiliations.some((affiliation) => affiliation.contactId === contact.id && affiliation.lifecycle === "active"),
          lifecycle: "active", createdAt: now, updatedAt: now,
        });
      }
    }

    const externalIdentityIds: string[] = [];
    let previousExternalIdentity;
    const externalIdentity = decision.candidate.externalIdentity;
    if (externalIdentity) {
      const existingIdentity = database.externalContactIdentities.find((identity) => (
        identity.provider === externalIdentity.provider
        && identity.providerAccountId === externalIdentity.providerAccountId
        && identity.externalContactId === externalIdentity.externalContactId
      ));
      if (existingIdentity) {
        previousExternalIdentity = structuredClone(existingIdentity);
        database.externalContactIdentities = database.externalContactIdentities.map((identity) => identity.id === existingIdentity.id ? {
          ...identity, contactId: contact.id, sourceRevision: externalIdentity.sourceRevision, lastImportedAt: now,
        } : identity);
      } else {
        const identityId = id("external-contact");
        externalIdentityIds.push(identityId);
        database.externalContactIdentities.push({
          id: identityId, organizationId: database.organization.id, contactId: contact.id,
          ...externalIdentity, lastImportedAt: now,
        });
      }
    }

    const assignmentIds: string[] = [];
    let previousAssignment;
    if (input.projectAssignment) {
      const existingAssignment = database.projectContactAssignments.find((assignment) => (
        assignment.projectId === input.projectAssignment!.projectId && assignment.contactId === contact.id
      ));
      const selectedRoles = input.projectAssignment.roles.flatMap<Pick<ProjectContactRole, "role" | "roleDefinitionId" | "customLabel">>((role) => {
        if (role.role !== "custom") return [{ role: role.role, roleDefinitionId: undefined, customLabel: undefined }];
        const definition = database.projectRoleDefinitions.find((candidate) => (
          candidate.id === role.roleDefinitionId
          && candidate.organizationId === database.organization.id
          && candidate.lifecycle === "active"
          && (!candidate.projectId || candidate.projectId === input.projectAssignment!.projectId)
        ));
        return definition ? [{ role: role.role, roleDefinitionId: definition.id, customLabel: definition.name }] : [];
      }).filter((role, index, roles) => (
        !roles.some((candidate, candidateIndex) => candidateIndex < index
          && candidate.role === role.role
          && candidate.roleDefinitionId === role.roleDefinitionId)
      ));
      const missingRoles = selectedRoles.filter((selectedRole) => !existingAssignment?.roles.some((role) => (
        role.role === selectedRole.role
        && role.roleDefinitionId === selectedRole.roleDefinitionId
        && role.customLabel?.trim() === selectedRole.customLabel?.trim()
      )));
      if (existingAssignment && missingRoles.length > 0) {
        previousAssignment = structuredClone(existingAssignment);
        database.projectContactAssignments = database.projectContactAssignments.map((assignment) => assignment.id === existingAssignment.id ? {
          ...assignment,
          roles: [...assignment.roles, ...missingRoles.map((role) => ({
            id: id("role"), role: role.role,
            roleDefinitionId: role.role === "custom" ? role.roleDefinitionId : undefined,
            customLabel: role.role === "custom" ? role.customLabel?.trim() : undefined,
          }))],
          lifecycle: "active",
          updatedAt: now,
        } : assignment);
      } else if (!existingAssignment) {
        const assignmentId = id("assignment");
        assignmentIds.push(assignmentId);
        database.projectContactAssignments.unshift({
          id: assignmentId, organizationId: database.organization.id, projectId: input.projectAssignment.projectId,
          contactId: contact.id,
          roles: selectedRoles.map((role) => ({
            id: id("role"), role: role.role,
            roleDefinitionId: role.role === "custom" ? role.roleDefinitionId : undefined,
            customLabel: role.role === "custom" ? role.customLabel?.trim() : undefined,
          })),
          lifecycle: "active", createdAt: now, updatedAt: now,
        });
      }
    }

    items.push({
      id: id("import-item"), sourceKey: decision.candidate.sourceKey,
      action: previousContact ? decision.action === "merge" ? "merged" : "updated" : "created", contactId: contact.id, companyId: company?.id,
      messages: decision.candidate.warnings,
      previousContact: previousContact && structuredClone(previousContact),
      previousCompany,
      previousAffiliation,
      previousAssignment,
      previousExternalIdentity,
      companyCreated,
      affiliationIds,
      assignmentIds,
      externalIdentityIds,
    });
  }

  const batch: ContactImportBatch = {
    id: id("contact-import"), organizationId: database.organization.id, source: input.source,
    sourceLabel: input.sourceLabel, initiatedByName: database.user.name, status: "completed", items, createdAt: now,
  };
  database.contactImportBatches.unshift(batch);
  database.auditEvents.push({
    id: id("audit"), action: "contacts.imported", actorName: database.user.name, createdAt: now,
    details: `${batch.id}:${items.filter((item) => item.action !== "skipped" && item.action !== "failed").length}`,
  });
  if (input.projectAssignment) {
    database.projects = database.projects.map((project) => project.id === input.projectAssignment!.projectId ? { ...project, updatedAt: now } : project);
    database.plans = database.plans.map((plan) => plan.projectId === input.projectAssignment!.projectId && !plan.supersededAt ? { ...plan, status: "draft", updatedAt: now } : plan);
    database.generatedDocuments = database.generatedDocuments.map((document) => document.projectId === input.projectAssignment!.projectId ? { ...document, stale: true } : document);
  }
  return { database, batch };
}

export function candidateDisplayName(candidate: ContactImportCandidate): string {
  return contactDisplayName({
    displayName: candidate.displayName,
    prefix: candidate.prefix,
    givenName: candidate.givenName,
    familyName: candidate.familyName,
    suffix: candidate.suffix,
  });
}
