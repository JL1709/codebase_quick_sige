import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSeedDatabase } from "../src/data/seed";
import { blobToArrayBuffer, buildTemplateData, createStandardTemplate, renderTemplate } from "../src/documents/templateEngine";
import { buildPlanPdf } from "../src/export/exports";
import { projectWithResolvedParticipants } from "../src/domain/contacts";

const outputDirectory = path.resolve(process.argv[2] ?? "/private/tmp/quicksige-export-qa");
const database = createSeedDatabase();
const project = projectWithResolvedParticipants(database, database.projects[0]);
const plan = structuredClone(database.plans[0]);
const blocksWithImages = await Promise.all(database.blocks.map(async (block) => {
  if (!block.imageDataUrl?.startsWith("/block-images/")) return block;
  const imageBytes = await readFile(path.resolve("public", block.imageDataUrl.slice(1)));
  return { ...block, imageDataUrl: `data:image/png;base64,${imageBytes.toString("base64")}` };
}));
const header = plan.layout.elements.find((element) => element.kind === "header");
const titleBlock = plan.layout.elements.find((element) => element.kind === "title_block");
if (header?.kind === "header") {
  header.brandText = { ...header.brandText, de: "QS Safety" };
  header.titleText = { ...header.titleText, de: "Sicherheitsplan - Exportpruefung" };
  header.projectNameText = { ...header.projectNameText, de: "Logistikzentrum Exportpruefung" };
  header.projectDetailsText = { ...header.projectDetailsText, de: "Exportgelaende Leipzig" };
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

const planPdf = buildPlanPdf(project, plan, database.blocks, database.categories, database.user.preferredLocale);
await writeFile(path.join(outputDirectory, "demo-sige-plan-a0.pdf"), Buffer.from(planPdf.output("arraybuffer")));

const templateData = buildTemplateData(project, plan, database.user.preferredLocale, blocksWithImages, database.categories);
const template = await createStandardTemplate("a4_plan", database.user.preferredLocale);
const document = await renderTemplate(await blobToArrayBuffer(template), templateData);
await writeFile(path.join(outputDirectory, "demo-a4-plan.docx"), Buffer.from(await blobToArrayBuffer(document)));

console.log(outputDirectory);
