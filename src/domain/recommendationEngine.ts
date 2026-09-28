import type {
  AssessmentAnswers,
  BuildingBlock,
  BuildingBlockCategory,
  Plan,
  PlanSection,
  Project,
  Recommendation,
  RecommendationStrength,
  RequirementAssessment,
} from "./types";
import { createLayoutFromSections, reconcilePlanSectionsWithCatalog } from "./planLayout";

interface RecommendationCandidate {
  blockId: string;
  strength: RecommendationStrength;
  reasonKey: string;
  reasonParams?: Record<string, string | number>;
}

const DEFAULT_SUPPORTING_DOCUMENTS: Plan["supportingDocuments"] = [
  { id: "document-site-rules", type: "site_rules", included: true },
  { id: "document-alarm-plan", type: "alarm_plan", included: true },
  { id: "document-fire-safety", type: "fire_safety", included: true },
  { id: "document-first-aid", type: "first_aid", included: true },
  { id: "document-participants", type: "participants", included: true },
  { id: "document-advance-notice", type: "advance_notice", included: true },
];

function recommendation(
  blockId: string,
  strength: RecommendationStrength,
  reasonKey: string,
  reasonParams?: Record<string, string | number>,
): RecommendationCandidate {
  return { blockId, strength, reasonKey, reasonParams };
}

export function assessRequirements(project: Project, answers: AssessmentAnswers): RequirementAssessment {
  const advanceNoticeLikelyRequired =
    (answers.workDays > 30 && answers.maxWorkers > 20) || answers.estimatedPersonDays > 500;
  const particularlyHazardousWork =
    answers.excavationDepth > 5 ||
    answers.maxWorkHeight > 7 ||
    answers.hazardousSubstances ||
    answers.waterOrDrowningRisk;
  const sigePlanLikelyRequired = answers.employerCount > 1 && (advanceNoticeLikelyRequired || particularlyHazardousWork);

  const reasons: string[] = [];
  if (advanceNoticeLikelyRequired) reasons.push("advance_notice_threshold");
  if (answers.employerCount > 1) reasons.push("multiple_employers");
  if (particularlyHazardousWork) reasons.push("particularly_hazardous_work");
  if (project.constructionType === "demolition") reasons.push("demolition_project");

  return { advanceNoticeLikelyRequired, particularlyHazardousWork, sigePlanLikelyRequired, reasons };
}

export function generateRecommendations(project: Project, answers: AssessmentAnswers): Recommendation[] {
  const candidates: RecommendationCandidate[] = [
    recommendation("block-site-fencing", "strong", "reason.base"),
    recommendation("block-site-access", "strong", "reason.base"),
    recommendation("block-first-aid", "required_review", "reason.base"),
    recommendation("block-emergency-information", "required_review", "reason.base"),
  ];

  if (answers.existingUtilities) {
    candidates.push(recommendation("block-existing-utilities", "required_review", "reason.utilities"));
  }
  if (answers.excavationDepth > 0) {
    candidates.push(recommendation("block-excavation", answers.excavationDepth > 5 ? "required_review" : "strong", "reason.excavation", { depth: answers.excavationDepth }));
  }
  if (answers.maxWorkHeight >= 2) {
    candidates.push(recommendation("block-fall-protection", answers.maxWorkHeight > 7 ? "required_review" : "strong", "reason.fall", { height: answers.maxWorkHeight }));
  }
  if (answers.temporaryPower) {
    candidates.push(recommendation("block-temporary-power", "strong", "reason.power"));
  }
  if (answers.cranesOrLifting) {
    candidates.push(recommendation("block-lifting", "required_review", "reason.crane"));
  }
  if (answers.scaffolding) {
    candidates.push(recommendation("block-scaffolding", "strong", "reason.scaffold"));
  }
  if (answers.publicTraffic) {
    candidates.push(recommendation("block-traffic-routes", "strong", "reason.traffic"));
  }
  if (answers.liveOperations) {
    candidates.push(recommendation("block-live-operations", "required_review", "reason.operations"));
  }
  if (answers.hotWorks) {
    candidates.push(recommendation("block-hot-works", "strong", "reason.hotWorks"));
  }
  if (answers.hazardousSubstances) {
    candidates.push(recommendation("block-hazardous-substances", "required_review", "reason.hazardousSubstances"));
  }
  if (answers.season === "summer") {
    candidates.push(recommendation("block-heat-uv", "strong", "reason.summer"));
  }
  if (answers.season === "winter") {
    candidates.push(recommendation("block-winter", "strong", "reason.winter"));
  }
  if (answers.confinedSpaces) {
    candidates.push(recommendation("block-confined-spaces", "required_review", "reason.confined"));
  }
  if (project.constructionType === "demolition") {
    candidates.push(recommendation("block-demolition", "required_review", "reason.demolition"));
  }

  return candidates.map((candidate, index) => ({
    id: `recommendation-${index + 1}-${candidate.blockId}`,
    included: true,
    ...candidate,
  }));
}

export function createPlanFromAssessment(
  project: Project,
  answers: AssessmentAnswers,
  blocks: BuildingBlock[],
  categories: BuildingBlockCategory[],
  existingRecommendations?: Recommendation[],
): Plan {
  const now = new Date().toISOString();
  const recommendations = existingRecommendations ?? generateRecommendations(project, answers);
  const includedBlockIds = new Set(recommendations.filter((result) => result.included).map((result) => result.blockId));
  const blockMap = new Map(blocks.map((block) => [block.id, block]));

  const directSections: PlanSection[] = categories
    .map((category) => ({
      id: `section-${category.id}`,
      categoryId: category.id,
      items: blocks
        .filter((block) => block.primaryCategoryId === category.id && includedBlockIds.has(block.id))
        .map((block) => ({ id: `item-${block.id}`, blockId: block.id })),
    }))
    .filter((section) => section.items.some((item) => blockMap.has(item.blockId)));
  const sections = reconcilePlanSectionsWithCatalog(directSections, categories, blocks);

  return {
    id: `plan-${project.id}`,
    projectId: project.id,
    status: "draft",
    sections,
    layout: createLayoutFromSections(sections, categories, blocks),
    recommendations,
    requirementAssessment: assessRequirements(project, answers),
    supportingDocuments: DEFAULT_SUPPORTING_DOCUMENTS.map((document) => ({ ...document })),
    includedAssetIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function toggleRecommendation(recommendations: Recommendation[], recommendationId: string): Recommendation[] {
  return recommendations.map((recommendationItem) =>
    recommendationItem.id === recommendationId
      ? { ...recommendationItem, included: !recommendationItem.included }
      : recommendationItem,
  );
}
