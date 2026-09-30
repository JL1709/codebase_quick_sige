import type {
  Locale,
  OverviewTemplate,
  OverviewTemplateEntry,
  ProjectOverviewEntry,
  ProjectOverviewSection,
} from "./types";

export type OverviewDropPosition = "before" | "inside" | "after";

export interface OverviewEntryLocation {
  entry: OverviewTemplateEntry;
  parentId?: string;
  index: number;
  ancestors: OverviewTemplateEntry[];
}

export interface OverviewTemplateValidation {
  valid: boolean;
  nameConflict: boolean;
  invalidEntryIds: Set<string>;
}

const LEGACY_OVERVIEW_TEMPLATE_LOCALE: Locale = "de";

function templateSourceLocale(template: OverviewTemplate): Locale {
  return template.sourceLocale ?? LEGACY_OVERVIEW_TEMPLATE_LOCALE;
}

export function overviewTemplateName(template: OverviewTemplate, locale: Locale): string {
  return template.translations?.[locale]?.name ?? template.name;
}

function localizedEntry(entry: OverviewTemplateEntry, locale: Locale): OverviewTemplateEntry {
  const localizedContent = entry.translations?.[locale];
  return {
    ...entry,
    label: localizedContent?.label ?? entry.label,
    defaultValue: localizedContent?.defaultValue ?? entry.defaultValue,
    children: entry.children.map((child) => localizedEntry(child, locale)),
  };
}

export function localizeOverviewTemplate(template: OverviewTemplate, locale: Locale): OverviewTemplate {
  return {
    ...structuredClone(template),
    sourceLocale: templateSourceLocale(template),
    name: overviewTemplateName(template, locale),
    entries: template.entries.map((entry) => localizedEntry(entry, locale)),
  };
}

function mergeEntryLocale(
  originalEntry: OverviewTemplateEntry | undefined,
  editedEntry: OverviewTemplateEntry,
  locale: Locale,
  sourceLocale: Locale,
): OverviewTemplateEntry {
  const baseEntry = originalEntry ?? editedEntry;
  const translations = {
    ...baseEntry.translations,
    [locale]: {
      label: editedEntry.label,
      defaultValue: editedEntry.defaultValue,
    },
  };
  return {
    ...baseEntry,
    id: editedEntry.id,
    type: editedEntry.type,
    label: locale === sourceLocale ? editedEntry.label : baseEntry.label,
    defaultValue: locale === sourceLocale ? editedEntry.defaultValue : baseEntry.defaultValue,
    translations,
    children: editedEntry.children.map((child) => mergeEntryLocale(
      originalEntry?.children.find((candidate) => candidate.id === child.id),
      child,
      locale,
      sourceLocale,
    )),
  };
}

export function mergeOverviewTemplateLocale(
  originalTemplate: OverviewTemplate | null,
  editedTemplate: OverviewTemplate,
  locale: Locale,
): OverviewTemplate {
  const sourceLocale = originalTemplate ? templateSourceLocale(originalTemplate) : locale;
  const baseTemplate = originalTemplate ?? editedTemplate;
  return {
    ...baseTemplate,
    id: editedTemplate.id,
    organizationId: editedTemplate.organizationId,
    sourceLocale,
    name: locale === sourceLocale ? editedTemplate.name : baseTemplate.name,
    translations: {
      ...baseTemplate.translations,
      [locale]: { name: editedTemplate.name },
    },
    entries: editedTemplate.entries.map((entry) => mergeEntryLocale(
      originalTemplate?.entries.find((candidate) => candidate.id === entry.id),
      entry,
      locale,
      sourceLocale,
    )),
    createdAt: editedTemplate.createdAt,
    updatedAt: editedTemplate.updatedAt,
  };
}

export function normalizeOverviewKey(value: string, fallback = "field"): string {
  const transliterated = value
    .replaceAll("Ä", "Ae")
    .replaceAll("Ö", "Oe")
    .replaceAll("Ü", "Ue")
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");
  const normalized = transliterated
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function flattenOverviewEntries(entries: OverviewTemplateEntry[]): OverviewEntryLocation[] {
  const result: OverviewEntryLocation[] = [];
  const visit = (siblings: OverviewTemplateEntry[], parentId: string | undefined, ancestors: OverviewTemplateEntry[]) => {
    siblings.forEach((entry, index) => {
      result.push({ entry, parentId, index, ancestors });
      visit(entry.children, entry.id, [...ancestors, entry]);
    });
  };
  visit(entries, undefined, []);
  return result;
}

export function countOverviewEntries(entries: OverviewTemplateEntry[]): number {
  return flattenOverviewEntries(entries).length;
}

export function overviewEntryPath(templateName: string, entryId: string, entries: OverviewTemplateEntry[]): string {
  const location = flattenOverviewEntries(entries).find((candidate) => candidate.entry.id === entryId);
  if (!location) return normalizeOverviewKey(templateName, "template");
  return [templateName, ...location.ancestors.map((entry) => entry.label), location.entry.label]
    .map((part, index) => normalizeOverviewKey(part, index === 0 ? "template" : "field"))
    .join(".");
}

function entryExpression(template: OverviewTemplate, location: OverviewEntryLocation): string {
  const repeatingAncestorIndex = location.ancestors.map((entry) => entry.type).lastIndexOf("repeating_group");
  if (repeatingAncestorIndex < 0) return `qs.overview.${overviewEntryPath(template.name, location.entry.id, template.entries)}`;
  const repeatingAncestor = location.ancestors[repeatingAncestorIndex];
  const relativeParts = [...location.ancestors.slice(repeatingAncestorIndex + 1).map((entry) => entry.label), location.entry.label]
    .map((part) => normalizeOverviewKey(part));
  return `qs.${normalizeOverviewKey(repeatingAncestor.label)}.${relativeParts.join(".")}`;
}

export function overviewEntryClipboardValue(template: OverviewTemplate, entryId: string): string {
  const location = flattenOverviewEntries(template.entries).find((candidate) => candidate.entry.id === entryId);
  if (!location) return "";
  const expression = entryExpression(template, location);
  if (location.entry.type === "repeating_group") {
    return `{{#${expression}}}\n{{/${expression}}}`;
  }
  if (location.entry.type === "group") return expression;
  return `{{${expression}}}`;
}

export function validateOverviewTemplate(
  template: OverviewTemplate,
  templates: OverviewTemplate[],
): OverviewTemplateValidation {
  const normalizedName = normalizeOverviewKey(template.name, "");
  const nameConflict = normalizedName.length === 0 || templates.some((candidate) => (
    candidate.id !== template.id && normalizeOverviewKey(candidate.name, "") === normalizedName
  ));
  const locations = flattenOverviewEntries(template.entries);
  const labelCounts = new Map<string, number>();
  locations.forEach(({ entry }) => {
    const key = normalizeOverviewKey(entry.label, "");
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  });
  const invalidEntryIds = new Set(locations.filter(({ entry }) => {
    const key = normalizeOverviewKey(entry.label, "");
    return key.length === 0 || (labelCounts.get(key) ?? 0) > 1;
  }).map(({ entry }) => entry.id));
  return { valid: !nameConflict && invalidEntryIds.size === 0, nameConflict, invalidEntryIds };
}

function removeEntry(entries: OverviewTemplateEntry[], entryId: string): { entries: OverviewTemplateEntry[]; removed?: OverviewTemplateEntry; parentId?: string } {
  const directIndex = entries.findIndex((entry) => entry.id === entryId);
  if (directIndex >= 0) return { entries: entries.filter((entry) => entry.id !== entryId), removed: entries[directIndex] };
  for (const entry of entries) {
    const nested = removeEntry(entry.children, entryId);
    if (!nested.removed) continue;
    return {
      entries: entries.map((candidate) => candidate.id === entry.id ? { ...candidate, children: nested.entries } : candidate),
      removed: nested.removed,
      parentId: nested.parentId ?? entry.id,
    };
  }
  return { entries };
}

function insertEntry(entries: OverviewTemplateEntry[], parentId: string | undefined, index: number, entry: OverviewTemplateEntry): OverviewTemplateEntry[] {
  if (!parentId) {
    const next = [...entries];
    next.splice(index, 0, entry);
    return next;
  }
  return entries.map((candidate) => candidate.id === parentId
    ? { ...candidate, children: insertEntry(candidate.children, undefined, index, entry) }
    : { ...candidate, children: insertEntry(candidate.children, parentId, index, entry) });
}

export function moveOverviewEntry(
  entries: OverviewTemplateEntry[],
  activeId: string,
  targetId: string,
  position: OverviewDropPosition,
): { entries: OverviewTemplateEntry[]; moved: boolean; parentChanged: boolean } {
  if (activeId === targetId) return { entries, moved: false, parentChanged: false };
  const locations = flattenOverviewEntries(entries);
  const active = locations.find((location) => location.entry.id === activeId);
  const target = locations.find((location) => location.entry.id === targetId);
  if (!active || !target) return { entries, moved: false, parentChanged: false };
  const activeDescendantIds = new Set(flattenOverviewEntries(active.entry.children).map((location) => location.entry.id));
  if (activeDescendantIds.has(targetId)) return { entries, moved: false, parentChanged: false };
  if (position === "inside" && !["group", "repeating_group"].includes(target.entry.type)) return { entries, moved: false, parentChanged: false };

  const removed = removeEntry(entries, activeId);
  if (!removed.removed) return { entries, moved: false, parentChanged: false };
  const remainingLocations = flattenOverviewEntries(removed.entries);
  const remainingTarget = remainingLocations.find((location) => location.entry.id === targetId);
  if (!remainingTarget) return { entries, moved: false, parentChanged: false };
  const destinationParentId = position === "inside" ? targetId : remainingTarget.parentId;
  const destinationIndex = position === "inside"
    ? remainingTarget.entry.children.length
    : remainingTarget.index + (position === "after" ? 1 : 0);
  return {
    entries: insertEntry(removed.entries, destinationParentId, destinationIndex, removed.removed),
    moved: true,
    parentChanged: active.parentId !== destinationParentId,
  };
}

function instantiateEntry(entry: OverviewTemplateEntry, createId: (prefix: string) => string): ProjectOverviewEntry {
  const children = entry.children.map((child) => instantiateEntry(child, createId));
  return {
    id: createId("overview-entry"),
    label: entry.label,
    placeholderKey: normalizeOverviewKey(entry.label),
    type: entry.type,
    value: entry.defaultValue,
    children: ["group", "repeating_group"].includes(entry.type) ? children : [],
    items: entry.type === "repeating_group" ? [entry.children.map((child) => instantiateEntry(child, createId))] : [],
  };
}

function cloneProjectEntry(entry: ProjectOverviewEntry, createId: (prefix: string) => string): ProjectOverviewEntry {
  return {
    ...entry,
    id: createId("overview-entry"),
    children: entry.children.map((child) => cloneProjectEntry(child, createId)),
    items: entry.items.map((item) => item.map((child) => cloneProjectEntry(child, createId))),
  };
}

export function instantiateRepeatingItem(entry: ProjectOverviewEntry, createId: (prefix: string) => string): ProjectOverviewEntry[] {
  return entry.children.map((child) => cloneProjectEntry(child, createId));
}

export function instantiateOverviewSection(
  template: OverviewTemplate,
  createId: (prefix: string) => string,
  locale: Locale = templateSourceLocale(template),
): ProjectOverviewSection {
  const localizedTemplate = localizeOverviewTemplate(template, locale);
  return {
    id: createId("overview-section"),
    name: localizedTemplate.name,
    placeholderKey: normalizeOverviewKey(localizedTemplate.name, "template"),
    entries: localizedTemplate.entries.map((entry) => instantiateEntry(entry, createId)),
  };
}

export function uniqueProjectOverviewSectionKey(
  sectionName: string,
  sections: ProjectOverviewSection[],
): string {
  const baseKey = normalizeOverviewKey(sectionName, "section");
  const existingKeys = new Set(sections.map((section) => section.placeholderKey));
  if (!existingKeys.has(baseKey)) return baseKey;
  let suffix = 2;
  while (existingKeys.has(`${baseKey}_${suffix}`)) suffix += 1;
  return `${baseKey}_${suffix}`;
}

function formatEntryValue(entry: ProjectOverviewEntry, locale: Locale): unknown {
  if (entry.type === "date") {
    if (!entry.value) return "";
    const [year, month, day] = entry.value.split("-").map(Number);
    if (!year || !month || !day) return entry.value;
    return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }
  if (entry.type === "text") return entry.value;
  if (entry.type === "group") return Object.fromEntries(entry.children.map((child) => [child.placeholderKey, formatEntryValue(child, locale)]));
  return entry.items.map((item) => Object.fromEntries(item.map((child) => [child.placeholderKey, formatEntryValue(child, locale)])));
}

export function overviewSectionTemplateData(section: ProjectOverviewSection, locale: Locale): Record<string, unknown> {
  return Object.fromEntries(section.entries.map((entry) => [entry.placeholderKey, formatEntryValue(entry, locale)]));
}
