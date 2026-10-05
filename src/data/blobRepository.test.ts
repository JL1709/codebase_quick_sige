import { afterEach, describe, expect, it, vi } from "vitest";
import { blobDataUrl, getBlob } from "./blobRepository";
import { bundledWordTemplateUrl, createBundledWordTemplates } from "./bundledWordTemplates";

afterEach(() => vi.unstubAllGlobals());

describe("bundled document blobs", () => {
  it("loads catalog files through the normal blob repository", async () => {
    const template = createBundledWordTemplates("organization-test")[0];
    const blob = new Blob(["docx bytes"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetchMock);
    expect(await getBlob(template.blobId!)).toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith(`/word-templates/${template.filename}`);
    expect(bundledWordTemplateUrl("bundled-word-template:../../private-file")).toBeUndefined();
  });

  it("hydrates a bundled project image to a data URL for image placeholders", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await blobDataUrl(undefined, "/project-documents/site-plan.png")).toBe("data:image/png;base64,AQID");
    expect(fetchMock).toHaveBeenCalledWith("/project-documents/site-plan.png");
  });

  it("does not fetch protocol-relative image URLs from another origin", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await blobDataUrl(undefined, "//external.example/image.png")).toBe("//external.example/image.png");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
