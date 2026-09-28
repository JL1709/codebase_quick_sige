import { describe, expect, it } from "vitest";
import { translations, translate } from "./translations";
import { formatLocalizedDate } from "./I18nProvider";

describe("UI translations", () => {
  it("keeps German and English catalogs structurally aligned", () => {
    expect(Object.keys(translations.de).sort()).toEqual(Object.keys(translations.en).sort());
  });

  it("replaces named parameters", () => {
    expect(translate("de", "assessment.progress", { current: 2, total: 4 })).toContain("2");
    expect(translate("en", "recommendations.subtitle", { count: 7 })).toContain("7");
  });

  it("formats valid dates without crashing on incomplete project data", () => {
    expect(formatLocalizedDate("de", "2026-10-12")).toBe("12.10.2026");
    expect(formatLocalizedDate("en", "")).toBe("—");
    expect(formatLocalizedDate("de", "invalid-date")).toBe("—");
  });
});
