import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import {
  contactDisplayName,
  contactDuplicateScore,
  migrateLegacyProjectContacts,
  migrateProjectRoleCatalog,
  normalizeEmail,
  normalizePhone,
  projectContactRoleLabel,
  projectContactRoleFromKey,
  projectRoleDefinitionsForProject,
  resolveProjectParticipants,
} from "./contacts";
import type { Contact, Participant } from "./types";
import { instantiateOverviewSection } from "./overviewTemplates";

function contact(id: string, email: string, phone = ""): Contact {
  return {
    id, organizationId: "organization-demo", prefix: "", givenName: "Ada", familyName: "Lovelace", suffix: "", displayName: "",
    emails: email ? [{ id: `${id}-email`, type: "work", value: email, normalizedValue: normalizeEmail(email), primary: true }] : [],
    phones: phone ? [{ id: `${id}-phone`, type: "mobile", value: phone, normalizedValue: normalizePhone(phone), primary: true }] : [],
    addresses: [], notes: "", tags: [], lifecycle: "active", source: "manual", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("contacts", () => {
  it("normalizes duplicate identities conservatively", () => {
    expect(normalizeEmail(" Ada@Example.COM ")).toBe("ada@example.com");
    expect(normalizePhone("+49 (170) 123-456")).toBe("+49170123456");
    expect(contactDuplicateScore(contact("one", "ada@example.com"), contact("two", "ADA@example.com"))).toBe(100);
    expect(contactDuplicateScore(contact("one", "", "+49 170 123456"), contact("two", "", "+49 (170) 123456"))).toBe(80);
  });

  it("migrates embedded participants once and derives project participants from assignments", () => {
    const database = createSeedDatabase();
    const project = structuredClone(database.projects[0]);
    const legacyParticipant: Participant = {
      id: "legacy-person", role: "coordinator", company: "Safety GmbH", name: "Ada Lovelace", email: "ada@example.com", phone: "+49 170 123456",
    };
    project.participants = [legacyParticipant];
    const migrated = migrateLegacyProjectContacts(database.organization.id, [project]);
    const migratedDatabase = {
      ...database,
      projects: migrated.projects,
      contacts: migrated.contacts,
      companies: migrated.companies,
      contactAffiliations: migrated.affiliations,
      projectContactAssignments: migrated.assignments,
    };

    expect(migrated.projects[0].participants).toEqual([]);
    expect(migrated.contacts).toHaveLength(1);
    expect(migrated.companies).toHaveLength(1);
    expect(resolveProjectParticipants(migratedDatabase, project.id)).toEqual([expect.objectContaining({ name: "Ada Lovelace", role: "coordinator", company: "Safety GmbH" })]);

    const repeated = migrateLegacyProjectContacts(database.organization.id, migrated.projects, migrated.contacts, migrated.companies, migrated.affiliations, migrated.assignments);
    expect(repeated.assignments).toHaveLength(1);
    expect(repeated.contacts).toHaveLength(1);
  });

  it("migrates projects incrementally and preserves non-standard participant overview values", () => {
    const database = createSeedDatabase();
    const firstProject = structuredClone(database.projects[0]);
    const secondProject = { ...structuredClone(firstProject), id: "project-two", participants: [{
      id: "legacy-two", role: "contractor" as const, company: "Builders GmbH", name: "Lin Chen", email: "lin@example.com", phone: "",
    }] };
    let idSequence = 0;
    const participantTemplate = database.overviewTemplates.find((template) => template.id === "overview-template-participants")!;
    const participantSection = instantiateOverviewSection(participantTemplate, (prefix) => `${prefix}-${idSequence += 1}`, "en");
    (participantSection as typeof participantSection & { templateId?: string }).templateId = "overview-template-participants";
    participantSection.entries[0].items[0].find((entry) => entry.placeholderKey === "name")!.value = "Custom Person";
    participantSection.entries[0].items[0].push({
      id: "custom-license", label: "License", placeholderKey: "license", type: "text", value: "LIC-42", children: [], items: [],
    });
    firstProject.overviewSections.push(participantSection);
    const migrated = migrateLegacyProjectContacts(
      database.organization.id,
      [firstProject, secondProject],
      database.contacts,
      database.companies,
      database.contactAffiliations,
      database.projectContactAssignments,
    );

    expect(migrated.assignments.some((assignment) => assignment.projectId === secondProject.id)).toBe(true);
    expect(migrated.projects[0].overviewSections.flatMap((section) => section.entries).flatMap((entry) => entry.items).flat().some((entry) => entry.value === "LIC-42")).toBe(true);
    expect((migrated.projects[0].overviewSections.find((section) => section.id === participantSection?.id) as { templateId?: string } | undefined)?.templateId).toBeUndefined();
  });

  it("migrates repeated custom labels into one reusable organization role", () => {
    const database = createSeedDatabase();
    const assignment = structuredClone(database.projectContactAssignments[0]);
    assignment.roles = [
      { id: "role-fire-one", role: "custom", customLabel: "Fire lead" },
      { id: "role-fire-two", role: "custom", customLabel: "Fire lead" },
    ];

    const migrated = migrateProjectRoleCatalog(database.organization.id, [], [assignment]);
    const definition = migrated.definitions[0];
    const migratedRoles = migrated.assignments[0].roles;
    const migratedDatabase = { ...database, projectRoleDefinitions: migrated.definitions };

    expect(migrated.definitions).toEqual([expect.objectContaining({ name: "Fire lead", lifecycle: "active" })]);
    expect(migratedRoles).toHaveLength(1);
    expect(migratedRoles.every((role) => role.roleDefinitionId === definition.id)).toBe(true);
    expect(projectContactRoleLabel(migratedDatabase, migratedRoles[0])).toBe("Fire lead");
  });

  it("exposes reusable roles everywhere and project roles only inside their project", () => {
    const database = createSeedDatabase();
    const firstProjectId = database.projects[0].id;
    database.projectRoleDefinitions.push(
      { id: "role-reusable", organizationId: database.organization.id, name: "Reusable", lifecycle: "active", sortOrder: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      { id: "role-project", organizationId: database.organization.id, projectId: firstProjectId, name: "Project only", lifecycle: "active", sortOrder: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    );

    expect(projectRoleDefinitionsForProject(database, firstProjectId).map((definition) => definition.id)).toEqual(["role-reusable", "role-project"]);
    expect(projectRoleDefinitionsForProject(database, "another-project").map((definition) => definition.id)).toEqual(["role-reusable"]);
    expect(projectContactRoleFromKey(database, "custom:role-project", "assignment-role", firstProjectId)).toMatchObject({ roleDefinitionId: "role-project" });
    expect(projectContactRoleFromKey(database, "custom:role-project", "assignment-role", "another-project")).toBeUndefined();
  });

  it("keeps a roleless project assignment visible as one participant", () => {
    const database = createSeedDatabase();
    const assignment = database.projectContactAssignments[0];
    const contact = database.contacts.find((candidate) => candidate.id === assignment.contactId)!;
    assignment.roles = [];

    const participants = resolveProjectParticipants(database, assignment.projectId)
      .filter((participant) => participant.id.startsWith(`${assignment.id}:`));

    expect(participants).toEqual([
      expect.objectContaining({ name: contactDisplayName(contact), customRole: "" }),
    ]);
  });
});
