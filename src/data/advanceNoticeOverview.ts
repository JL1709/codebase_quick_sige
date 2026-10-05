import type { OverviewTemplate, OverviewTemplateEntry, ProjectOverviewSection } from "../domain/types";
import { instantiateOverviewSection } from "../domain/overviewTemplates";

const TIMESTAMP = "2026-10-05T00:00:00.000Z";
export const ADVANCE_NOTICE_TEMPLATE_ID = "overview-template-advance-notice";
const ENGLISH_LABELS: Record<string, string> = {
  "Behörde": "Authority", "Name": "Name", "Adresse": "Address", "Fax": "Fax", "Telefon": "Phone", "E-Mail": "Email",
  "Bauherr Adresse": "Client address", "Verantwortlicher Dritter": "Responsible third party",
  "Koordination Planung": "Planning coordination", "Koordination Ausführung": "Construction coordination",
  "Höchstzahl Beschäftigte": "Maximum workers", "Zahl Arbeitgeber": "Number of employers",
  "Zahl Unternehmer ohne Beschäftigte": "Number of self-employed contractors", "Ausgewählte Unternehmen": "Selected companies",
};

const textField = (key: string, label: string): OverviewTemplateEntry => ({
  id: `advance-notice-${key}`, label, type: "text", defaultValue: "", children: [],
  translations: { en: { label: ENGLISH_LABELS[label], defaultValue: "" } },
});
const group = (key: string, label: string, fields: string[]): OverviewTemplateEntry => ({
  id: `advance-notice-${key}`, label, type: "group", defaultValue: "",
  children: fields.map((field, index) => textField(`${key}-${index}`, field)),
  translations: { en: { label: ENGLISH_LABELS[label], defaultValue: "" } },
});

export function createAdvanceNoticeOverviewTemplate(organizationId: string): OverviewTemplate {
  return {
    id: ADVANCE_NOTICE_TEMPLATE_ID, organizationId, name: "Vorankündigung", sourceLocale: "de",
    translations: { en: { name: "Advance notice" } },
    entries: [
      group("authority", "Behörde", ["Name", "Adresse", "Fax"]),
      textField("client-address", "Bauherr Adresse"),
      group("third-party", "Verantwortlicher Dritter", ["Name", "Adresse"]),
      group("planning", "Koordination Planung", ["Name", "Adresse", "Telefon", "Fax", "E-Mail"]),
      group("execution", "Koordination Ausführung", ["Name", "Adresse", "Telefon", "Fax", "E-Mail"]),
      textField("workers", "Höchstzahl Beschäftigte"),
      textField("employers", "Zahl Arbeitgeber"),
      textField("self-employed", "Zahl Unternehmer ohne Beschäftigte"),
      textField("selected-employers", "Ausgewählte Unternehmen"),
    ],
    createdAt: TIMESTAMP, updatedAt: TIMESTAMP,
  };
}

export function createExampleAdvanceNoticeSection(organizationId: string): ProjectOverviewSection {
  let identifierIndex = 0;
  const section = instantiateOverviewSection(createAdvanceNoticeOverviewTemplate(organizationId), (prefix) => `example-advance-notice-${prefix}-${identifierIndex++}`);
  const values: Record<string, string | Record<string, string>> = {
    "Behörde": { Name: "Arbeitsschutzbehörde Musterregion", Adresse: "Behördenstraße 8, 04109 Leipzig", Fax: "+49341555080" },
    "Bauherr Adresse": "Projektstraße 4, 04109 Leipzig",
    "Verantwortlicher Dritter": { Name: "", Adresse: "" },
    "Koordination Planung": { Name: "Max Mustermann · Sicher Planen Ingenieure", Adresse: "Musterstraße 12a, 04109 Leipzig", Telefon: "+49341555220", Fax: "+49341555229", "E-Mail": "max@example.test" },
    "Koordination Ausführung": { Name: "Max Mustermann · Sicher Planen Ingenieure", Adresse: "Musterstraße 12a, 04109 Leipzig", Telefon: "+49341555220", Fax: "+49341555229", "E-Mail": "max@example.test" },
    "Höchstzahl Beschäftigte": "48",
    "Zahl Arbeitgeber": "14",
    "Zahl Unternehmer ohne Beschäftigte": "2",
    "Ausgewählte Unternehmen": "Bauwerk Generalbau AG; Studio Nord Architektur",
  };
  for (const entry of section.entries) {
    const value = values[entry.label];
    if (typeof value === "string") entry.value = value;
    else if (value) for (const child of entry.children) child.value = value[child.label] ?? "";
  }
  return section;
}
