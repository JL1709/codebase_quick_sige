import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { BLOCK_LAYOUT_VALIDATION_RULE_CODES, createPlanValidationIssues } from "./planValidation";
import { fitBlocksInArea, reconcilePlanSectionsWithCatalog } from "./planLayout";

const t = (key: string, params?: Record<string, string | number>) => `${key}${params ? `:${Object.values(params).join(":")}` : ""}`;

describe("plan validation", () => {
  it("associates overflow issues with the exact named element", () => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const element = plan.layout.elements.find((candidate) => candidate.kind === "block");
    expect(element?.kind).toBe("block");
    if (!element || element.kind !== "block") return;
    element.width = 800;
    element.height = 280;
    const section = plan.sections.find((candidate) => candidate.id === element.sectionId);
    const item = section?.items.find((candidate) => candidate.id === element.itemId);
    item!.customShortDescription = {
      ...item!.customShortDescription,
      [database.user.preferredLocale]: "Overflow ".repeat(50_000),
    };
    const issues = createPlanValidationIssues({ plan, project: database.projects[0], blocks: database.blocks, documentConfigurations: database.documentConfigurations, documentTemplates: database.documentTemplates, locale: database.user.preferredLocale, t });
    const overflow = issues.find((issue) => issue.ruleCode === "TEXT_OVERFLOW" && issue.elementId === element.id);
    expect(overflow?.id).toBe(`TEXT_OVERFLOW:${element.id}`);
    expect(overflow?.title).toContain(database.blocks.find((block) => block.id === element.blockId)?.translations[database.user.preferredLocale].title);
  });

  it.each(["vertical", "horizontal", "best_fit"] as const)("has zero managed block-layout issues after fitting in %s mode", (mode) => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const sections = reconcilePlanSectionsWithCatalog(plan.sections, database.categories, database.blocks);
    const fitted = fitBlocksInArea(plan.layout, sections, database.categories, database.blocks, mode);
    const fittedPlan = { ...plan, sections, layout: fitted.layout };
    const managedElementIds = new Set(fitted.layout.elements
      .filter((element) => element.kind === "block" || element.kind === "section")
      .map((element) => element.id));
    const issues = createPlanValidationIssues({
      plan: fittedPlan,
      project: database.projects[0],
      blocks: database.blocks,
      documentConfigurations: database.documentConfigurations,
      documentTemplates: database.documentTemplates,
      locale: "en",
      t,
    }).filter((issue) => issue.elementId && managedElementIds.has(issue.elementId) && BLOCK_LAYOUT_VALIDATION_RULE_CODES.has(issue.ruleCode));

    expect(fitted.fits).toBe(true);
    expect(issues).toEqual([]);
  });

  it("removes resolved element issues without disturbing stable global issue IDs", () => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const element = plan.layout.elements.find((candidate) => candidate.kind === "text" || candidate.kind === "block");
    expect(element).toBeDefined();
    if (!element) return;
    element.x = -100;
    const before = createPlanValidationIssues({ plan, project: database.projects[0], blocks: database.blocks, documentConfigurations: database.documentConfigurations, documentTemplates: database.documentTemplates, locale: database.user.preferredLocale, t });
    expect(before.some((issue) => issue.id === `LAYOUT_OUTSIDE_SAFE_AREA:${element.id}`)).toBe(true);
    element.x = plan.layout.safeMargin;
    const after = createPlanValidationIssues({ plan, project: database.projects[0], blocks: database.blocks, documentConfigurations: database.documentConfigurations, documentTemplates: database.documentTemplates, locale: database.user.preferredLocale, t });
    expect(after.some((issue) => issue.id === `LAYOUT_OUTSIDE_SAFE_AREA:${element.id}`)).toBe(false);
    expect(after.some((issue) => issue.id === "PLAN_REVIEW_REQUIRED")).toBe(true);
  });

  it("drops stale element issues after deletion and preserves severity order", () => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const element = plan.layout.elements.find((candidate) => candidate.kind === "block");
    expect(element).toBeDefined();
    if (!element) return;
    element.x = -100;
    const before = createPlanValidationIssues({ plan, project: database.projects[0], blocks: database.blocks, documentConfigurations: database.documentConfigurations, documentTemplates: database.documentTemplates, locale: database.user.preferredLocale, t });
    expect(before.some((issue) => issue.elementId === element.id)).toBe(true);

    plan.layout.elements = plan.layout.elements.filter((candidate) => candidate.id !== element.id);
    const after = createPlanValidationIssues({ plan, project: database.projects[0], blocks: database.blocks, documentConfigurations: database.documentConfigurations, documentTemplates: database.documentTemplates, locale: database.user.preferredLocale, t });
    const liveElementIds = new Set(plan.layout.elements.map((candidate) => candidate.id));
    expect(after.every((issue) => !issue.elementId || liveElementIds.has(issue.elementId))).toBe(true);
    const severityRanks = after.map((issue) => ({ error: 0, warning: 1, information: 2 })[issue.severity]);
    expect(severityRanks).toEqual([...severityRanks].sort((left, right) => left - right));
  });
});
