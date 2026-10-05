import { blobDataUrl, getBlob } from "../data/blobRepository";
import { hydrateBlockImages } from "../domain/blockImages";
import { projectDocumentStem } from "../domain/projectMetadata";
import { activePlanForProject } from "../domain/planLifecycle";
import type { AppDatabase, DocumentTemplate, Project } from "../domain/types";
import { hydrateOrganizationLogo } from "./organizationData";
import { blobToArrayBuffer, buildTemplateData, createStandardTemplate, inspectTemplate, renderTemplate, type TemplateData, type TemplateInspection } from "./templateEngine";

export interface PreparedWordDocument {
  templateBuffer: ArrayBuffer;
  data: TemplateData;
  inspection: TemplateInspection;
  filename: string;
}

export async function loadWordTemplate(template: DocumentTemplate): Promise<ArrayBuffer> {
  const blob = template.origin === "standard"
    ? await createStandardTemplate(template.documentType, template.locale)
    : template.blobId ? await getBlob(template.blobId) : undefined;
  if (!blob) throw new Error("template_file_missing");
  return blobToArrayBuffer(blob);
}

export async function prepareProjectWordDocument(database: AppDatabase, project: Project, template: DocumentTemplate): Promise<PreparedWordDocument> {
  const plan = activePlanForProject(database.plans, project.id);
  const usedBlockIds = new Set(plan?.sections.flatMap((section) => section.items.map((item) => item.blockId)) ?? []);
  const templateBuffer = await loadWordTemplate(template);
  const [blocks, organization, assets] = await Promise.all([
    hydrateBlockImages(database.blocks.filter((block) => usedBlockIds.has(block.id))),
    hydrateOrganizationLogo(database.organization),
    Promise.all(project.assets.map(async (asset) => ({
      ...asset,
      dataUrl: asset.mimeType.startsWith("image/") ? await blobDataUrl(asset.blobId, asset.dataUrl) : asset.dataUrl,
    }))),
  ]);
  const data = buildTemplateData({ ...project, assets }, plan, template.locale, blocks, database.categories, organization);
  const inspection = await inspectTemplate(templateBuffer, data);
  const templateStem = projectDocumentStem({ name: template.name });
  return { templateBuffer, data, inspection, filename: `${projectDocumentStem(project)}-${templateStem}.docx` };
}

export function renderPreparedWordDocument(document: PreparedWordDocument): Promise<Blob> {
  return renderTemplate(document.templateBuffer, document.data);
}
