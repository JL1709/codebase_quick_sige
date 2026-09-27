import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSeedDatabase } from "../src/data/seed";
import { blobToArrayBuffer, buildTemplateData, createStandardTemplate, renderTemplate } from "../src/documents/templateEngine";
import type { DocumentType } from "../src/domain/types";
import { buildPlanPdf } from "../src/export/exports";

const outputDirectory = path.resolve(process.argv[2] ?? "/private/tmp/quicksige-export-qa");
const database = createSeedDatabase();
const project = database.projects[0];
const plan = structuredClone(database.plans[0]);
const header = plan.layout.elements.find((element) => element.kind === "header");
const titleBlock = plan.layout.elements.find((element) => element.kind === "title_block");
if (header?.kind === "header") {
  header.brandText = { ...header.brandText, de: "QS Safety" };
  header.titleText = { ...header.titleText, de: "Sicherheitsplan - Exportpruefung" };
  header.projectNameText = { ...header.projectNameText, de: "Logistikzentrum Exportpruefung" };
  header.projectDetailsText = { ...header.projectDetailsText, de: "QS-2026-014 - Exportgelaende Leipzig" };
  header.statusText = { ...header.statusText, de: "Freigabe QA" };
}
if (titleBlock?.kind === "title_block") {
  titleBlock.projectNameText = { ...titleBlock.projectNameText, de: "Exportprojekt West" };
  titleBlock.coordinatorText = { ...titleBlock.coordinatorText, de: "Max Export" };
  titleBlock.referenceText = { ...titleBlock.referenceText, de: "QS-QA - Revision B" };
}
if (plan.sections[0]) {
  plan.sections[0].titleOverrides = { ...plan.sections[0].titleOverrides, de: "Export-Koordination" };
}

await mkdir(outputDirectory, { recursive: true });

const planPdf = buildPlanPdf(project, plan, database.blocks, database.categories);
await writeFile(path.join(outputDirectory, "demo-sige-plan-a0.pdf"), Buffer.from(planPdf.output("arraybuffer")));

const documentTypes: DocumentType[] = ["a4_plan", "site_rules", "alarm_plan", "fire_safety", "first_aid", "participants", "advance_notice"];
const templateData = buildTemplateData(project, plan, database.blocks);
for (const type of documentTypes) {
  const template = await createStandardTemplate(type, project.documentLocale);
  const document = await renderTemplate(await blobToArrayBuffer(template), templateData);
  await writeFile(path.join(outputDirectory, `demo-${type.replaceAll("_", "-")}.docx`), Buffer.from(await blobToArrayBuffer(document)));
}

console.log(outputDirectory);
