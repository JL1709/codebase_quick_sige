import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contactsRepositorySnapshot, type AppRepository } from "../data/localRepository";
import { createSeedDatabase } from "../data/seed";
import type { AppDatabase, Contact } from "../domain/types";
import { AppProvider, useApp } from "./AppProvider";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function createMemoryRepository(initialDatabase: AppDatabase) {
  let database = structuredClone(initialDatabase);
  const repository: AppRepository = {
    load: () => database,
    save: (nextDatabase) => { database = structuredClone(nextDatabase); },
    loadContacts: () => structuredClone(contactsRepositorySnapshot(database)),
    saveContacts: (snapshot) => { database = { ...database, ...structuredClone(snapshot) }; },
    reset: () => database,
    hasBackup: () => false,
    restoreBackup: () => database,
    exportBackup: () => null,
    getMigrationError: () => null,
  };
  return { repository, current: () => database };
}

function ContactImportHarness() {
  const {
    assignContactsToProject, commitContactImport, createProject, database, deleteCompany, deleteContact,
    mergeCompanies, mergeContacts, saveContact, tagContacts, undoContactImportBatch,
  } = useApp();
  const importedContact = database.contacts.find((contact) => contact.tags.includes("provider-fixture"));
  const assignedContact = database.contacts.find((contact) => database.projectContactAssignments.some((assignment) => assignment.contactId === contact.id));
  const survivingCompany = database.companies.find((company) => company.tags.includes("merge-survivor"));
  const mergedCompany = database.companies.find((company) => company.tags.includes("merge-source"));
  const latestBatch = database.contactImportBatches[0];
  const deletableContact = database.contacts.find((contact) => contact.tags.includes("delete-fixture"));
  const deletableCompany = database.companies.find((company) => company.tags.includes("delete-fixture"));
  const mergeSurvivor = database.contacts.find((contact) => contact.tags.includes("contact-merge-survivor"));
  const mergeSource = database.contacts.find((contact) => contact.tags.includes("contact-merge-source"));
  return <>
    <button type="button" onClick={() => commitContactImport({
      source: "microsoft",
      sourceLabel: "Microsoft Outlook",
      decisions: [{
        action: "create",
        candidate: {
          sourceKey: "provider-contact-1", prefix: "", givenName: "Grace", familyName: "Hopper", suffix: "", displayName: "Grace Hopper",
          companyName: "Navy", jobTitle: "Engineer", department: "Computing",
          emails: [{ value: "grace@example.com", type: "work", primary: true }], phones: [], addresses: [], notes: "", tags: ["provider-fixture"], warnings: [],
          externalIdentity: { provider: "microsoft", providerAccountId: "test-account", externalContactId: "provider-contact-1" },
        },
      }],
    })}>Import</button>
    <button type="button" disabled={!importedContact} onClick={() => importedContact && saveContact({ ...importedContact, notes: "Edited after import" } as Contact)}>Edit imported</button>
    <button type="button" disabled={!latestBatch} onClick={() => latestBatch && undoContactImportBatch(latestBatch.id)}>Undo import</button>
    <button type="button" disabled={!survivingCompany || !mergedCompany} onClick={() => survivingCompany && mergedCompany && mergeCompanies(survivingCompany.id, mergedCompany.id)}>Merge companies</button>
    <button type="button" disabled={!database.contacts[0]} onClick={() => database.contacts[0] && createProject({ name: "Contact project", overviewSections: [] }, [{ contactId: database.contacts[0].id, roles: [{ role: "architect" }, { role: "custom", customLabel: "Fire lead" }] }])}>Create contact project</button>
    <button type="button" disabled={!assignedContact} onClick={() => assignedContact && saveContact({ ...assignedContact, displayName: "Updated project contact" })}>Edit project contact</button>
    <button type="button" onClick={() => tagContacts(database.contacts.slice(0, 2).map((contact) => contact.id), "Bulk tag")}>Bulk tag</button>
    <button type="button" onClick={() => assignContactsToProject(database.contacts.slice(0, 2).map((contact) => contact.id), database.projects[0].id, "planner")}>Bulk assign</button>
    <button type="button" disabled={!deletableContact} onClick={() => deletableContact && deleteContact(deletableContact.id)}>Delete contact</button>
    <button type="button" disabled={!deletableCompany} onClick={() => deletableCompany && deleteCompany(deletableCompany.id)}>Delete company</button>
    <button type="button" disabled={!mergeSurvivor || !mergeSource} onClick={() => mergeSurvivor && mergeSource && mergeContacts(mergeSurvivor.id, mergeSource.id, { displayName: mergeSource.displayName, notes: mergeSurvivor.notes })}>Merge contacts</button>
    <output data-testid="contact-present">{String(Boolean(importedContact))}</output>
    <output data-testid="batch-status">{latestBatch?.status ?? "none"}</output>
  </>;
}

function renderHarness(database: AppDatabase) {
  const memory = createMemoryRepository(database);
  render(<AppProvider repository={memory.repository}><ContactImportHarness /></AppProvider>);
  return memory;
}

describe("Contacts application use cases", () => {
  it("undoes a completed import without leaving created contacts or related records", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));
    const memory = renderHarness(createSeedDatabase());

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByTestId("contact-present")).toHaveTextContent("true");
    const importedContactId = memory.current().contacts.find((contact) => contact.tags.includes("provider-fixture"))!.id;
    expect(memory.current().externalContactIdentities.some((identity) => identity.externalContactId === "provider-contact-1")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Undo import" }));

    expect(screen.getByTestId("contact-present")).toHaveTextContent("false");
    expect(screen.getByTestId("batch-status")).toHaveTextContent("undone");
    expect(memory.current().externalContactIdentities.some((identity) => identity.externalContactId === "provider-contact-1")).toBe(false);
    expect(memory.current().contactAffiliations.some((affiliation) => affiliation.contactId === importedContactId)).toBe(false);
  });

  it("keeps later edits and reports an undo conflict instead of erasing newer work", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));
    const memory = renderHarness(createSeedDatabase());
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    vi.setSystemTime(new Date("2026-09-29T12:01:00.000Z"));
    fireEvent.click(screen.getByRole("button", { name: "Edit imported" }));

    fireEvent.click(screen.getByRole("button", { name: "Undo import" }));

    expect(screen.getByTestId("contact-present")).toHaveTextContent("true");
    expect(screen.getByTestId("batch-status")).toHaveTextContent("partially_undone");
    expect(memory.current().contacts.find((contact) => contact.tags.includes("provider-fixture"))?.notes).toBe("Edited after import");
  });

  it("keeps viewers read-only at the use-case boundary", () => {
    const database = createSeedDatabase();
    database.user.role = "viewer";
    const memory = renderHarness(database);

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(screen.getByTestId("contact-present")).toHaveTextContent("false");
    expect(memory.current().contacts.some((contact) => contact.tags.includes("provider-fixture"))).toBe(false);
  });

  it("merges companies atomically and rewires affiliations and project context", () => {
    const database = createSeedDatabase();
    const contact = database.contacts[0];
    const project = database.projects[0];
    const now = "2026-09-29T12:00:00.000Z";
    database.companies.push(
      { id: "company-survivor", organizationId: database.organization.id, name: "Kept GmbH", website: "", domain: "", email: "kept@example.com", phone: "", notes: "", tags: ["merge-survivor"], lifecycle: "active", source: "manual", createdAt: now, updatedAt: now },
      { id: "company-source", organizationId: database.organization.id, name: "Merged GmbH", website: "https://merged.example", domain: "merged.example", email: "", phone: "+49 1", notes: "History", tags: ["merge-source"], lifecycle: "active", source: "manual", createdAt: now, updatedAt: now },
    );
    database.contactAffiliations.push(
      { id: "affiliation-survivor", organizationId: database.organization.id, contactId: contact.id, companyId: "company-survivor", jobTitle: "", department: "Planning", primary: true, lifecycle: "active", createdAt: now, updatedAt: now },
      { id: "affiliation-source", organizationId: database.organization.id, contactId: contact.id, companyId: "company-source", jobTitle: "Architect", department: "", primary: false, lifecycle: "active", createdAt: now, updatedAt: now },
    );
    database.projectContactAssignments.push({
      id: "assignment-company-source", organizationId: database.organization.id, projectId: project.id, contactId: contact.id, companyId: "company-source",
      roles: [{ id: "role-company-source", role: "architect" }], lifecycle: "active", createdAt: now, updatedAt: now,
    });
    const memory = renderHarness(database);

    fireEvent.click(screen.getByRole("button", { name: "Merge companies" }));

    const saved = memory.current();
    expect(saved.companies.find((company) => company.id === "company-source")).toMatchObject({ lifecycle: "archived", mergedIntoId: "company-survivor" });
    expect(saved.companies.find((company) => company.id === "company-survivor")).toMatchObject({ website: "https://merged.example", email: "kept@example.com", phone: "+49 1" });
    expect(saved.contactAffiliations.filter((affiliation) => affiliation.contactId === contact.id && affiliation.companyId === "company-survivor")).toEqual([
      expect.objectContaining({ jobTitle: "Architect", department: "Planning", primary: true }),
    ]);
    expect(saved.projectContactAssignments.find((assignment) => assignment.id === "assignment-company-source")?.companyId).toBe("company-survivor");
    expect(saved.auditEvents.at(-1)?.action).toBe("company.merged");
  });

  it("creates a project and its multi-role contact assignment in one commit", () => {
    const memory = renderHarness(createSeedDatabase());

    fireEvent.click(screen.getByRole("button", { name: "Create contact project" }));

    const project = memory.current().projects.find((candidate) => candidate.name === "Contact project");
    const assignment = memory.current().projectContactAssignments.find((candidate) => candidate.projectId === project?.id);
    expect(project).toBeDefined();
    expect(assignment?.roles).toEqual([
      expect.objectContaining({ role: "architect" }),
      expect.objectContaining({ role: "custom", customLabel: "Fire lead" }),
    ]);
    expect(memory.current().auditEvents.some((event) => event.projectId === project?.id && event.action === "project_contact.created")).toBe(true);
  });

  it("marks current project outputs stale when a canonical contact changes", () => {
    const database = createSeedDatabase();
    const assignment = database.projectContactAssignments[0];
    const project = database.projects.find((candidate) => candidate.id === assignment.projectId)!;
    const plan = database.plans.find((candidate) => candidate.projectId === project.id)!;
    plan.status = "published";
    database.generatedDocuments.push({
      id: "generated-contact-fixture", projectId: project.id, documentType: "a4_plan", templateId: "standard-a4_plan-en", templateRevision: 1,
      filename: "contact-fixture.docx", blobId: "blob-contact-fixture", projectSnapshot: structuredClone(project), planSnapshot: structuredClone(plan),
      language: "en", generatedAt: "2026-09-29T12:00:00.000Z", dependencyFingerprint: "before-contact-edit", stale: false,
    });
    const memory = renderHarness(database);

    fireEvent.click(screen.getByRole("button", { name: "Edit project contact" }));

    expect(memory.current().plans.find((candidate) => candidate.id === plan.id)?.status).toBe("draft");
    expect(memory.current().generatedDocuments.find((document) => document.id === "generated-contact-fixture")?.stale).toBe(true);
  });

  it("applies bulk tags and project assignments in permissioned use cases", () => {
    const database = createSeedDatabase();
    const contactIds = database.contacts.slice(0, 2).map((contact) => contact.id);
    const projectId = database.projects[0].id;
    const memory = renderHarness(database);

    fireEvent.click(screen.getByRole("button", { name: "Bulk tag" }));
    fireEvent.click(screen.getByRole("button", { name: "Bulk assign" }));

    expect(memory.current().contacts.filter((contact) => contactIds.includes(contact.id)).every((contact) => contact.tags.includes("Bulk tag"))).toBe(true);
    expect(contactIds.every((contactId) => memory.current().projectContactAssignments.some((assignment) => assignment.projectId === projectId && assignment.contactId === contactId && assignment.roles.some((role) => role.role === "planner")))).toBe(true);
    expect(memory.current().auditEvents.some((event) => event.action === "project_contacts.bulk_assigned")).toBe(true);
  });

  it("hard-deletes only archived records without protected references", () => {
    const database = createSeedDatabase();
    const now = "2026-09-29T12:00:00.000Z";
    const contact = { ...structuredClone(database.contacts[0]), id: "contact-delete-fixture", displayName: "Delete Fixture", tags: ["delete-fixture"], lifecycle: "archived" as const, createdAt: now, updatedAt: now };
    const company = { ...structuredClone(database.companies[0]), id: "company-delete-fixture", name: "Delete Fixture GmbH", tags: ["delete-fixture"], lifecycle: "archived" as const, createdAt: now, updatedAt: now };
    database.contacts.push(contact);
    database.companies.push(company);
    const memory = renderHarness(database);

    fireEvent.click(screen.getByRole("button", { name: "Delete contact" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete company" }));

    expect(memory.current().contacts.some((candidate) => candidate.id === contact.id)).toBe(false);
    expect(memory.current().companies.some((candidate) => candidate.id === company.id)).toBe(false);
    expect(memory.current().auditEvents.slice(-2).map((event) => event.action)).toEqual(["contact.deleted", "company.deleted"]);
  });

  it("uses explicit field choices while merging contacts and keeps a redirect", () => {
    const database = createSeedDatabase();
    const now = "2026-09-29T12:00:00.000Z";
    database.contacts.push(
      { ...structuredClone(database.contacts[0]), id: "contact-merge-survivor", displayName: "Kept Name", notes: "Kept notes", tags: ["contact-merge-survivor"], emails: [], phones: [], addresses: [], createdAt: now, updatedAt: now },
      { ...structuredClone(database.contacts[0]), id: "contact-merge-source", displayName: "Chosen Name", notes: "Source notes", tags: ["contact-merge-source"], emails: [], phones: [], addresses: [], createdAt: now, updatedAt: now },
    );
    const memory = renderHarness(database);

    fireEvent.click(screen.getByRole("button", { name: "Merge contacts" }));

    expect(memory.current().contacts.find((contact) => contact.id === "contact-merge-survivor")).toMatchObject({ displayName: "Chosen Name", notes: "Kept notes" });
    expect(memory.current().contacts.find((contact) => contact.id === "contact-merge-source")).toMatchObject({ lifecycle: "archived", mergedIntoId: "contact-merge-survivor" });
  });
});
