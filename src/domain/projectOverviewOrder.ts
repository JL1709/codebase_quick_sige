import type { ProjectOverviewSection } from "./types";

export const PROJECT_PARTICIPANTS_SECTION_ID = "system:project-participants";

export function normalizeProjectOverviewSectionOrder(
  order: string[] | undefined,
  sections: ProjectOverviewSection[],
): string[] {
  const sectionIds = new Set(sections.map((section) => section.id));
  const validIds = new Set([PROJECT_PARTICIPANTS_SECTION_ID, ...sectionIds]);
  const normalized = (order ?? []).filter((id, index, values) => validIds.has(id) && values.indexOf(id) === index);
  for (const section of sections) {
    if (!normalized.includes(section.id)) normalized.push(section.id);
  }
  return normalized;
}

export function moveProjectOverviewSection(order: string[], sectionId: string, direction: -1 | 1): string[] {
  const currentIndex = order.indexOf(sectionId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= order.length) return order;
  const next = [...order];
  [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
  return next;
}

export function orderProjectOverviewSections(
  sections: ProjectOverviewSection[],
  order: string[],
): ProjectOverviewSection[] {
  const positionById = new Map(order.map((id, index) => [id, index]));
  return [...sections].sort((left, right) => (
    (positionById.get(left.id) ?? Number.MAX_SAFE_INTEGER)
    - (positionById.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  ));
}
