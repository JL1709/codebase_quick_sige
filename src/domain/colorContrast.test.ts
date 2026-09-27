import { describe, expect, it } from "vitest";
import { contrastRatio, readableTextColor } from "./colorContrast";

const SEEDED_ACCENT_COLORS = ["#d9a928", "#d56b54", "#2b8a65", "#b65b32", "#4e7db7", "#44735f", "#a64049", "#8d8142"];

describe("color contrast", () => {
  it("chooses the higher-contrast plan heading color", () => {
    expect(readableTextColor("#d56b54")).toBe("#07100d");
    expect(readableTextColor("#2b8a65")).toBe("#07100d");
    expect(readableTextColor("#a64049")).toBe("#ffffff");
  });

  it("keeps seeded plan headings above the WCAG AA text threshold", () => {
    for (const backgroundColor of SEEDED_ACCENT_COLORS) {
      expect(contrastRatio(backgroundColor, readableTextColor(backgroundColor))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("falls back safely for invalid colors", () => {
    expect(readableTextColor("invalid")).toBe("#07100d");
  });
});
