import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSeedDatabase } from "../src/data/seed";
import { blobToArrayBuffer, buildTemplateData, createStandardTemplate, renderTemplate } from "../src/documents/templateEngine";
import type { DocumentType } from "../src/domain/types";
import { buildPlanPdf } from "../src/export/exports";

const outputDirectory = path.resolve(process.argv[2] ?? "/private/tmp/quicksige-export-qa");
const database = createSeedDatabase();
const project = database.projects[0];
const plan = database.plans[0];

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
