import type { Locale, Plan, PlanRevision } from "./types";

export const MAX_PLAN_REASON_LENGTH = 500;

export function normalizePlanReason(reason: string | undefined): string | undefined {
  return reason?.trim().slice(0, MAX_PLAN_REASON_LENGTH) || undefined;
}

interface DraftSource {
  id: string;
  method: "current_plan" | "revision";
}

interface DraftCreationInput {
  id: string;
  now: string;
  createdByName: string;
  reason?: string;
  source: DraftSource;
}

export function activePlanForProject(plans: Plan[], projectId: string): Plan | undefined {
  return plans.find((plan) => plan.projectId === projectId && !plan.supersededAt);
}

export function replaceActivePlan(plans: Plan[], newPlan: Plan, supersededAt: string): Plan[] {
  return [
    newPlan,
    ...plans.map((plan) => plan.projectId === newPlan.projectId && !plan.supersededAt
      ? { ...plan, supersededAt, supersededByPlanId: newPlan.id }
      : plan),
  ];
}

function createDerivedDraft(sourcePlan: Plan, input: DraftCreationInput): Plan {
  const draft = structuredClone(sourcePlan);
  return {
    ...draft,
    id: input.id,
    status: "draft",
    provenance: {
      method: input.source.method,
      createdByName: input.createdByName,
      reason: input.reason,
      ...(input.source.method === "current_plan"
        ? { sourcePlanId: input.source.id }
        : { sourceRevisionId: input.source.id }),
    },
    createdAt: input.now,
    updatedAt: input.now,
    supersededAt: undefined,
    supersededByPlanId: undefined,
  };
}

export function createDraftFromCurrentPlan(
  currentPlan: Plan,
  input: Omit<DraftCreationInput, "source">,
): Plan {
  return createDerivedDraft(currentPlan, {
    ...input,
    source: { id: currentPlan.id, method: "current_plan" },
  });
}

export function createDraftFromRevision(
  revision: PlanRevision,
  input: Omit<DraftCreationInput, "source">,
): Plan {
  const snapshotBlocks = new Map(revision.snapshot.blocks.map((block) => [block.id, block]));
  const snapshotCategories = new Map(revision.snapshot.categories.map((category) => [category.id, category]));
  const localizedContent = (locale: Locale, blockId: string) => snapshotBlocks.get(blockId)?.translations[locale];
  const sourcePlan: Plan = {
    ...revision.snapshot.plan,
    projectId: revision.projectId,
    sections: revision.snapshot.plan.sections.map((section) => {
      const category = snapshotCategories.get(section.categoryId);
      return {
        ...section,
        titleOverrides: {
          de: category?.translations.de.name,
          en: category?.translations.en.name,
          ...section.titleOverrides,
        },
        items: section.items.map((item) => ({
          ...item,
          customTitle: {
            de: localizedContent("de", item.blockId)?.title,
            en: localizedContent("en", item.blockId)?.title,
            ...item.customTitle,
          },
          customShortDescription: {
            de: localizedContent("de", item.blockId)?.shortDescription,
            en: localizedContent("en", item.blockId)?.shortDescription,
            ...item.customShortDescription,
          },
          imageDataUrl: item.imageDataUrl ?? snapshotBlocks.get(item.blockId)?.imageDataUrl,
        })),
      };
    }),
  };
  return createDerivedDraft(sourcePlan, {
    ...input,
    source: { id: revision.id, method: "revision" },
  });
}
