import type { DocumentTemplate } from "../domain/types";
import catalog from "./wordTemplateCatalog.json";

export const BUNDLED_WORD_TEMPLATES_SCHEMA_VERSION = 39;
export const BUNDLED_WORD_TEMPLATE_CATALOG = catalog;
const BUNDLED_TEMPLATE_TIMESTAMP = "2026-10-05T00:00:00.000Z";
const BUNDLED_BLOB_PREFIX = "bundled-word-template:";

export function createBundledWordTemplates(organizationId: string): DocumentTemplate[] {
  return catalog.map(({ slug, name, filename }) => ({
    id: `word-template-${slug}`,
    organizationId,
    name,
    documentType: "project_document",
    locale: "de",
    origin: "custom",
    blobId: `${BUNDLED_BLOB_PREFIX}${slug}`,
    filename,
    description: "Bearbeitbare Word-Vorlage mit Organisations- und Projektplatzhaltern",
    lifecycle: "active",
    revision: 1,
    createdAt: BUNDLED_TEMPLATE_TIMESTAMP,
    updatedAt: BUNDLED_TEMPLATE_TIMESTAMP,
  }));
}

export function bundledWordTemplateUrl(blobId: string): string | undefined {
  const entry = catalog.find(({ slug }) => blobId === `${BUNDLED_BLOB_PREFIX}${slug}`);
  return entry ? `${import.meta.env.BASE_URL}word-templates/${entry.filename}` : undefined;
}
