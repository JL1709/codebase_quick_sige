import { describe, expect, it } from "vitest";
import type { OverviewTemplate } from "./types";
import {
  instantiateOverviewSection,
  moveOverviewEntry,
  normalizeOverviewKey,
  overviewEntryClipboardValue,
  overviewEntryPath,
  overviewSectionTemplateData,
  validateOverviewTemplate,
} from "./overviewTemplates";

const template: OverviewTemplate = {
  id: "template-general",
  organizationId: "organization-demo",
  name: "Allgemein",
  entries: [
    { id: "client", label: "Bauherr", type: "text", defaultValue: "", children: [] },
    {
      id: "address", label: "Adresse", type: "group", defaultValue: "", children: [
        { id: "city", label: "Stadt", type: "text", defaultValue: "Leipzig", children: [] },
      ],
    },
    {
      id: "participants", label: "Projektbeteiligte", type: "repeating_group", defaultValue: "", children: [
        { id: "participant-name", label: "Name", type: "text", defaultValue: "", children: [] },
      ],
    },
  ],
  createdAt: "2026-09-27T00:00:00.000Z",
  updatedAt: "2026-09-27T00:00:00.000Z",
};

describe("overview template hierarchy", () => {
  it("creates predictable localized placeholder keys and engine-ready clipboard values", () => {
    expect(normalizeOverviewKey("Größe & Straße")).toBe("groesse_strasse");
    expect(overviewEntryPath(template.name, "city", template.entries)).toBe("allgemein.adresse.stadt");
    expect(overviewEntryClipboardValue(template, "city")).toBe("{{INS qs.overview.allgemein.adresse.stadt}}");
    expect(overviewEntryClipboardValue(template, "participant-name")).toBe("{{INS $projektbeteiligte_item.name}}");
    expect(overviewEntryClipboardValue(template, "participants")).toContain("FOR projektbeteiligte_item IN qs.overview.allgemein.projektbeteiligte");
  });

  it("rejects duplicate normalized entry labels and template names", () => {
    const duplicateEntry = structuredClone(template);
    duplicateEntry.entries.push({ id: "duplicate", label: "BAUHERR", type: "text", defaultValue: "", children: [] });
    const validation = validateOverviewTemplate(duplicateEntry, [{ ...template, id: "other" }]);
    expect(validation.valid).toBe(false);
    expect(validation.nameConflict).toBe(true);
    expect(validation.invalidEntryIds).toEqual(new Set(["client", "duplicate"]));
  });

  it("reorders siblings and nests entries without losing their content", () => {
    const reordered = moveOverviewEntry(template.entries, "client", "address", "after");
    expect(reordered.entries.map((entry) => entry.id)).toEqual(["address", "client", "participants"]);
    expect(reordered.parentChanged).toBe(false);

    const nested = moveOverviewEntry(template.entries, "client", "address", "inside");
    expect(nested.entries.find((entry) => entry.id === "address")?.children.map((entry) => entry.id)).toEqual(["city", "client"]);
    expect(nested.parentChanged).toBe(true);
    expect(moveOverviewEntry(template.entries, "address", "city", "inside").moved).toBe(false);
  });

  it("instantiates editable project data and formats date values for documents", () => {
    const dateTemplate: OverviewTemplate = {
      ...template,
      entries: [{ id: "date", label: "Übergabe", type: "date", defaultValue: "2026-09-27", children: [] }],
    };
    let id = 0;
    const section = instantiateOverviewSection(dateTemplate, (prefix) => `${prefix}-${++id}`);
    expect(section.placeholderKey).toBe("allgemein");
    expect(overviewSectionTemplateData(section, "de")).toEqual({ uebergabe: "27.09.2026" });
  });
});
