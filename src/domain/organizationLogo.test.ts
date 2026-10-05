import { describe, expect, it } from "vitest";
import { MAX_ORGANIZATION_LOGO_BYTES, prepareOrganizationLogo } from "./organizationLogo";

describe("organization logos", () => {
  it("rejects active content, mismatched extensions, and empty images", async () => {
    for (const file of [
      new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }),
      new File(["<svg/>"], "logo.png", { type: "image/png" }),
      new File(["not an image"], "logo.exe", { type: "image/png" }),
      new File([], "logo.jpg", { type: "image/jpeg" }),
    ]) await expect(prepareOrganizationLogo(file)).rejects.toThrow();
  });

  it("rejects oversized uploads before decoding them", async () => {
    const file = new File([new Uint8Array(MAX_ORGANIZATION_LOGO_BYTES + 1)], "large.png", { type: "image/png" });
    await expect(prepareOrganizationLogo(file)).rejects.toThrow("invalid-image");
  });
});
