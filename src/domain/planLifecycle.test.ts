import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { activePlanForProject, createDraftFromCurrentPlan, createDraftFromRevision, replaceActivePlan } from "./planLifecycle";

describe("plan lifecycle", () => {
  it("preserves the previous working plan when a new active draft is created", () => {
    const database = createSeedDatabase();
    const currentPlan = database.plans[0];
    const newPlan = createDraftFromCurrentPlan(currentPlan, {
      id: "plan-new",
      now: "2026-09-28T12:00:00.000Z",
      createdByName: "Max",
      reason: "Construction phase changed",
    });

    const plans = replaceActivePlan(database.plans, newPlan, newPlan.createdAt);

    expect(activePlanForProject(plans, currentPlan.projectId)?.id).toBe(newPlan.id);
    expect(plans.find((plan) => plan.id === currentPlan.id)).toMatchObject({
      supersededAt: newPlan.createdAt,
      supersededByPlanId: newPlan.id,
    });
    expect(newPlan.provenance).toMatchObject({
      method: "current_plan",
      sourcePlanId: currentPlan.id,
      reason: "Construction phase changed",
    });
  });

  it("creates an editable draft from immutable revision content", () => {
    const database = createSeedDatabase();
    const revision = database.revisions[0];
    const block = revision.snapshot.blocks[0];
    const item = revision.snapshot.plan.sections.flatMap((section) => section.items).find((candidate) => candidate.blockId === block.id);
    expect(item).toBeDefined();

    const draft = createDraftFromRevision(revision, {
      id: "plan-from-revision",
      now: "2026-09-28T12:00:00.000Z",
      createdByName: "Max",
    });
    const restoredItem = draft.sections.flatMap((section) => section.items).find((candidate) => candidate.blockId === block.id);

    expect(draft.status).toBe("draft");
    expect(draft.provenance).toMatchObject({ method: "revision", sourceRevisionId: revision.id });
    expect(restoredItem?.customTitle?.de).toBe(block.translations.de.title);
    expect(revision.snapshot.plan).toEqual(database.revisions[0].snapshot.plan);
  });
});
