import { readValidatedImageDataUrl, sanitizeAssetFilename } from "./projectAssets";
import type { OrganizationLogo } from "./types";

export const MAX_ORGANIZATION_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_ORGANIZATION_LOGO_PIXELS = 16_000_000;
export const ORGANIZATION_LOGO_ACCEPT = ".png,.jpg,.jpeg,image/png,image/jpeg";

export async function prepareOrganizationLogo(file: File): Promise<Omit<OrganizationLogo, "blobId"> & { dataUrl: string }> {
  const filename = sanitizeAssetFilename(file.name);
  const extension = filename.split(".").at(-1)?.toLowerCase();
  if (!filename || !(file.type === "image/png" && extension === "png") && !(file.type === "image/jpeg" && ["jpg", "jpeg"].includes(extension ?? ""))) {
    throw new Error("invalid-logo");
  }
  const dataUrl = await readValidatedImageDataUrl(file, MAX_ORGANIZATION_LOGO_BYTES);
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height || width * height > MAX_ORGANIZATION_LOGO_PIXELS) throw new Error("invalid-logo-dimensions");
  return { filename, mimeType: file.type as OrganizationLogo["mimeType"], width, height, dataUrl };
}
