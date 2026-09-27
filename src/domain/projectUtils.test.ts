import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { calculateProjectCompleteness, countPlanBlocks } from "./projectUtils";

describe("project utilities", () => {
  it("reports progress from project and plan state", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    const plan = database.plans[0];
    expect(calculateProjectCompleteness(project, plan)).toBeGreaterThanOrEqual(80);
    expect(countPlanBlocks(plan)).toBeGreaterThan(5);
  });
});
