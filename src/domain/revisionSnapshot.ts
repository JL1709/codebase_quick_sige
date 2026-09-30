import type { AppDatabase, Plan, Project, RevisionSnapshot } from "./types";
import { projectWithResolvedParticipants } from "./contacts";

/**
 * A publication owns a deep copy of every mutable record needed for later exports.
 * Keeping this pure makes immutability verifiable independently from React state.
 */
export function buildRevisionSnapshot(
  database: AppDatabase,
  project: Project,
  plan: Plan,
): RevisionSnapshot {
  const usedBlockIds = new Set(plan.sections.flatMap((section) => section.items.map((item) => item.blockId)));
  const documentConfigurations = database.documentConfigurations.filter(
    (configuration) => configuration.projectId === project.id,
  );
  const configuredTemplateIds = new Set(documentConfigurations.map((configuration) => configuration.templateId));
  const resolvedProject = projectWithResolvedParticipants(database, project);
  return structuredClone({
    project: resolvedProject,
    plan,
    blocks: database.blocks.filter((block) => usedBlockIds.has(block.id)),
    categories: database.categories,
    documentTemplates: database.documentTemplates.filter(
      (template) => template.lifecycle !== "archived" || configuredTemplateIds.has(template.id),
    ),
    documentConfigurations,
    generatedDocuments: database.generatedDocuments.filter((document) => document.projectId === project.id),
  });
}
