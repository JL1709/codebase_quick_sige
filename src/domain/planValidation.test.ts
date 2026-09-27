import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { createPlanValidationIssues } from "./planValidation";

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
    const issues = createPlanValidationIssues({ plan, project: database.projects[0], blocks: database.blocks, documentConfigurations: database.documentConfigurations, documentTemplates: database.documentTemplates, t });
    const overflow = issues.find((issue) => issue.ruleCode === "TEXT_OVERFLOW" && issue.elementId === element.id);
    expect(overflow?.id).toBe(`TEXT_OVERFLOW:${element.id}`);
    expect(overflow?.title).toContain(database.blocks.find((block) => block.id === element.blockId)?.translations[plan.documentLocale].title);
  });

  it("removes resolved element issues without disturbing stable global issue IDs", () => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const element = plan.layout.elements.find((candidate) => candidate.kind === "text" || candidate.kind === "block");
    expect(element).toBeDefined();
    if (!element) return;
    element.x = -100;
    const before = createPlanValidationIssues({ plan, project: database.projects[0], blocks: database.blocks, documentConfigurations: database.documentConfigurations, documentTemplates: database.documentTemplates, t });
    expect(before.some((issue) => issue.id === `LAYOUT_OUTSIDE_SAFE_AREA:${element.id}`)).toBe(true);
    element.x = plan.layout.safeMargin;
    const after = createPlanValidationIssues({ plan, project: database.projects[0], blocks: database.blocks, documentConfigurations: database.documentConfigurations, documentTemplates: database.documentTemplates, t });
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
    const before = createPlanValidationIssues({ plan, project: database.projects[0], blocks: database.blocks, documentConfigurations: database.documentConfigurations, documentTemplates: database.documentTemplates, t });
    expect(before.some((issue) => issue.elementId === element.id)).toBe(true);

    plan.layout.elements = plan.layout.elements.filter((candidate) => candidate.id !== element.id);
    const after = createPlanValidationIssues({ plan, project: database.projects[0], blocks: database.blocks, documentConfigurations: database.documentConfigurations, documentTemplates: database.documentTemplates, t });
    const liveElementIds = new Set(plan.layout.elements.map((candidate) => candidate.id));
    expect(after.every((issue) => !issue.elementId || liveElementIds.has(issue.elementId))).toBe(true);
    const severityRanks = after.map((issue) => ({ error: 0, warning: 1, information: 2 })[issue.severity]);
    expect(severityRanks).toEqual([...severityRanks].sort((left, right) => left - right));
  });
});
