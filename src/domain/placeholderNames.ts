export const PROJECT_PLACEHOLDER_FIELDS = ["name", "number", "language", "plan", "files"] as const;

export function normalizeOverviewKey(value: string, fallback = "field"): string {
  const normalized = value
    .replaceAll("Ä", "Ae").replaceAll("Ö", "Oe").replaceAll("Ü", "Ue")
    .replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue").replaceAll("ß", "ss")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized ? (/^[0-9]/.test(normalized) ? `_${normalized}` : normalized) : fallback;
}

export function invalidSiblingNameIds(items: Array<{ id: string; name: string }>, reservedNames: readonly string[] = []): Set<string> {
  const keys = items.map((item) => normalizeOverviewKey(item.name, ""));
  return new Set(items.filter((_, index) => !keys[index]
    || reservedNames.includes(keys[index])
    || keys.some((key, otherIndex) => otherIndex !== index && key === keys[index]))
    .map((item) => item.id));
}
