import JSZip from "jszip";
import type { ProjectAsset } from "./types";

export const MAX_PROJECT_ASSET_BYTES = 10 * 1024 * 1024;
export const MAX_PROJECT_ASSET_TOTAL_BYTES = 50 * 1024 * 1024;
export const ALLOWED_PROJECT_ASSET_TYPES: ProjectAsset["mimeType"][] = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const expectedExtensions: Record<ProjectAsset["mimeType"], string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
};

const OOXML_DOCUMENT_PARTS: Partial<Record<ProjectAsset["mimeType"], string>> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word/document.xml",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xl/workbook.xml",
};
const UNSAFE_OOXML_PART = /(^|\/)(vbaProject\.bin|activeX|embeddings)(\/|$)/i;

interface AssetFileDescriptor {
  name: string;
  type: string;
  size: number;
}

function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("Unexpected binary file result"));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export type AssetValidationResult =
  | { valid: true; filename: string; mimeType: ProjectAsset["mimeType"] }
  | { valid: false; reason: "type" | "size" | "name" };

export function sanitizeAssetFilename(filename: string): string {
  const basename = filename
    .replaceAll("\\", "/")
    .split("/")
    .pop() ?? "";
  return [...basename]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint !== 127;
    })
    .join("")
    .trim()
    .slice(0, 140);
}

export function validateProjectAsset(file: AssetFileDescriptor): AssetValidationResult {
  const filename = sanitizeAssetFilename(file.name);
  if (!filename || !filename.includes(".")) return { valid: false, reason: "name" };
  if (file.size <= 0 || file.size > MAX_PROJECT_ASSET_BYTES) return { valid: false, reason: "size" };
  if (!ALLOWED_PROJECT_ASSET_TYPES.includes(file.type as ProjectAsset["mimeType"])) {
    return { valid: false, reason: "type" };
  }
  const mimeType = file.type as ProjectAsset["mimeType"];
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!expectedExtensions[mimeType].includes(extension)) return { valid: false, reason: "type" };
  return { valid: true, filename, mimeType };
}

export function isValidProjectAssetFilename(filename: string, mimeType: ProjectAsset["mimeType"]): boolean {
  const sanitizedFilename = sanitizeAssetFilename(filename);
  const extension = sanitizedFilename.split(".").pop()?.toLowerCase() ?? "";
  return sanitizedFilename === filename.trim() && expectedExtensions[mimeType].includes(extension);
}

export function projectAssetTypeLabel(mimeType: ProjectAsset["mimeType"]): string {
  if (mimeType === "image/png") return "PNG";
  if (mimeType === "image/jpeg") return "JPG";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "DOCX";
  return "XLSX";
}

export async function hasValidProjectAssetSignature(file: Blob, mimeType: ProjectAsset["mimeType"]): Promise<boolean> {
  const signatureBuffer = await readBlobArrayBuffer(file.slice(0, 8));
  const bytes = new Uint8Array(signatureBuffer);
  if (mimeType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  }
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "application/pdf") {
    return [0x25, 0x50, 0x44, 0x46, 0x2d].every((value, index) => bytes[index] === value);
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  try {
    const archive = await JSZip.loadAsync(await readBlobArrayBuffer(file));
    const packageParts = Object.keys(archive.files);
    const requiredPart = OOXML_DOCUMENT_PARTS[mimeType];
    if (!requiredPart) return false;
    const hasContentTypes = archive.file("[Content_Types].xml") !== null;
    const hasRequiredDocumentPart = archive.file(requiredPart) !== null;
    const hasUnsafePart = packageParts.some((part) => UNSAFE_OOXML_PART.test(part));
    return hasContentTypes && hasRequiredDocumentPart && !hasUnsafePart;
  } catch {
    return false;
  }
}

export async function readValidatedImageDataUrl(file: File, maximumBytes = MAX_PROJECT_ASSET_BYTES): Promise<string> {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size <= 0 || file.size > maximumBytes) {
    throw new Error("invalid-image");
  }
  if (!await hasValidProjectAssetSignature(file, file.type as "image/png" | "image/jpeg")) {
    throw new Error("invalid-image-signature");
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("invalid-image-result"));
    reader.onerror = () => reject(reader.error ?? new Error("image-read-failed"));
    reader.readAsDataURL(file);
  });
}
