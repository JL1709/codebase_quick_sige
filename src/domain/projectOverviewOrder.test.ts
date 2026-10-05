import { describe, expect, it } from "vitest";
import type { ProjectOverviewSection } from "./types";
import {
  moveProjectOverviewSection,
  normalizeProjectOverviewSectionOrder,
  orderProjectOverviewSections,
  PROJECT_PARTICIPANTS_SECTION_ID,
} from "./projectOverviewOrder";

function section(id: string): ProjectOverviewSection {
  return { id, name: id, entries: [] };
}

describe("project overview order", () => {
  it("keeps participants optional, removes stale values, and retains persisted section order", () => {
    const sections = [section("general"), section("emergency")];

    expect(normalizeProjectOverviewSectionOrder(["stale", "emergency", "emergency"], sections)).toEqual([
      "emergency",
      "general",
    ]);
    expect(normalizeProjectOverviewSectionOrder([], [])).toEqual([]);
  });

  it("uses the same order for the persisted overview section data", () => {
    const sections = [section("general"), section("emergency")];
    const order = ["emergency", PROJECT_PARTICIPANTS_SECTION_ID, "general"];

    expect(orderProjectOverviewSections(sections, order).map((candidate) => candidate.id)).toEqual(["emergency", "general"]);
    expect(moveProjectOverviewSection(order, PROJECT_PARTICIPANTS_SECTION_ID, -1)).toEqual([
      PROJECT_PARTICIPANTS_SECTION_ID,
      "emergency",
      "general",
    ]);
  });
});
