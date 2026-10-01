import type {
  AppDatabase,
  Company,
  Contact,
  ContactCompanyAffiliation,
  ContactEmail,
  ContactPhone,
  Participant,
  Project,
  ProjectContactAssignment,
  ProjectContactRole,
  ProjectParticipantRole,
  ProjectRoleDefinition,
} from "./types";

export const STANDARD_PROJECT_ROLES: Exclude<ProjectParticipantRole, "custom">[] = [
  "client",
  "owner",
  "responsible_third_party",
  "coordinator",
  "architect",
  "planner",
  "site_manager",
  "contractor",
];

const ROLE_ALIASES: Record<string, ProjectParticipantRole> = {
  client: "client",
  auftraggeber: "client",
  owner: "owner",
  bauherr: "owner",
  "responsible third party": "responsible_third_party",
  responsible_third_party: "responsible_third_party",
  "beauftragter dritter": "responsible_third_party",
  coordinator: "coordinator",
  "sige-koordinator": "coordinator",
  "sige-koordination": "coordinator",
  "safety coordinator": "coordinator",
  architect: "architect",
  architekt: "architect",
  architektur: "architect",
  planner: "planner",
  fachplaner: "planner",
  fachplanung: "planner",
  "specialist designer": "planner",
  "site manager": "site_manager",
  "site management": "site_manager",
  site_manager: "site_manager",
  bauleitung: "site_manager",
  contractor: "contractor",
  auftragnehmer: "contractor",
};

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const hasInternationalPrefix = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return `${hasInternationalPrefix ? "+" : ""}${digits}`;
}

export function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLocaleLowerCase();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

export function contactDisplayName(contact: Pick<Contact, "prefix" | "givenName" | "familyName" | "suffix">): string {
  return [contact.prefix, contact.givenName, contact.familyName, contact.suffix]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

const CONTACT_PREFIXES = new Set(["dr.", "prof.", "professor", "mr.", "mrs.", "ms.", "herr", "frau", "dipl.-ing."]);
const CONTACT_SUFFIXES = new Set(["jr.", "sr.", "ii", "iii", "iv", "phd", "ph.d.", "md", "m.d."]);

export function splitContactGivenNamePrefix(givenName: string): Pick<Contact, "prefix" | "givenName"> {
  const parts = givenName.trim().split(/\s+/).filter(Boolean);
  const prefixParts: string[] = [];
  while (parts.length > 0 && CONTACT_PREFIXES.has(parts[0].toLocaleLowerCase())) prefixParts.push(parts.shift()!);
  return { prefix: prefixParts.join(" "), givenName: parts.join(" ") };
}

export function splitContactFullName(fullName: string): Pick<Contact, "prefix" | "givenName" | "familyName" | "suffix"> {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const prefixedGivenName = splitContactGivenNamePrefix(parts.join(" "));
  const nameParts = prefixedGivenName.givenName.split(/\s+/).filter(Boolean);
  const suffix = nameParts.length > 1 && CONTACT_SUFFIXES.has(nameParts.at(-1)?.toLocaleLowerCase() ?? "")
    ? nameParts.pop() ?? ""
    : "";
  if (nameParts.length < 2) return { prefix: prefixedGivenName.prefix, givenName: nameParts[0] ?? "", familyName: "", suffix };
  return { prefix: prefixedGivenName.prefix, givenName: nameParts.slice(0, -1).join(" "), familyName: nameParts.at(-1) ?? "", suffix };
}

export function primaryEmail(contact: Contact): ContactEmail | undefined {
  return contact.emails.find((email) => email.primary) ?? contact.emails[0];
}

export function primaryPhone(contact: Contact): ContactPhone | undefined {
  return contact.phones.find((phone) => phone.primary) ?? contact.phones[0];
}

export function primaryAffiliation(database: AppDatabase, contactId: string): ContactCompanyAffiliation | undefined {
  const affiliations = database.contactAffiliations.filter((affiliation) => (
    affiliation.contactId === contactId && affiliation.lifecycle === "active"
  ));
  return affiliations.find((affiliation) => affiliation.primary) ?? affiliations[0];
}

export function companyForContact(database: AppDatabase, contactId: string): Company | undefined {
  const affiliation = primaryAffiliation(database, contactId);
  return affiliation && database.companies.find((company) => company.id === affiliation.companyId);
}

export function projectContactRoleKey(role: Pick<ProjectContactRole, "role" | "roleDefinitionId" | "customLabel">): string {
  if (role.role !== "custom") return `system:${role.role}`;
  return role.roleDefinitionId ? `custom:${role.roleDefinitionId}` : `legacy:${role.customLabel ?? ""}`;
}

export function projectRoleDefinitionForKey(database: AppDatabase, key: string, projectId?: string): ProjectRoleDefinition | undefined {
  if (!key.startsWith("custom:")) return undefined;
  return database.projectRoleDefinitions.find((definition) => (
    definition.id === key.slice("custom:".length)
    && (!definition.projectId || definition.projectId === projectId)
  ));
}

export function projectRoleDefinitionsForProject(database: AppDatabase, projectId?: string): ProjectRoleDefinition[] {
  return database.projectRoleDefinitions.filter((definition) => (
    definition.lifecycle === "active"
    && (!definition.projectId || definition.projectId === projectId)
  ));
}

export function projectContactRoleFromKey(database: AppDatabase, key: string, id: string, projectId?: string): ProjectContactRole | undefined {
  if (key.startsWith("system:")) {
    const role = key.slice("system:".length) as ProjectParticipantRole;
    if (role === "custom" || !STANDARD_PROJECT_ROLES.includes(role as Exclude<ProjectParticipantRole, "custom">)) return undefined;
    return { id, role };
  }
  const definition = projectRoleDefinitionForKey(database, key, projectId);
  return definition ? { id, role: "custom", roleDefinitionId: definition.id, customLabel: definition.name } : undefined;
}

export function projectContactRoleLabel(database: AppDatabase, role: ProjectContactRole): string | undefined {
  if (role.role !== "custom") return undefined;
  return database.projectRoleDefinitions.find((definition) => definition.id === role.roleDefinitionId)?.name
    ?? role.customLabel;
}

export function resolveProjectParticipants(database: AppDatabase, projectId: string): Participant[] {
  return database.projectContactAssignments
    .filter((assignment) => assignment.projectId === projectId && assignment.lifecycle === "active")
    .flatMap((assignment) => {
      const contact = database.contacts.find((candidate) => candidate.id === assignment.contactId);
      if (!contact) return [];
      const company = companyForContact(database, contact.id);
      const roles = assignment.roles.length > 0
        ? assignment.roles
        : [{ id: `${assignment.id}-role-custom`, role: "custom" as const, customLabel: "" }];
      return roles.map((role) => ({
        id: `${assignment.id}:${role.id}`,
        role: role.role,
        customRole: projectContactRoleLabel(database, role),
        company: company?.name ?? "",
        name: contactDisplayName(contact),
        email: primaryEmail(contact)?.value ?? "",
        phone: primaryPhone(contact)?.value ?? "",
      }));
    });
}

export interface ProjectRoleCatalogMigrationResult {
  definitions: ProjectRoleDefinition[];
  assignments: ProjectContactAssignment[];
}

export function migrateProjectRoleCatalog(
  organizationId: string,
  existingDefinitions: ProjectRoleDefinition[],
  assignments: ProjectContactAssignment[],
): ProjectRoleCatalogMigrationResult {
  const definitions = existingDefinitions.map((definition, index) => ({
    ...definition,
    organizationId,
    lifecycle: definition.lifecycle ?? "active" as const,
    sortOrder: definition.sortOrder ?? index,
  }));
  const definitionByName = new Map(definitions
    .filter((definition) => !definition.projectId)
    .map((definition) => [definition.name.trim().toLocaleLowerCase(), definition]));
  const definitionIds = new Set(definitions.map((definition) => definition.id));
  const migratedAssignments = assignments.map((assignment) => {
    const roles = assignment.roles.map((role) => {
      if (role.role !== "custom") return role;
      const label = role.customLabel?.trim() ?? "";
      if (role.roleDefinitionId && definitionIds.has(role.roleDefinitionId)) return role;
      if (!label) return role;
      let definition = definitionByName.get(label.toLocaleLowerCase());
      if (!definition) {
        const baseId = `project-role-${safeIdentifier(label)}`;
        let definitionId = baseId;
        let suffix = 2;
        while (definitionIds.has(definitionId)) definitionId = `${baseId}-${suffix++}`;
        definition = {
          id: definitionId,
          organizationId,
          name: label,
          lifecycle: "active",
          sortOrder: definitions.length,
          createdAt: assignment.createdAt,
          updatedAt: assignment.updatedAt,
        };
        definitions.push(definition);
        definitionIds.add(definition.id);
        definitionByName.set(label.toLocaleLowerCase(), definition);
      }
      return { ...role, roleDefinitionId: definition.id, customLabel: definition.name };
    }).filter((role, index, candidates) => (
      !candidates.some((candidate, candidateIndex) => candidateIndex < index && projectContactRoleKey(candidate) === projectContactRoleKey(role))
    ));
    return { ...assignment, roles };
  });
  return { definitions, assignments: migratedAssignments };
}

export function projectWithResolvedParticipants(database: AppDatabase, project: Project): Project {
  return { ...project, participants: resolveProjectParticipants(database, project.id) };
}

export function normalizedContactSearchText(database: AppDatabase, contact: Contact): string {
  const affiliations = database.contactAffiliations.filter((affiliation) => affiliation.contactId === contact.id);
  const companies = affiliations.flatMap((affiliation) => database.companies.find((company) => company.id === affiliation.companyId)?.name ?? []);
  const assignments = database.projectContactAssignments.filter((assignment) => assignment.contactId === contact.id);
  const projects = assignments.flatMap((assignment) => database.projects.find((project) => project.id === assignment.projectId)?.name ?? []);
  return [
    contactDisplayName(contact),
    contact.givenName,
    contact.familyName,
    ...contact.emails.map((email) => email.value),
    ...contact.phones.map((phone) => phone.value),
    ...contact.tags,
    ...affiliations.flatMap((affiliation) => [affiliation.jobTitle, affiliation.department]),
    ...companies,
    ...projects,
    ...assignments.flatMap((assignment) => assignment.roles.flatMap((role) => [role.role, role.customLabel ?? ""])),
  ].join(" ").toLocaleLowerCase();
}

export function contactDuplicateScore(candidate: Contact, existing: Contact): number {
  const candidateEmails = new Set(candidate.emails.map((email) => email.normalizedValue).filter(Boolean));
  const existingEmails = new Set(existing.emails.map((email) => email.normalizedValue).filter(Boolean));
  if ([...candidateEmails].some((email) => existingEmails.has(email))) return 100;
  const candidatePhones = new Set(candidate.phones.map((phone) => phone.normalizedValue).filter(Boolean));
  const existingPhones = new Set(existing.phones.map((phone) => phone.normalizedValue).filter(Boolean));
  if ([...candidatePhones].some((phone) => existingPhones.has(phone))) return 80;
  const candidateName = contactDisplayName(candidate).trim().toLocaleLowerCase();
  const existingName = contactDisplayName(existing).trim().toLocaleLowerCase();
  return candidateName && candidateName === existingName ? 50 : 0;
}

export function ensureSinglePrimary<T extends { primary: boolean }>(values: T[]): T[] {
  if (values.length === 0) return [];
  const primaryIndex = values.findIndex((value) => value.primary);
  const selectedIndex = primaryIndex >= 0 ? primaryIndex : 0;
  return values.map((value, index) => ({ ...value, primary: index === selectedIndex }));
}

export function roleFromLegacyValue(value: string): ProjectContactRole {
  const normalized = value.trim().toLocaleLowerCase();
  const standardRole = ROLE_ALIASES[normalized];
  return standardRole
    ? { id: `role-${standardRole}`, role: standardRole }
    : { id: "role-custom", role: "custom", customLabel: value.trim() };
}

function overviewParticipantRows(project: Project): Participant[] {
  const valueFor = (item: Project["overviewSections"][number]["entries"][number]["items"][number], aliases: string[]) => (
    item.find((entry) => aliases.includes(entry.placeholderKey.toLocaleLowerCase()))?.value.trim() ?? ""
  );
  return project.overviewSections
    .filter((section) => legacyOverviewTemplateId(section) === "overview-template-participants")
    .flatMap((section) => section.entries)
    .filter((entry) => entry.type === "repeating_group")
    .flatMap((entry) => entry.items)
    .map((item, index) => {
      const name = valueFor(item, ["name"]);
      const company = valueFor(item, ["unternehmen", "company"]);
      const role = roleFromLegacyValue(valueFor(item, ["rolle", "role"]));
      return {
        id: `overview-participant-${project.id}-${index}`,
        role: role.role,
        customRole: role.customLabel,
        name,
        company,
        email: valueFor(item, ["e_mail", "email"]),
        phone: valueFor(item, ["telefon", "phone"]),
      };
    })
    .filter((participant) => Boolean(participant.name || participant.company || participant.email || participant.phone));
}

const PARTICIPANT_FIELD_KEYS = new Set(["name", "unternehmen", "company", "rolle", "role", "e_mail", "email", "telefon", "phone"]);

function legacyOverviewTemplateId(section: Project["overviewSections"][number]): string | undefined {
  return (section as Project["overviewSections"][number] & { templateId?: string }).templateId;
}

function participantSectionHasUnmigratedContent(project: Project, sectionId: string): boolean {
  const section = project.overviewSections.find((candidate) => candidate.id === sectionId);
  if (!section || legacyOverviewTemplateId(section) !== "overview-template-participants") return false;
  return section.entries.some((entry) => {
    if (entry.type !== "repeating_group") return Boolean(entry.value.trim() || entry.children.length || entry.items.length);
    return entry.items.some((item) => item.some((field) => !PARTICIPANT_FIELD_KEYS.has(field.placeholderKey.toLocaleLowerCase()) && Boolean(field.value.trim())));
  });
}

export interface LegacyContactMigrationResult {
  projects: Project[];
  contacts: Contact[];
  companies: Company[];
  affiliations: ContactCompanyAffiliation[];
  assignments: ProjectContactAssignment[];
}

function legacyParticipantKey(participant: Participant): string {
  const email = normalizeEmail(participant.email);
  if (email) return `email:${email}`;
  const phone = normalizePhone(participant.phone);
  if (phone) return `phone:${phone}`;
  return `name:${participant.name.trim().toLocaleLowerCase()}|${participant.company.trim().toLocaleLowerCase()}`;
}

function safeIdentifier(value: string): string {
  const normalized = value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || "record";
}

export function migrateLegacyProjectContacts(
  organizationId: string,
  projects: Project[],
  existingContacts: Contact[] = [],
  existingCompanies: Company[] = [],
  existingAffiliations: ContactCompanyAffiliation[] = [],
  existingAssignments: ProjectContactAssignment[] = [],
): LegacyContactMigrationResult {
  if (projects.every((project) => project.participants.length === 0 && overviewParticipantRows(project).length === 0)) {
    return { projects, contacts: existingContacts, companies: existingCompanies, affiliations: existingAffiliations, assignments: existingAssignments };
  }
  const contacts = [...existingContacts];
  const companies = [...existingCompanies];
  const affiliations = [...existingAffiliations];
  const assignments = [...existingAssignments];
  const contactByKey = new Map<string, Contact>();
  contacts.forEach((contact) => {
    contact.emails.forEach((email) => email.normalizedValue && contactByKey.set(`email:${email.normalizedValue}`, contact));
    contact.phones.forEach((phone) => phone.normalizedValue && contactByKey.set(`phone:${phone.normalizedValue}`, contact));
    const companyName = existingAffiliations
      .filter((affiliation) => affiliation.contactId === contact.id && affiliation.lifecycle === "active")
      .sort((left, right) => Number(right.primary) - Number(left.primary))
      .map((affiliation) => existingCompanies.find((company) => company.id === affiliation.companyId)?.name.trim().toLocaleLowerCase() ?? "")
      .find(Boolean) ?? "";
    contactByKey.set(`name:${contactDisplayName(contact).toLocaleLowerCase()}|${companyName}`, contact);
    contactByKey.set(`name:${contactDisplayName(contact).toLocaleLowerCase()}|`, contact);
  });
  const companyByName = new Map(companies.map((company) => [company.name.trim().toLocaleLowerCase(), company]));

  for (const project of projects) {
    const participants = [...project.participants, ...overviewParticipantRows(project)];
    const participantByKey = new Map<string, Participant>();
    participants.forEach((participant) => {
      const key = legacyParticipantKey(participant);
      const current = participantByKey.get(key);
      if (!current) participantByKey.set(key, participant);
      else if (current.role !== participant.role || current.customRole !== participant.customRole) {
        participantByKey.set(`${key}:role:${participant.role}:${participant.customRole ?? ""}`, participant);
      }
    });

    for (const participant of participantByKey.values()) {
      const key = legacyParticipantKey(participant);
      let contact = contactByKey.get(key);
      if (!contact) {
        const now = project.updatedAt || project.createdAt;
        const name = splitContactFullName(participant.name);
        contact = {
          id: `contact-${safeIdentifier(key)}`,
          organizationId,
          prefix: name.prefix,
          givenName: name.givenName,
          familyName: name.familyName,
          suffix: name.suffix,
          emails: participant.email.trim() ? [{ id: `email-${safeIdentifier(key)}`, type: "work", value: participant.email.trim(), normalizedValue: normalizeEmail(participant.email), primary: true }] : [],
          phones: participant.phone.trim() ? [{ id: `phone-${safeIdentifier(key)}`, type: "work", value: participant.phone.trim(), normalizedValue: normalizePhone(participant.phone), primary: true }] : [],
          addresses: [],
          notes: "",
          tags: [],
          lifecycle: "active",
          source: "migration",
          createdAt: project.createdAt,
          updatedAt: now,
        };
        contacts.push(contact);
        contactByKey.set(key, contact);
        contact.emails.forEach((email) => email.normalizedValue && contactByKey.set(`email:${email.normalizedValue}`, contact!));
        contact.phones.forEach((phone) => phone.normalizedValue && contactByKey.set(`phone:${phone.normalizedValue}`, contact!));
      }

      let company: Company | undefined;
      const companyName = participant.company.trim();
      if (companyName) {
        company = companyByName.get(companyName.toLocaleLowerCase());
        if (!company) {
          company = {
            id: `company-${safeIdentifier(companyName)}`,
            organizationId,
            name: companyName,
            website: "",
            domain: "",
            email: "",
            phone: "",
            notes: "",
            tags: [],
            lifecycle: "active",
            source: "migration",
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          };
          companies.push(company);
          companyByName.set(companyName.toLocaleLowerCase(), company);
        }
        if (!affiliations.some((affiliation) => affiliation.contactId === contact!.id && affiliation.companyId === company!.id)) {
          affiliations.push({
            id: `affiliation-${safeIdentifier(contact.id)}-${safeIdentifier(company.id)}`,
            organizationId,
            contactId: contact.id,
            companyId: company.id,
            jobTitle: "",
            department: "",
            primary: !affiliations.some((affiliation) => affiliation.contactId === contact!.id && affiliation.lifecycle === "active"),
            lifecycle: "active",
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          });
        }
      }

      let assignment = assignments.find((candidate) => candidate.projectId === project.id && candidate.contactId === contact!.id);
      const role: ProjectContactRole = {
        id: `role-${safeIdentifier(participant.role)}-${safeIdentifier(participant.customRole ?? participant.role)}`,
        role: participant.role,
        customLabel: participant.customRole,
      };
      if (!assignment) {
        assignment = {
          id: `assignment-${safeIdentifier(project.id)}-${safeIdentifier(contact.id)}`,
          organizationId,
          projectId: project.id,
          contactId: contact.id,
          roles: [role],
          lifecycle: "active",
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        };
        assignments.push(assignment);
      } else if (!assignment.roles.some((candidate) => candidate.role === role.role && candidate.customLabel === role.customLabel)) {
        assignment.roles.push(role);
      }
    }
  }

  return {
    projects: projects.map((project) => ({
      ...project,
      participants: [],
      overviewSections: project.overviewSections.filter((section) => (
        legacyOverviewTemplateId(section) !== "overview-template-participants" || participantSectionHasUnmigratedContent(project, section.id)
      )).map((section) => {
        if (legacyOverviewTemplateId(section) !== "overview-template-participants") return section;
        const detachedSection = { ...section } as Project["overviewSections"][number] & { templateId?: string };
        Reflect.deleteProperty(detachedSection, "templateId");
        return detachedSection;
      }),
    })),
    contacts,
    companies,
    affiliations,
    assignments,
  };
}
