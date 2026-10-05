// @vitest-environment node
import { Document, Packer, Paragraph } from "docx";
import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { projectWithResolvedParticipants } from "../domain/contacts";
import type { Project } from "../domain/types";
import { translate } from "../i18n/translations";
import { buildTemplateData, inspectTemplate, templatePlaceholderReference } from "./templateEngine";
import { buildReferenceGroups, filterReferenceGroups, referenceFieldCount, referenceRepeatBlock, type ReferenceGroup } from "./placeholderReference";

function findGroup(groups: ReferenceGroup[], path: string): ReferenceGroup {
  const group = groups.flatMap((candidate) => [candidate, ...flatten(candidate.groups)]).find((candidate) => candidate.path === path);
  if (!group) throw new Error(`Missing group ${path}`);
  return group;
}
function flatten(groups: ReferenceGroup[]): ReferenceGroup[] {
  return groups.flatMap((group) => [group, ...flatten(group.groups)]);
}
function fixture(projectOverride?: (project: Project) => Project) {
  const database = createSeedDatabase();
  const project = projectOverride?.(projectWithResolvedParticipants(database, database.projects[0])) ?? projectWithResolvedParticipants(database, database.projects[0]);
  const data = buildTemplateData(project, database.plans[0], "de", database.blocks, database.categories, database.organization);
  const groups = buildReferenceGroups(data, templatePlaceholderReference(data), project, database.organization, (key, params) => translate("en", key, params));
  return { database, project, data, groups };
}

describe("placeholder reference", () => {
  it("preserves every shared-engine field and collection without exposing internal image data", () => {
    const { data, groups } = fixture();
    const tokens = flatten(groups).flatMap((group) => [...group.fields.map((field) => field.token), ...(group.collection ? [`{{#${group.path}}}`, `{{/${group.path}}}`] : [])]);
    expect(tokens.sort()).toEqual(templatePlaceholderReference(data).sort());
    expect(flatten(groups).flatMap((group) => group.fields).some((field) => /base64|data:image/.test(field.preview))).toBe(false);
  });

  it("uses saved labels, current values and project section order", () => {
    const { groups, project } = fixture((project) => ({ ...project, overviewSectionOrder: [...project.overviewSectionOrder].reverse() }));
    const general = findGroup(groups, "qs.project.allgemein");
    expect(general.label).toBe("Allgemein");
    expect(general.fields.find((field) => field.path.endsWith(".nummer"))).toMatchObject({ label: "Nummer", preview: "LW-2026-001" });
    expect(general.fields.find((field) => field.path.endsWith(".geplanter_beginn"))).toMatchObject({ label: "Geplanter Beginn", preview: "12.10.2026" });
    const firstSection = project.overviewSections.find((section) => section.id === project.overviewSectionOrder[0])!;
    expect(findGroup(groups, "qs.project").groups[0].label).toBe(firstSection.name);
    expect(findGroup(groups, "qs.project.projektbeteiligte").fields.find((field) => field.path.endsWith(".company"))).toMatchObject({ label: "Company", preview: "Westpark Projekt GmbH" });
  });

  it("follows renamed sections and fields without translating their paths", () => {
    const { groups } = fixture((project) => {
      project.participantsSectionName = "Bauteam";
      project.overviewSections[0].name = "Bauablauf";
      project.overviewSections[0].entries[0].label = "Kunde";
      return project;
    });
    expect(findGroup(groups, "qs.project.bauteam").label).toBe("Bauteam");
    expect(findGroup(groups, "qs.project.bauablauf").fields[0]).toMatchObject({ token: "{{qs.project.bauablauf.kunde}}", label: "Kunde" });
  });

  it.each(["geplanter_beginn", "Geplanter Beginn", "12.10.2026"])("searches paths, labels and values for %s", (query) => {
    const { groups } = fixture();
    const result = filterReferenceGroups(groups, query);
    expect(result).toHaveLength(1);
    expect(findGroup(result, "qs.project.allgemein").fields.map((field) => field.path)).toEqual(["qs.project.allgemein.geplanter_beginn"]);
  });

  it("searches collapsed group titles and handles no matches", () => {
    const { groups } = fixture();
    expect(referenceFieldCount(findGroup(filterReferenceGroups(groups, "Projektbeteiligte"), "qs.project.projektbeteiligte"))).toBe(5);
    expect(filterReferenceGroups(groups, "does-not-exist")).toEqual([]);
    expect(filterReferenceGroups(groups, "   ")).toBe(groups);
  });

  it("keeps declared fields discoverable when a repeating collection is empty", () => {
    const { database, project } = fixture();
    project.participants = [];
    const contacts = project.overviewSections.find((section) => section.name === "Notfallkontakte")!.entries[0];
    contacts.items = [];
    const data = buildTemplateData(project, undefined, "de", [], [], database.organization);
    const groups = buildReferenceGroups(data, templatePlaceholderReference(data), project, database.organization, (key) => translate("en", key));
    expect(findGroup(groups, "qs.project.projektbeteiligte")).toMatchObject({ collection: true });
    expect(findGroup(groups, "qs.project.projektbeteiligte").fields).toHaveLength(5);
    expect(findGroup(groups, "qs.project.notfallkontakte.kontakte").fields.map((field) => field.preview)).toEqual(["", "", ""]);
  });

  it("previews nested blocks from a populated category when the first parent has none", () => {
    const { data, groups } = fixture();
    const categories = (data.qs as { project: { plan: { category_tree: Array<{ blocks: Array<{ title: string }> }> } } }).project.plan.category_tree;
    expect(categories[0].blocks).toHaveLength(0);
    const firstPopulatedCategory = categories.find((category) => category.blocks.length > 0)!;
    const blocks = findGroup(groups, "qs.project.plan.category_tree.blocks");
    expect(blocks.fields.find((field) => field.path.endsWith(".title"))?.preview).toBe(firstPopulatedCategory.blocks[0].title);
    expect(blocks.fields.find((field) => field.path.endsWith(".a4_description"))?.preview).not.toBe("");
  });

  it("copies complete participant blocks and wraps nested blocks in their required parent loops", async () => {
    const { data, groups } = fixture();
    const participants = findGroup(groups, "qs.project.projektbeteiligte");
    const category = findGroup(groups, "qs.project.plan.category_tree");
    const blocks = findGroup(groups, "qs.project.plan.category_tree.blocks");
    const participantBlock = referenceRepeatBlock(participants);
    expect(participantBlock).toContain("{{qs.project.projektbeteiligte.email}}");
    const nestedBlock = referenceRepeatBlock(blocks, [category]);
    expect(nestedBlock.split("\n")[0]).toBe("{{#qs.project.plan.category_tree}}");
    expect(nestedBlock.split("\n").at(-1)).toBe("{{/qs.project.plan.category_tree}}");
    for (const example of [participantBlock, nestedBlock]) {
      const template = await Packer.toBuffer(new Document({ sections: [{ children: example.split("\n").map((line) => new Paragraph(line)) }] }));
      expect(await inspectTemplate(new Uint8Array(template).buffer, data)).toMatchObject({ missingPlaceholders: [], unsafeCommands: [] });
    }
  });
});
