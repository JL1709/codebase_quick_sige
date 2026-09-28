import { describe, expect, it } from "vitest";
import { createSeedDatabase, defaultAssessmentAnswers } from "../data/seed";
import { assessRequirements, createPlanFromAssessment, generateRecommendations } from "./recommendationEngine";

describe("recommendation engine", () => {
  it("identifies likely notification and plan requirements for the seeded project", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    const answers = database.assessments[project.id];
    const result = assessRequirements(project, answers);

    expect(result.advanceNoticeLikelyRequired).toBe(true);
    expect(result.sigePlanLikelyRequired).toBe(true);
    expect(result.particularlyHazardousWork).toBe(true);
  });

  it("only recommends conditional blocks when their triggers are present", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    const baseline = { ...defaultAssessmentAnswers, temporaryPower: false };
    const baselineIds = generateRecommendations(project, baseline).map((result) => result.blockId);
    const excavatingIds = generateRecommendations(project, { ...baseline, excavationDepth: 2.5 }).map((result) => result.blockId);

    expect(baselineIds).not.toContain("block-excavation");
    expect(excavatingIds).toContain("block-excavation");
  });

  it("groups included recommendations into semantic plan sections", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    const answers = database.assessments[project.id];
    const recommendations = generateRecommendations(project, answers).map((result) => result.blockId === "block-hot-works" ? { ...result, included: false } : result);
    const plan = createPlanFromAssessment(project, answers, database.blocks, database.categories, recommendations);

    expect(plan.sections.length).toBeGreaterThan(2);
    expect(plan.sections.flatMap((section) => section.items).map((item) => item.blockId)).not.toContain("block-hot-works");
    expect(plan).not.toHaveProperty("documentLocale");
  });
});
