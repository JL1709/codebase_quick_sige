import type { BuildingBlock, DocumentTemplate, Plan, Project, ProjectDocumentConfiguration } from "./types";

export type PlanValidationSeverity = "error" | "warning" | "information";

export interface PlanValidationIssue {
  id: string;
  severity: PlanValidationSeverity;
  ruleCode: string;
  elementId?: string;
  title: string;
  description: string;
  suggestedAction?: string;
  professionalReview: boolean;
}

interface ValidationInput {
  plan: Plan;
  project: Project;
  blocks: BuildingBlock[];
  documentConfigurations: ProjectDocumentConfiguration[];
  documentTemplates: DocumentTemplate[];
  t: (key: string, params?: Record<string, string | number>) => string;
}

function elementName(plan: Plan, project: Project, blocks: Map<string, BuildingBlock>, elementId: string, t: ValidationInput["t"]): string {
  const element = plan.layout.elements.find((candidate) => candidate.id === elementId);
  if (!element) return t("editor.validation.unknownElement");
  if (element.kind === "block") {
    const item = plan.sections.find((section) => section.id === element.sectionId)?.items.find((candidate) => candidate.id === element.itemId);
    const block = item ? blocks.get(item.blockId) : undefined;
    return block ? item?.customTitle?.[plan.documentLocale] ?? block.translations[plan.documentLocale].title : element.id;
  }
  if (element.kind === "image" || element.kind === "pdf_page") return project.assets.find((asset) => asset.id === element.assetId)?.filename ?? element.id;
  if (element.kind === "text") return element.text[plan.documentLocale]?.slice(0, 48) || t("editor.element.text");
  return t(`editor.element.${element.kind}`);
}

export function createPlanValidationIssues({ plan, project, blocks, documentConfigurations, documentTemplates, t }: ValidationInput): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  const addElementIssue = (ruleCode: string, elementId: string, descriptionKey: string, suggestedActionKey: string) => {
    const name = elementName(plan, project, blockMap, elementId, t);
    issues.push({
      id: `${ruleCode}:${elementId}`,
      severity: "warning",
      ruleCode,
      elementId,
      title: t("editor.validation.elementIssue", { name }),
      description: t(descriptionKey, { name }),
      suggestedAction: t(suggestedActionKey),
      professionalReview: false,
    });
  };

  for (const element of plan.layout.elements.filter((candidate) => !candidate.hidden && candidate.kind !== "block_area")) {
    const outsideSafeArea = element.x < plan.layout.safeMargin || element.y < plan.layout.safeMargin
      || element.x + element.width > plan.layout.width - plan.layout.safeMargin
      || element.y + element.height > plan.layout.height - plan.layout.safeMargin;
    if (outsideSafeArea) addElementIssue("LAYOUT_OUTSIDE_SAFE_AREA", element.id, "editor.validation.outsideDescription", "editor.validation.moveInside");

    if (element.kind === "image") {
      const asset = project.assets.find((candidate) => candidate.id === element.assetId);
      const lowResolution = asset?.width && asset.height
        ? asset.width / (element.width / 10 / 25.4) < 150 || asset.height / (element.height / 10 / 25.4) < 150
        : false;
      if (lowResolution) addElementIssue("IMAGE_LOW_RESOLUTION", element.id, "editor.validation.resolutionDescription", "editor.validation.replaceImage");
    }

    if (element.kind === "block") {
      const item = plan.sections.find((section) => section.id === element.sectionId)?.items.find((candidate) => candidate.id === element.itemId);
      const block = item ? blockMap.get(item.blockId) : undefined;
      const text = item && block ? item.customShortDescription?.[plan.documentLocale] ?? block.translations[plan.documentLocale].shortDescription : "";
      const estimatedCapacity = Math.max(40, Math.floor((element.width / 120) * (element.height / 150)));
      if (text.length > estimatedCapacity) addElementIssue("TEXT_OVERFLOW", element.id, "editor.validation.overflowDescription", "editor.validation.resizeOrShorten");
    }

    if ((element.kind === "block" || element.kind === "text") && (element.width < 800 || element.height < 280)) {
      addElementIssue("PRINT_TEXT_TOO_SMALL", element.id, "editor.validation.smallTextDescription", "editor.validation.enlargeElement");
    }
  }

  if (!plan.sections.some((section) => section.items.length > 0)) issues.push({ id: "PLAN_NO_BLOCKS", severity: "error", ruleCode: "PLAN_NO_BLOCKS", title: t("editor.noBlocks"), description: t("editor.validation.noBlocksDescription"), suggestedAction: t("editor.validation.addBlock"), professionalReview: false });
  if (!project.participants.some((participant) => participant.role === "coordinator")) issues.push({ id: "PROJECT_NO_COORDINATOR", severity: "error", ruleCode: "PROJECT_NO_COORDINATOR", title: t("editor.missingCoordinator"), description: t("editor.validation.coordinatorDescription"), suggestedAction: t("editor.validation.openOverview"), professionalReview: false });
  for (const configuration of documentConfigurations.filter((candidate) => candidate.projectId === project.id)) {
    const template = documentTemplates.find((candidate) => candidate.id === configuration.templateId);
    if (!template || template.validation?.status === "invalid") issues.push({ id: `DOCUMENT_TEMPLATE_INVALID:${configuration.id}`, severity: "error", ruleCode: "DOCUMENT_TEMPLATE_INVALID", title: t("editor.invalidTemplate"), description: t("editor.validation.templateDescription"), suggestedAction: t("editor.validation.openTemplates"), professionalReview: false });
  }
  if (project.emergencyContacts.length === 0) issues.push({ id: "PROJECT_NO_EMERGENCY_CONTACTS", severity: "warning", ruleCode: "PROJECT_NO_EMERGENCY_CONTACTS", title: t("editor.missingEmergency"), description: t("editor.validation.emergencyDescription"), suggestedAction: t("editor.validation.openOverview"), professionalReview: true });
  issues.push({ id: "PLAN_REVIEW_REQUIRED", severity: "information", ruleCode: "PLAN_REVIEW_REQUIRED", title: t("editor.validation.reviewTitle"), description: t("editor.validation.reviewDescription"), professionalReview: true });
  return issues.sort((left, right) => ({ error: 0, warning: 1, information: 2 })[left.severity] - ({ error: 0, warning: 1, information: 2 })[right.severity] || left.id.localeCompare(right.id));
}
