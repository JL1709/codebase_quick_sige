import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { blobToArrayBuffer, createStandardTemplate } from "../src/documents/templateEngine";
import type { Locale } from "../src/domain/types";

const requestedLocale = process.argv[2];
const locale: Locale = requestedLocale === "en" ? "en" : "de";
const defaultFilename = `QuickSiGe-A4-Word-Template-${locale.toUpperCase()}.docx`;
const outputPath = path.resolve(process.argv[3] ?? path.join("artifacts", defaultFilename));

await mkdir(path.dirname(outputPath), { recursive: true });
const template = await createStandardTemplate("a4_plan", locale);
await writeFile(outputPath, Buffer.from(await blobToArrayBuffer(template)));

console.log(outputPath);
