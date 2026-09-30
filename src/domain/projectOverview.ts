import type { Locale, Project, ProjectOverviewEntry, ProjectOverviewSection } from "./types";
import { normalizeOverviewKey, type OverviewDropPosition } from "./overviewTemplates";

type CreateId = (prefix: string) => string;

interface ProjectOverviewEntryLocation {
  entry: ProjectOverviewEntry;
  parentId?: string;
  index: number;
}

function flattenProjectOverviewEntries(entries: ProjectOverviewEntry[], parentId?: string): ProjectOverviewEntryLocation[] {
  return entries.flatMap((entry, index) => [
    { entry, parentId, index },
    ...flattenProjectOverviewEntries(entry.children, entry.id),
  ]);
}

function removeProjectOverviewEntry(
  entries: ProjectOverviewEntry[],
  entryId: string,
): { entries: ProjectOverviewEntry[]; removed?: ProjectOverviewEntry } {
  const directIndex = entries.findIndex((entry) => entry.id === entryId);
  if (directIndex >= 0) return { entries: entries.filter((entry) => entry.id !== entryId), removed: entries[directIndex] };
  for (const entry of entries) {
    const nested = removeProjectOverviewEntry(entry.children, entryId);
    if (!nested.removed) continue;
    return {
      entries: entries.map((candidate) => candidate.id === entry.id ? { ...candidate, children: nested.entries } : candidate),
      removed: nested.removed,
    };
  }
  return { entries };
}

function insertProjectOverviewEntry(
  entries: ProjectOverviewEntry[],
  parentId: string | undefined,
  index: number,
  entry: ProjectOverviewEntry,
): ProjectOverviewEntry[] {
  if (!parentId) {
    const next = [...entries];
    next.splice(index, 0, entry);
    return next;
  }
  return entries.map((candidate) => candidate.id === parentId
    ? { ...candidate, children: insertProjectOverviewEntry(candidate.children, undefined, index, entry) }
    : { ...candidate, children: insertProjectOverviewEntry(candidate.children, parentId, index, entry) });
}

function synchronizeEntryOrder(structure: ProjectOverviewEntry, valueEntry?: ProjectOverviewEntry): ProjectOverviewEntry {
  return {
    ...structure,
    id: valueEntry?.id ?? structure.id,
    value: valueEntry?.value ?? "",
    children: structure.children.map((child) => synchronizeEntryOrder(
      child,
      valueEntry?.children.find((candidate) => candidate.placeholderKey === child.placeholderKey),
    )),
    items: structure.type === "repeating_group"
      ? structure.items.map((item) => structure.children.map((child) => synchronizeEntryOrder(
        child,
        item.find((candidate) => candidate.placeholderKey === child.placeholderKey),
      )))
      : [],
  };
}

function synchronizeRepeatingEntryOrder(entries: ProjectOverviewEntry[]): ProjectOverviewEntry[] {
  return entries.map((entry) => {
    const children = synchronizeRepeatingEntryOrder(entry.children);
    const next = { ...entry, children };
    return entry.type === "repeating_group" ? synchronizeEntryOrder(next, next) : next;
  });
}

export function moveProjectOverviewEntry(
  entries: ProjectOverviewEntry[],
  activeId: string,
  targetId: string,
  position: OverviewDropPosition,
): { entries: ProjectOverviewEntry[]; moved: boolean } {
  if (activeId === targetId) return { entries, moved: false };
  const locations = flattenProjectOverviewEntries(entries);
  const active = locations.find((location) => location.entry.id === activeId);
  const target = locations.find((location) => location.entry.id === targetId);
  if (!active || !target) return { entries, moved: false };
  const descendantIds = new Set(flattenProjectOverviewEntries(active.entry.children).map(({ entry }) => entry.id));
  if (descendantIds.has(targetId)) return { entries, moved: false };
  if (position === "inside" && target.entry.type !== "group" && target.entry.type !== "repeating_group") {
    return { entries, moved: false };
  }

  const removed = removeProjectOverviewEntry(entries, activeId);
  if (!removed.removed) return { entries, moved: false };
  const remainingTarget = flattenProjectOverviewEntries(removed.entries).find((location) => location.entry.id === targetId);
  if (!remainingTarget) return { entries, moved: false };
  const destinationParentId = position === "inside" ? targetId : remainingTarget.parentId;
  const destinationIndex = position === "inside"
    ? remainingTarget.entry.children.length
    : remainingTarget.index + (position === "after" ? 1 : 0);
  return {
    entries: synchronizeRepeatingEntryOrder(insertProjectOverviewEntry(
      removed.entries,
      destinationParentId,
      destinationIndex,
      removed.removed,
    )),
    moved: true,
  };
}

export function moveProjectOverviewRecord(
  items: ProjectOverviewEntry[][],
  activeIndex: number,
  targetIndex: number,
  position: "before" | "after",
): ProjectOverviewEntry[][] {
  if (activeIndex < 0 || activeIndex >= items.length || targetIndex < 0 || targetIndex >= items.length) return items;
  const next = [...items];
  const [record] = next.splice(activeIndex, 1);
  const adjustedTarget = targetIndex > activeIndex ? targetIndex - 1 : targetIndex;
  const destination = adjustedTarget + (position === "after" ? 1 : 0);
  if (destination === activeIndex) return items;
  next.splice(destination, 0, record);
  return next;
}

function textEntry(createId: CreateId, label: string, value = ""): ProjectOverviewEntry {
  return { id: createId("overview-entry"), label, placeholderKey: normalizeOverviewKey(label), type: "text", value, children: [], items: [] };
}

function dateEntry(createId: CreateId, label: string, value = ""): ProjectOverviewEntry {
  return { ...textEntry(createId, label, value), type: "date" };
}

function groupEntry(createId: CreateId, label: string, children: ProjectOverviewEntry[]): ProjectOverviewEntry {
  return { id: createId("overview-entry"), label, placeholderKey: normalizeOverviewKey(label), type: "group", value: "", children, items: [] };
}

function repeatingEntry(createId: CreateId, label: string, itemLabels: string[], items: string[][]): ProjectOverviewEntry {
  const children = itemLabels.map((itemLabel) => textEntry(createId, itemLabel));
  return {
    id: createId("overview-entry"),
    label,
    placeholderKey: normalizeOverviewKey(label),
    type: "repeating_group",
    value: "",
    children,
    items: items.map((values) => itemLabels.map((itemLabel, index) => textEntry(createId, itemLabel, values[index] ?? ""))),
  };
}

/** Converts fixed legacy project data into the same flexible sections used by new projects. */
export function legacyProjectOverviewSections(project: Project, createId: CreateId, locale: Locale): ProjectOverviewSection[] {
  const german = locale === "de";
  const generalEntries: ProjectOverviewEntry[] = [];
  if (project.description) generalEntries.push(textEntry(createId, german ? "Kurzbeschreibung" : "Short description", project.description));
  if (project.address || project.city) generalEntries.push(groupEntry(createId, german ? "Projektadresse" : "Project address", [
    textEntry(createId, german ? "Straße" : "Street", project.address ?? ""),
    textEntry(createId, german ? "Ort" : "City", project.city ?? ""),
  ]));
  if (project.startDate) generalEntries.push(dateEntry(createId, german ? "Geplanter Beginn" : "Planned start", project.startDate));
  if (project.endDate) generalEntries.push(dateEntry(createId, german ? "Geplantes Ende" : "Planned end", project.endDate));
  generalEntries.push(...project.customFields.map((field) => textEntry(createId, field.key, field.value)));

  const sections: ProjectOverviewSection[] = [];
  if (generalEntries.length) sections.push({
    id: createId("overview-section"),
    name: german ? "Allgemein" : "Project information",
    placeholderKey: german ? "allgemein" : "project_information",
    entries: generalEntries,
  });
  if (project.emergencyContacts.length) sections.push({
    id: createId("overview-section"),
    name: german ? "Notfallkontakte" : "Emergency contacts",
    placeholderKey: german ? "notfallkontakte" : "emergency_contacts",
    entries: [repeatingEntry(
      createId,
      german ? "Kontakte" : "Contacts",
      german ? ["Bezeichnung", "Ansprechpartner", "Telefon"] : ["Label", "Contact", "Phone"],
      project.emergencyContacts.map((contact) => [contact.label, contact.name, contact.phone]),
    )],
  });
  if (project.participants.length) sections.push({
    id: createId("overview-section"),
    name: german ? "Projektbeteiligte" : "Project participants",
    placeholderKey: german ? "projektbeteiligte" : "project_participants",
    entries: [repeatingEntry(
      createId,
      german ? "Beteiligte" : "Participants",
      german ? ["Name", "Unternehmen", "Rolle", "E-Mail", "Telefon"] : ["Name", "Company", "Role", "Email", "Phone"],
      project.participants.map((participant) => [participant.name, participant.company, participant.role, participant.email, participant.phone]),
    )],
  });
  sections.push(...project.customSections.map((section) => ({
    id: createId("overview-section"),
    name: section.title,
    placeholderKey: section.placeholderKey,
    entries: section.fields.map((field) => textEntry(createId, field.key, field.value)),
  })));
  return sections;
}
