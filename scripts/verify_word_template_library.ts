import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createSeedDatabase } from "../src/data/seed";
import { projectWithResolvedParticipants } from "../src/domain/contacts";
import { blobToArrayBuffer, buildTemplateData, inspectTemplate, renderTemplate, validateTemplateFile } from "../src/documents/templateEngine";

const outputDirectory = resolve(process.argv[2] ?? "/private/tmp/quickreports-template-suite/generated");
const database = createSeedDatabase();
const project = projectWithResolvedParticipants(database, database.projects[0]);
const assets = await Promise.all(project.assets.map(async (asset) => ({
  ...asset,
  dataUrl: asset.mimeType.startsWith("image/") && asset.dataUrl?.startsWith("/")
    ? `data:${asset.mimeType};base64,${(await readFile(resolve("public", asset.dataUrl.slice(1)))).toString("base64")}` : asset.dataUrl,
})));
const logoDataUrl = `data:image/png;base64,${(await readFile("src/assets/example-organization-logo.png")).toString("base64")}`;
const data = buildTemplateData({ ...project, assets }, undefined, "de", database.blocks, database.categories, { ...database.organization, logoDataUrl });
await mkdir(outputDirectory, { recursive: true });
for (const template of database.documentTemplates.filter((candidate) => candidate.blobId?.startsWith("bundled-word-template:"))) {
  const bytes = await readFile(resolve("public/word-templates", template.filename));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const validation = await validateTemplateFile(buffer, template.filename);
  const inspection = await inspectTemplate(buffer, data);
  if (!validation.valid || inspection.missingPlaceholders.length || inspection.unsafeCommands.length) {
    throw new Error(`${template.name}: ${JSON.stringify({ validation, inspection })}`);
  }
  const document = await renderTemplate(buffer, data);
  await writeFile(resolve(outputDirectory, template.filename), Buffer.from(await blobToArrayBuffer(document)));
  console.log(`${template.name}: ${inspection.placeholders.length} placeholders resolved`);
}
