import { describe, expect, it } from "vitest";
import { hasValidProjectAssetSignature, MAX_PROJECT_ASSET_BYTES, readValidatedImageDataUrl, sanitizeAssetFilename, validateProjectAsset } from "./projectAssets";

describe("project asset validation", () => {
  it("accepts supported files when MIME type and extension agree", () => {
    expect(validateProjectAsset({ name: "site-layout.pdf", type: "application/pdf", size: 42_000 })).toEqual({
      valid: true,
      filename: "site-layout.pdf",
      mimeType: "application/pdf",
    });
  });

  it("rejects mismatched types and oversized files", () => {
    expect(validateProjectAsset({ name: "payload.jpg", type: "application/pdf", size: 1_000 })).toEqual({ valid: false, reason: "type" });
    expect(validateProjectAsset({ name: "large.png", type: "image/png", size: MAX_PROJECT_ASSET_BYTES + 1 })).toEqual({ valid: false, reason: "size" });
  });

  it("strips path and control characters from filenames", () => {
    expect(sanitizeAssetFilename("../unsafe\u0000/site-plan.png")).toBe("site-plan.png");
  });

  it("checks decoded file signatures instead of trusting browser metadata", async () => {
    expect(await hasValidProjectAssetSignature(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])]), "application/pdf")).toBe(true);
    expect(await hasValidProjectAssetSignature(new Blob(["not a pdf"]), "application/pdf")).toBe(false);
  });

  it("only converts small signature-verified PNG and JPEG files to data URLs", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "block.png", { type: "image/png" });
    await expect(readValidatedImageDataUrl(png)).resolves.toMatch(/^data:image\/png;base64,/);
    const disguised = new File([new Uint8Array([1, 2, 3, 4])], "block.png", { type: "image/png" });
    await expect(readValidatedImageDataUrl(disguised)).rejects.toThrow("invalid-image-signature");
  });
});
