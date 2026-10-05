import { describe, expect, it } from "vitest";
import type { ProjectOverviewEntry } from "./types";
import { moveProjectOverviewEntry, moveProjectOverviewRecord } from "./projectOverview";

function entry(id: string, label: string, children: ProjectOverviewEntry[] = []): ProjectOverviewEntry {
  return {
    id,
    label,
    type: children.length > 0 ? "group" : "text",
    value: "",
    children,
    items: [],
  };
}

describe("project overview hierarchy", () => {
  it("moves fields to the indicated sibling position", () => {
    const entries = [entry("first", "First"), entry("second", "Second"), entry("third", "Third")];
    const result = moveProjectOverviewEntry(entries, "third", "first", "after");

    expect(result.moved).toBe(true);
    expect(result.entries.map(({ id }) => id)).toEqual(["first", "third", "second"]);
  });

  it("moves fields into a group and rejects moving a parent into its descendant", () => {
    const entries = [entry("field", "Field"), entry("group", "Group", [entry("child", "Child")])];
    const nested = moveProjectOverviewEntry(entries, "field", "group", "inside");

    expect(nested.entries.map(({ id }) => id)).toEqual(["group"]);
    expect(nested.entries[0].children.map(({ id }) => id)).toEqual(["child", "field"]);
    expect(moveProjectOverviewEntry(entries, "group", "child", "inside").moved).toBe(false);
  });

  it("keeps repeating-record values attached to their schema fields after reordering", () => {
    const name = entry("schema-name", "Name");
    const phone = entry("schema-phone", "Phone");
    const repeating: ProjectOverviewEntry = {
      id: "contacts",
      label: "Contacts",
      type: "repeating_group",
      value: "",
      children: [name, phone],
      items: [[
        { ...name, id: "value-name", value: "Fire service" },
        { ...phone, id: "value-phone", value: "112" },
      ]],
    };

    const result = moveProjectOverviewEntry([repeating], "schema-phone", "schema-name", "before");
    const nextRepeating = result.entries[0];

    expect(nextRepeating.children.map(({ id }) => id)).toEqual(["schema-phone", "schema-name"]);
    expect(nextRepeating.items[0].map(({ value }) => value)).toEqual(["112", "Fire service"]);
  });

  it("reorders complete repeating records without mixing their fields", () => {
    const first = [entry("first-name", "Name"), entry("first-phone", "Phone")];
    const second = [entry("second-name", "Name"), entry("second-phone", "Phone")];

    const reordered = moveProjectOverviewRecord([first, second], 1, 0, "before");

    expect(reordered).toEqual([second, first]);
    expect(moveProjectOverviewRecord(reordered, 0, 1, "before")).toBe(reordered);
  });
});
