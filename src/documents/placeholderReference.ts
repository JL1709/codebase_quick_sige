import type { Organization, Project, ProjectOverviewEntry } from "../domain/types";
import { normalizeOverviewKey } from "../domain/placeholderNames";
import { PROJECT_PARTICIPANTS_SECTION_ID } from "../domain/projectOverviewOrder";
import type { TemplateData } from "./templateEngine";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface ReferenceField {
  path: string;
  token: string;
  label: string;
  preview: string;
  kind: "text" | "image";
}

export interface ReferenceGroup {
  path: string;
  label: string;
  collection: boolean;
  fields: ReferenceField[];
  groups: ReferenceGroup[];
}

const SYSTEM_LABELS: Record<string, string> = {
  "qs.organization": "organization.identity",
  "qs.organization.name": "organization.name",
  "qs.organization.address": "organization.address",
  "qs.organization.address.street": "organization.address.street",
  "qs.organization.address.house_number": "organization.address.houseNumber",
  "qs.organization.address.address_addition": "organization.address.addressAddition",
  "qs.organization.address.postal_code": "organization.address.postalCode",
  "qs.organization.address.city": "organization.address.city",
  "qs.organization.address.region": "organization.address.region",
  "qs.organization.address.country_code": "organization.address.countryCode",
  "qs.organization.phone": "organization.phone",
  "qs.organization.phone_extension": "organization.phoneExtension",
  "qs.organization.mobile_phone": "organization.mobilePhone",
  "qs.organization.fax": "organization.fax",
  "qs.organization.fax_extension": "organization.faxExtension",
  "qs.organization.email": "organization.email",
  "qs.organization.website": "organization.website",
  "qs.organization.logo": "organization.logo",
  "qs.organization.logo.image": "organization.logo",
  "qs.organization.logo_images": "templates.reference.optionalLogo",
  "qs.organization.logo_images.image": "organization.logo",
  "qs.organization.profiles": "templates.reference.optionalOrganization",
  "qs.organization.formatted_address": "templates.reference.formattedAddress",
  "qs.organization.address_line": "templates.reference.addressLine",
  "qs.organization.contact_line": "templates.reference.contactLine",
  "qs.project": "templates.reference.project",
  "qs.project.name": "project.name",
  "qs.project.number": "project.number",
  "qs.project.language": "templates.language",
  "qs.project.plan": "templates.reference.safetyPlan",
  "qs.project.plan.title": "templates.reference.planTitle",
  "qs.project.plan.category_tree": "templates.reference.categories",
  "qs.project.plan.category_tree.blocks": "templates.reference.blocks",
  "qs.project.plan.blocks": "templates.reference.allBlocks",
  "qs.project.files": "templates.reference.files",
  "qs.project.files.filename": "templates.reference.filename",
  "qs.project.files.image": "templates.reference.image",
};
const PLAN_FIELD_LABELS: Record<string, string> = {
  id: "templates.reference.categoryId", title: "templates.reference.title", path: "templates.reference.categoryPath",
  depth: "templates.reference.depth", color: "templates.reference.color", category: "templates.reference.category",
  a0_description: "templates.reference.shortDescription", a4_description: "templates.reference.description",
  regulations: "templates.reference.regulations", image: "templates.reference.image", expert_note: "templates.reference.expertNote",
};
const PARTICIPANT_LABELS: Record<string, string> = {
  name: "templates.reference.personName", company: "contacts.company", role: "contacts.role", email: "contacts.email", phone: "contacts.phone",
};

function projectLabels(project: Project | undefined, t: Translate): Map<string, string> {
  const labels = new Map<string, string>();
  const visit = (entry: ProjectOverviewEntry, parentPath: string) => {
    const path = `${parentPath}.${normalizeOverviewKey(entry.label)}`;
    labels.set(path, entry.label);
    entry.children.forEach((child) => visit(child, path));
  };
  project?.overviewSections.forEach((section) => {
    const path = `qs.project.${normalizeOverviewKey(section.name)}`;
    labels.set(path, section.name);
    section.entries.forEach((entry) => visit(entry, path));
  });
  if (project) {
    const path = `qs.project.${normalizeOverviewKey(project.participantsSectionName)}`;
    labels.set(path, project.participantsSectionName);
    Object.entries(PARTICIPANT_LABELS).forEach(([key, label]) => labels.set(`${path}.${key}`, t(label)));
  }
  return labels;
}

function firstReferenceValue(data: TemplateData, path: string): unknown {
  let value: unknown = data;
  const segments = path.split(".");
  let parentPath = "";
  for (const segment of segments) {
    if (Array.isArray(value)) {
      // Parent categories can have no blocks; preview the first populated child collection.
      value = value.find((entry) => {
        const child = entry && typeof entry === "object" ? (entry as Record<string, unknown>)[segment] : undefined;
        return Array.isArray(child) && child.length > 0;
      }) ?? value[0] ?? data.collectionExamples?.[parentPath];
    }
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[segment];
    parentPath = parentPath ? `${parentPath}.${segment}` : segment;
  }
  return value;
}

export function buildReferenceGroups(data: TemplateData, tokens: string[], project: Project | undefined, organization: Organization, t: Translate): ReferenceGroup[] {
  const labels = projectLabels(project, t);
  const labelFor = (path: string): string => {
    if (labels.has(path)) return labels.get(path)!;
    const key = SYSTEM_LABELS[path] ?? (path.startsWith("qs.project.plan.") ? PLAN_FIELD_LABELS[path.split(".").at(-1)!] : undefined);
    return key ? t(key) : path.split(".").at(-1)!.replaceAll("_", " ");
  };
  const groupsByPath = new Map<string, ReferenceGroup>();
  const roots: ReferenceGroup[] = [];
  const ensureGroup = (path: string): ReferenceGroup => {
    const existing = groupsByPath.get(path);
    if (existing) return existing;
    const value = firstReferenceValue(data, path);
    const group: ReferenceGroup = { path, label: labelFor(path), collection: Array.isArray(value), fields: [], groups: [] };
    groupsByPath.set(path, group);
    if (path === "qs.organization" || path === "qs.project") roots.push(group);
    else ensureGroup(path.slice(0, path.lastIndexOf("."))).groups.push(group);
    return group;
  };
  for (const token of tokens) {
    if (token.startsWith("{{/")) continue;
    const collection = token.startsWith("{{#");
    const path = token.slice(collection ? 3 : 2, -2);
    if (collection) { ensureGroup(path).collection = true; continue; }
    const value = firstReferenceValue(data, path);
    const image = path === "qs.organization.logo.image" || path === "qs.organization.logo_images.image" || path === "qs.project.files.image" || /^qs\.project\.plan\.(?:blocks|category_tree\.blocks)\.image$/.test(path);
    let preview = typeof value === "string" || typeof value === "number" ? String(value) : "";
    if (image) {
      if (path.startsWith("qs.organization.")) preview = organization.logo?.filename ?? "";
      else if (path === "qs.project.files.image") preview = project?.assets[0]?.mimeType.startsWith("image/") ? project.assets[0].filename : "";
      else preview = value ? t("templates.reference.imageAvailable") : "";
    }
    ensureGroup(path.slice(0, path.lastIndexOf("."))).fields.push({ path, token, label: labelFor(path), preview, kind: image ? "image" : "text" });
  }
  // The overview order is the same order users see in their project.
  const projectRoot = groupsByPath.get("qs.project");
  if (projectRoot && project) {
    const order = project.overviewSectionOrder.flatMap((id) => {
      const name = id === PROJECT_PARTICIPANTS_SECTION_ID ? project.participantsSectionName : project.overviewSections.find((section) => section.id === id)?.name;
      return name ? [`qs.project.${normalizeOverviewKey(name)}`] : [];
    });
    projectRoot.groups.sort((left, right) => {
      const leftIndex = order.indexOf(left.path);
      const rightIndex = order.indexOf(right.path);
      return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
    });
  }
  return roots;
}

export function referenceFieldCount(group: ReferenceGroup): number {
  return group.fields.length + group.groups.reduce((count, child) => count + referenceFieldCount(child), 0);
}

export function filterReferenceGroups(groups: ReferenceGroup[], query: string): ReferenceGroup[] {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return groups;
  return groups.flatMap((group) => {
    if (group.label.toLocaleLowerCase().includes(search) || group.path.toLocaleLowerCase().includes(search)) return [group];
    const fields = group.fields.filter((field) => [field.label, field.token, field.preview].some((text) => text.toLocaleLowerCase().includes(search)));
    const children = filterReferenceGroups(group.groups, search);
    return fields.length || children.length ? [{ ...group, fields, groups: children }] : [];
  });
}

export function referenceRepeatBlock(group: ReferenceGroup, parentCollections: ReferenceGroup[] = []): string {
  const lines = (current: ReferenceGroup): string[] => {
    const content = [...current.fields.map((field) => field.token), ...current.groups.flatMap(lines)];
    if (current.path === "qs.organization.profiles") content.push("{{qs.organization.name}}");
    return current.collection ? [`{{#${current.path}}}`, ...content, `{{/${current.path}}}`] : content;
  };
  let block = lines(group);
  // Nested collection paths need their surrounding loops to resolve in Word.
  for (const parent of [...parentCollections].reverse()) block = [`{{#${parent.path}}}`, ...block, `{{/${parent.path}}}`];
  return block.join("\n");
}
