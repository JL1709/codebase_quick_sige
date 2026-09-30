import { createPlanFromAssessment } from "../domain/recommendationEngine";
import { migrateLegacyProjectContacts } from "../domain/contacts";
import { defaultBlockImageSource } from "../domain/blockImages";
import { categoryPlacementIds } from "../domain/categoryTree";
import { legacyProjectOverviewSections } from "../domain/projectOverview";
import { normalizeProjectOverviewSectionOrder, PROJECT_PARTICIPANTS_SECTION_ID } from "../domain/projectOverviewOrder";
import type {
  AppDatabase,
  AssessmentAnswers,
  BuildingBlock,
  BuildingBlockCategory,
  Locale,
  LocalizedBuildingBlockContent,
  Plan,
  PlanAssetElement,
  Project,
} from "../domain/types";

const createdAt = "2026-09-26T08:30:00.000Z";

function localizedContent(
  de: [string, string, string, string[]],
  en: [string, string, string, string[]],
): BuildingBlock["translations"] {
  const build = (content: [string, string, string, string[]]): LocalizedBuildingBlockContent => ({
    title: content[0],
    shortDescription: content[1],
    longDescription: content[2],
    searchTerms: content[3],
  });
  return { de: build(de), en: build(en) };
}

const categoryDefinitions: Array<Omit<BuildingBlockCategory, "sortOrder" | "lifecycle">> = [
  {
    id: "preparation",
    color: "#8a6a24",
    translations: {
      de: { name: "Baustellenvorbereitung", description: "Baufeld, Bestand und vorbereitende Erkundungen" },
      en: { name: "Site preparation", description: "Construction area, existing conditions, and preparatory surveys" },
    },
  },
  {
    id: "site-setup",
    color: "#c8644d",
    translations: {
      de: { name: "Baustelleneinrichtung", description: "Zugang, Versorgung, Verkehrswege und Notfallorganisation" },
      en: { name: "Site setup", description: "Access, utilities, traffic routes, and emergency organization" },
    },
  },
  {
    id: "earthworks",
    color: "#a85a32",
    translations: {
      de: { name: "Erdarbeiten", description: "Baugruben, Gräben und Arbeiten im Boden" },
      en: { name: "Earthworks", description: "Excavations, trenches, and ground works" },
    },
  },
  {
    id: "work-at-height",
    color: "#4f75a8",
    translations: {
      de: { name: "Arbeiten in der Höhe", description: "Absturzschutz, Gerüste und Zugänge" },
      en: { name: "Work at height", description: "Fall protection, scaffolding, and access" },
    },
  },
  {
    id: "operations",
    color: "#496f5f",
    translations: {
      de: { name: "Betrieb und Arbeitsverfahren", description: "Wechselwirkungen, Maschinen und besondere Verfahren" },
      en: { name: "Operations and methods", description: "Interactions, machinery, and special methods" },
    },
  },
  {
    id: "hazardous-work",
    color: "#9c3e45",
    translations: {
      de: { name: "Besondere Gefährdungen", description: "Gefahrstoffe, Heißarbeiten und enge Räume" },
      en: { name: "Special hazards", description: "Hazardous substances, hot work, and confined spaces" },
    },
  },
  {
    id: "environment",
    color: "#8b7b3f",
    translations: {
      de: { name: "Witterung und Umgebung", description: "Saisonale und umgebungsbedingte Maßnahmen" },
      en: { name: "Weather and environment", description: "Seasonal and environmental measures" },
    },
  },
  {
    id: "site-access-emergency",
    parentId: "site-setup",
    translations: {
      de: { name: "Zugänge und Notfallorganisation", description: "Zutritt, Verkehrswege, Erste Hilfe und Alarmierung" },
      en: { name: "Access and emergency organization", description: "Access, traffic routes, first aid, and alerts" },
    },
  },
  {
    id: "site-utilities",
    parentId: "site-setup",
    translations: {
      de: { name: "Versorgung und Infrastruktur", description: "Strom, Medien und Baustelleninfrastruktur" },
      en: { name: "Utilities and infrastructure", description: "Power, utilities, and site infrastructure" },
    },
  },
  {
    id: "height-fall-protection",
    parentId: "work-at-height",
    translations: {
      de: { name: "Absturzschutz und Gerüste", description: "Kollektiver Schutz und sichere Arbeitsplätze" },
      en: { name: "Fall protection and scaffolds", description: "Collective protection and safe workplaces" },
    },
  },
  {
    id: "hazardous-permit-work",
    parentId: "hazardous-work",
    translations: {
      de: { name: "Freigabepflichtige Arbeiten", description: "Heißarbeiten, Gefahrstoffe und enge Räume" },
      en: { name: "Permit-controlled work", description: "Hot work, hazardous substances, and confined spaces" },
    },
  },
  {
    id: "existing-underground-utilities",
    parentId: "preparation",
    translations: {
      de: { name: "Bestehende erdverlegte Versorgungsleitungen", description: "Leitungen, Kabel und Kanäle im Arbeitsbereich" },
      en: { name: "Existing underground utilities", description: "Pipes, cables, and ducts in the work area" },
    },
  },
  {
    id: "site-power-water",
    parentId: "site-utilities",
    translations: {
      de: { name: "Versorgung Baustrom, Bauwasser, mobile Tankanlagen", description: "Temporäre Energie- und Medienversorgung" },
      en: { name: "Temporary power, water, and mobile tanks", description: "Temporary energy and utility supply" },
    },
  },
  {
    id: "temporary-electrical-distribution",
    parentId: "site-power-water",
    translations: {
      de: { name: "Elektrische Baustellenverteilung", description: "Verteiler und elektrische Betriebsmittel" },
      en: { name: "Temporary electrical distribution", description: "Distribution boards and electrical equipment" },
    },
  },
  {
    id: "mobile-distribution-units",
    parentId: "temporary-electrical-distribution",
    translations: {
      de: { name: "Mobile Kleinverteiler", description: "Ortsveränderliche Verteiler für den Baustelleneinsatz" },
      en: { name: "Mobile distribution units", description: "Portable distribution boards for construction sites" },
    },
  },
  {
    id: "imported-site-security",
    parentId: "site-setup",
    translations: {
      de: { name: "Baustellensicherung", description: "Zäune und kontrollierte Baustellenbegrenzung" },
      en: { name: "Site security", description: "Fences and controlled site boundaries" },
    },
  },
];

export const seedCategories: BuildingBlockCategory[] = categoryDefinitions.map((category, sortOrder) => ({
  ...category,
  sortOrder,
  lifecycle: "active",
}));

const blockDefinitions = [
  {
    id: "block-existing-utilities",
    categoryId: "preparation",
    visualKey: "utilities",
    regulations: ["DGUV Vorschrift 38", "DIN 4124"],
    translations: localizedContent(
      ["Sicherer Umgang mit Bestandsleitungen", "Lage vorhandener Leitungen vor Beginn der Arbeiten ermitteln, kennzeichnen und sichern.", "Vor Erd- oder Bohrarbeiten sind Bestandsunterlagen einzuholen, Leitungsauskünfte zu prüfen und die tatsächliche Lage mit geeigneten Verfahren zu erkunden. Festgestellte Leitungen sind eindeutig zu kennzeichnen und gegen Beschädigung zu sichern.", ["Leitungen", "Kabel", "Kanäle", "Bestand"]],
      ["Safe handling of existing utilities", "Locate, mark, and protect existing utilities before work begins.", "Before excavation or drilling, obtain existing plans, verify utility information, and determine the actual location using suitable methods. Identified utilities must be clearly marked and protected against damage.", ["utilities", "cables", "pipes", "existing"]],
    ),
  },
  {
    id: "block-site-fencing",
    categoryId: "site-setup",
    visualKey: "fence",
    regulations: ["DGUV Vorschrift 38"],
    translations: localizedContent(
      ["Baustellensicherung", "Baufeld mit standsicherem Bauzaun sichern und Zugänge kontrollieren.", "Die Baustelle ist entsprechend der örtlichen Gefährdung gegen unbefugtes Betreten zu sichern. Zugänge sind eindeutig zu kennzeichnen, kontrollierbar zu gestalten und außerhalb der Arbeitszeit zu verschließen.", ["Bauzaun", "Zutritt", "Sicherung"]],
      ["Site security", "Secure the work area with stable fencing and control all access points.", "The construction site must be protected against unauthorized access in line with local hazards. Entrances must be clearly marked, controllable, and locked outside working hours.", ["fence", "access", "security"]],
    ),
  },
  {
    id: "block-site-access",
    categoryId: "site-setup",
    visualKey: "access",
    regulations: ["ASR A1.8", "DGUV Vorschrift 38"],
    translations: localizedContent(
      ["Sichere Baustellenzugänge", "Personen- und Fahrzeugzugänge trennen, kennzeichnen und freihalten.", "Zugänge und Verkehrswege sind tragfähig, ausreichend breit und sicher zu gestalten. Fuß- und Fahrverkehr sind nach Möglichkeit zu trennen; Rettungswege und Feuerwehrzufahrten müssen jederzeit frei bleiben.", ["Zugang", "Verkehrsweg", "Rettungsweg"]],
      ["Safe site access", "Separate, mark, and keep pedestrian and vehicle access routes clear.", "Access points and traffic routes must be stable, sufficiently wide, and safe. Pedestrian and vehicle traffic should be separated where possible; escape routes and fire service access must remain clear.", ["access", "traffic route", "escape route"]],
    ),
  },
  {
    id: "block-first-aid",
    categoryId: "site-setup",
    visualKey: "first-aid",
    regulations: ["DGUV Vorschrift 1", "ASR A4.3"],
    translations: localizedContent(
      ["Erste Hilfe organisieren", "Ersthelfer, Material, Rettungswege und Meldeeinrichtungen festlegen.", "Erste-Hilfe-Einrichtungen sind entsprechend Beschäftigtenzahl, Tätigkeiten und Baustellenlage bereitzustellen. Ersthelfer, Aufbewahrungsorte, Rettungspunkte und Alarmierungswege sind allen Beteiligten bekannt zu machen.", ["Erste Hilfe", "Ersthelfer", "Rettung"]],
      ["Organize first aid", "Define first aiders, supplies, rescue routes, and alerting facilities.", "First-aid facilities must reflect workforce size, activities, and site location. First aiders, supply locations, rescue points, and alerting procedures must be communicated to everyone involved.", ["first aid", "first aider", "rescue"]],
    ),
  },
  {
    id: "block-emergency-information",
    categoryId: "site-setup",
    visualKey: "emergency",
    regulations: ["ASR A2.3", "ASR A4.3"],
    translations: localizedContent(
      ["Notfallinformationen aushängen", "Alarmplan, Rettungswege und wichtige Rufnummern sichtbar bereitstellen.", "Aktuelle Notfallinformationen sind an zentralen und gut sichtbaren Stellen auszuhängen. Änderungen bei Ansprechpartnern, Zufahrten oder Rettungswegen sind unverzüglich nachzuführen.", ["Alarmplan", "Notruf", "Aushang"]],
      ["Post emergency information", "Display the emergency plan, rescue routes, and important telephone numbers.", "Current emergency information must be displayed in central, clearly visible locations. Changes to contacts, access points, or rescue routes must be updated immediately.", ["emergency plan", "emergency call", "notice"]],
    ),
  },
  {
    id: "block-temporary-power",
    categoryId: "site-setup",
    visualKey: "power",
    regulations: ["DGUV Information 203-006", "DGUV Vorschrift 3"],
    translations: localizedContent(
      ["Baustromversorgung", "Geeignete Baustromverteiler verwenden und Prüfintervalle dokumentieren.", "Die elektrische Versorgung ist über geeignete Baustromverteiler und geschützte Leitungsführungen herzustellen. Prüfungen, Fehlerstrom-Schutzeinrichtungen und arbeitstägliche Sichtkontrollen sind zu organisieren und zu dokumentieren.", ["Baustrom", "Verteiler", "Elektrik"]],
      ["Temporary construction power", "Use suitable site distribution boards and document inspection intervals.", "Electrical supply must use suitable site distribution boards and protected cable routing. Inspections, residual current protection, and daily visual checks must be organized and documented.", ["temporary power", "distribution", "electrical"]],
    ),
  },
  {
    id: "block-traffic-routes",
    categoryId: "site-setup",
    visualKey: "traffic",
    regulations: ["ASR A1.8", "RSA 21"],
    translations: localizedContent(
      ["Verkehrswege und Anlieferung", "Baustellenverkehr, öffentliche Wege und Anlieferungen sicher koordinieren.", "Ein- und Ausfahrten, Lieferzonen, Rückwärtsfahrten und Kreuzungspunkte sind zu planen. Öffentlicher Verkehr und besonders gefährdete Verkehrsteilnehmer sind durch geeignete technische und organisatorische Maßnahmen zu schützen.", ["Verkehr", "Anlieferung", "Straße"]],
      ["Traffic routes and deliveries", "Safely coordinate site traffic, public routes, and deliveries.", "Entrances, exits, delivery areas, reversing movements, and crossing points must be planned. Public traffic and vulnerable road users must be protected through suitable technical and organizational measures.", ["traffic", "delivery", "road"]],
    ),
  },
  {
    id: "block-excavation",
    categoryId: "earthworks",
    visualKey: "excavation",
    regulations: ["DIN 4124", "DGUV Vorschrift 38"],
    translations: localizedContent(
      ["Baugruben und Gräben", "Standsicherheit, Böschung oder Verbau sowie sichere Zugänge gewährleisten.", "Baugruben und Gräben sind unter Berücksichtigung von Boden, Wasser, Belastungen und Umgebung standsicher herzustellen. Böschung, Verbau, Randabstände, Zugänge und regelmäßige Kontrollen sind vor Beginn festzulegen.", ["Baugrube", "Graben", "Verbau", "Böschung"]],
      ["Excavations and trenches", "Ensure stability, suitable shoring or slopes, and safe access.", "Excavations and trenches must be made stable considering soil, water, loads, and surroundings. Slopes, shoring, edge distances, access, and regular inspections must be defined before work begins.", ["excavation", "trench", "shoring", "slope"]],
    ),
  },
  {
    id: "block-fall-protection",
    categoryId: "work-at-height",
    visualKey: "fall",
    regulations: ["ASR A2.1", "DGUV Vorschrift 38"],
    translations: localizedContent(
      ["Absturzsicherung", "Kollektive Schutzmaßnahmen an Absturzkanten und Öffnungen vorsehen.", "Absturzgefährdungen sind vorrangig durch Seitenschutz, Abdeckungen, Arbeitsplattformen oder andere kollektiv wirkende Einrichtungen zu vermeiden. Persönliche Schutzausrüstung gegen Absturz ist nur nachrangig und mit Rettungskonzept einzusetzen.", ["Absturz", "Seitenschutz", "Öffnung"]],
      ["Fall protection", "Provide collective protection at fall edges and openings.", "Fall hazards should primarily be controlled using guardrails, covers, work platforms, or other collective safeguards. Personal fall protection is secondary and must be accompanied by a rescue concept.", ["fall", "guardrail", "opening"]],
    ),
  },
  {
    id: "block-scaffolding",
    categoryId: "work-at-height",
    visualKey: "scaffold",
    regulations: ["TRBS 2121-1", "DIN EN 12811"],
    translations: localizedContent(
      ["Gerüste sicher koordinieren", "Eignung, Übergabe, Änderungen und gemeinsame Nutzung verbindlich regeln.", "Gerüstklasse, Zugänge, Wandabstände und vorgesehene Nutzung sind gewerkeübergreifend abzustimmen. Übergabe, Prüfungen, Kennzeichnung und das Verbot eigenmächtiger Veränderungen sind verbindlich zu organisieren.", ["Gerüst", "Freigabe", "gemeinsame Nutzung"]],
      ["Coordinate scaffolding safely", "Define suitability, handover, changes, and shared use.", "Scaffold class, access, wall clearances, and intended use must be coordinated across trades. Handover, inspections, signage, and the prohibition of unauthorized changes must be organized bindingly.", ["scaffold", "handover", "shared use"]],
    ),
  },
  {
    id: "block-lifting",
    categoryId: "operations",
    visualKey: "crane",
    regulations: ["DGUV Vorschrift 52", "DGUV Regel 109-017"],
    translations: localizedContent(
      ["Hebe- und Kranarbeiten", "Gefahrenbereiche absperren und Lastwege gewerkeübergreifend koordinieren.", "Kranstandorte, Schwenkbereiche, Lastwege, Anschläger und Kommunikationsregeln sind vor den Hebevorgängen festzulegen. Der Aufenthalt unter schwebenden Lasten ist zu verhindern.", ["Kran", "Heben", "Last"]],
      ["Lifting and crane operations", "Restrict danger zones and coordinate load paths across trades.", "Crane locations, slewing areas, load paths, slingers, and communication rules must be defined before lifting. People must be prevented from remaining beneath suspended loads.", ["crane", "lifting", "load"]],
    ),
  },
  {
    id: "block-live-operations",
    categoryId: "operations",
    visualKey: "operations",
    regulations: ["ArbSchG § 8", "BaustellV"],
    translations: localizedContent(
      ["Bauen im laufenden Betrieb", "Schnittstellen zwischen Baustelle, Betrieb und Dritten verbindlich koordinieren.", "Betriebliche Tätigkeiten, Verkehrswege, Freigaben, Abschaltungen und Notfallorganisation sind mit dem Betreiber abzustimmen. Wechselwirkungen und Verantwortlichkeiten müssen dokumentiert und kommuniziert werden.", ["laufender Betrieb", "Schnittstelle", "Dritte"]],
      ["Construction during ongoing operations", "Formally coordinate interfaces between construction, operations, and third parties.", "Operational activities, traffic routes, permits, isolations, and emergency arrangements must be coordinated with the operator. Interactions and responsibilities must be documented and communicated.", ["ongoing operations", "interface", "third parties"]],
    ),
  },
  {
    id: "block-hot-works",
    categoryId: "hazardous-work",
    visualKey: "hot-work",
    regulations: ["ASR A2.2", "DGUV Information 205-001"],
    translations: localizedContent(
      ["Heißarbeiten", "Freigabeverfahren, Brandschutzmaßnahmen und Brandwache festlegen.", "Schweiß-, Trenn- und sonstige Heißarbeiten dürfen nur nach Beurteilung der Umgebung und dokumentierter Freigabe erfolgen. Brennbare Stoffe sind zu entfernen oder abzuschirmen; Löschmittel und erforderliche Brandwachen sind bereitzustellen.", ["Schweißen", "Brand", "Freigabe"]],
      ["Hot work", "Define permits, fire precautions, and fire watch requirements.", "Welding, cutting, and other hot work may only proceed after assessing the surroundings and issuing a documented permit. Combustible materials must be removed or protected; extinguishing equipment and required fire watches must be provided.", ["welding", "fire", "permit"]],
    ),
  },
  {
    id: "block-hazardous-substances",
    categoryId: "hazardous-work",
    visualKey: "hazmat",
    regulations: ["GefStoffV", "TRGS 524"],
    translations: localizedContent(
      ["Gefahrstoffe und Kontaminationen", "Erkundung, Freigabe, Schutzmaßnahmen und Entsorgung vor Arbeitsbeginn klären.", "Vor Eingriffen in möglicherweise kontaminierte Bereiche sind Erkundungsergebnisse, Arbeitsverfahren, Expositionsschutz, Dekontamination und Entsorgungswege festzulegen. Unklare Befunde erfordern einen Arbeitsstopp und fachliche Bewertung.", ["Gefahrstoff", "Kontamination", "Altlast"]],
      ["Hazardous substances and contamination", "Clarify surveys, release, controls, and disposal before work begins.", "Before disturbing potentially contaminated areas, define survey findings, work methods, exposure controls, decontamination, and disposal routes. Unclear findings require work to stop and a professional assessment.", ["hazardous substance", "contamination", "remediation"]],
    ),
  },
  {
    id: "block-confined-spaces",
    categoryId: "hazardous-work",
    visualKey: "confined",
    regulations: ["DGUV Regel 113-004"],
    translations: localizedContent(
      ["Arbeiten in engen Räumen", "Freigabe, Lüftung, Überwachung und Rettung vor dem Einstieg sicherstellen.", "Arbeiten in Behältern, Schächten und engen Räumen erfordern eine Gefährdungsbeurteilung, Freigabe und zuverlässige Überwachung. Atmosphäre, Energiequellen, Kommunikation und unverzügliche Rettung sind vor dem Einstieg zu sichern.", ["enger Raum", "Schacht", "Rettung"]],
      ["Work in confined spaces", "Ensure permits, ventilation, standby supervision, and rescue before entry.", "Work in vessels, shafts, and confined spaces requires a risk assessment, permit, and reliable supervision. Atmosphere, energy sources, communication, and immediate rescue must be secured before entry.", ["confined space", "shaft", "rescue"]],
    ),
  },
  {
    id: "block-demolition",
    categoryId: "operations",
    visualKey: "demolition",
    regulations: ["TRBS 2121", "DGUV Regel 101-004"],
    translations: localizedContent(
      ["Abbrucharbeiten", "Standsicherheit, Abbruchfolge, Sperrbereiche und Schadstoffe vorab klären.", "Abbruchverfahren und Reihenfolge sind auf Grundlage von Bestandsuntersuchungen und statischer Beurteilung festzulegen. Gefahrenbereiche, Staub- und Lärmschutz, Medienfreiheit und Entsorgungswege sind zu koordinieren.", ["Abbruch", "Rückbau", "Standsicherheit"]],
      ["Demolition work", "Clarify stability, demolition sequence, exclusion zones, and hazardous materials.", "Demolition methods and sequence must be defined based on existing-condition surveys and structural assessment. Danger zones, dust and noise controls, utility isolation, and disposal routes must be coordinated.", ["demolition", "dismantling", "stability"]],
    ),
  },
  {
    id: "block-heat-uv",
    categoryId: "environment",
    visualKey: "sun",
    regulations: ["ArbSchG", "AMR 13.1"],
    translations: localizedContent(
      ["Hitze und UV-Strahlung", "Arbeitszeiten, Pausen, Schatten, Getränke und Hautschutz anpassen.", "Bei Hitze und intensiver UV-Strahlung sind Arbeitsorganisation, Pausen, Verschattung und Trinkwasserversorgung anzupassen. Beschäftigte sind über Symptome und Schutzmaßnahmen zu informieren.", ["Hitze", "UV", "Sonne"]],
      ["Heat and UV exposure", "Adapt working hours, breaks, shade, drinking water, and skin protection.", "During heat and intense UV exposure, work organization, breaks, shade, and drinking-water supply must be adapted. Workers must be informed about symptoms and protective measures.", ["heat", "UV", "sun"]],
    ),
  },
  {
    id: "block-winter",
    categoryId: "environment",
    visualKey: "snow",
    regulations: ["ArbStättV", "ASR A5.1"],
    translations: localizedContent(
      ["Winterbaustelle", "Schnee, Eis, Kälte, Beleuchtung und wetterbedingte Unterbrechungen einplanen.", "Verkehrswege und Arbeitsplätze sind von Schnee und Eis freizuhalten. Beleuchtung, geeignete Schutzkleidung, Aufwärmmöglichkeiten und Kriterien für wetterbedingte Arbeitsunterbrechungen sind festzulegen.", ["Winter", "Eis", "Kälte"]],
      ["Winter construction", "Plan for snow, ice, cold, lighting, and weather-related stoppages.", "Traffic routes and workplaces must be kept clear of snow and ice. Lighting, suitable protective clothing, warming facilities, and criteria for weather-related work stoppages must be defined.", ["winter", "ice", "cold"]],
    ),
  },
];

export const DEFAULT_PRIMARY_CATEGORY_BY_BLOCK_ID: Record<string, string> = {
  "block-existing-utilities": "existing-underground-utilities",
  "block-site-fencing": "imported-site-security",
  "block-site-access": "site-access-emergency",
  "block-first-aid": "site-access-emergency",
  "block-emergency-information": "site-access-emergency",
  "block-temporary-power": "site-power-water",
  "block-traffic-routes": "site-access-emergency",
  "block-fall-protection": "height-fall-protection",
  "block-scaffolding": "height-fall-protection",
  "block-hot-works": "hazardous-permit-work",
  "block-hazardous-substances": "hazardous-permit-work",
  "block-confined-spaces": "hazardous-permit-work",
};

const starterBlocks: BuildingBlock[] = blockDefinitions.map((block) => {
  const detailedCategoryId = DEFAULT_PRIMARY_CATEGORY_BY_BLOCK_ID[block.id];
  return {
    ...block,
    primaryCategoryId: detailedCategoryId ?? block.categoryId,
    categoryIds: detailedCategoryId ? [block.categoryId, detailedCategoryId] : [block.categoryId],
    lifecycle: "active",
  };
});

const importedBlocks: BuildingBlock[] = [
  {
    id: "import-existing-utilities", primaryCategoryId: "existing-underground-utilities",
    categoryIds: ["preparation", "existing-underground-utilities"], visualKey: "utilities",
    regulations: [], lifecycle: "active",
    translations: localizedContent(
      ["Bestandsleitungen bei Erdarbeiten berücksichtigen", "Berücksichtigung der Lage von Leitungen, Kabeln, Kanälen o. ä. im Bereich der Baugruben oder Gräben.", "Beschreibung A4 Sicherer Umgang mit Bestandsleitungen", ["Bestandsleitungen", "Kabel", "Kanäle"]],
      ["Account for existing utilities during earthworks", "Consider the location of utilities, cables, ducts, and similar services near excavations or trenches.", "Detailed requirements for safely handling existing underground utilities.", ["utilities", "cables", "ducts"]],
    ),
  },
  {
    id: "import-site-distribution", primaryCategoryId: "temporary-electrical-distribution",
    categoryIds: ["site-setup", "site-utilities", "site-power-water", "temporary-electrical-distribution"], visualKey: "power",
    regulations: ["DGUV Information 203-070", "DGUV Vorschrift 4", "DGUV Information 203-005"], lifecycle: "active",
    translations: localizedContent(
      ["Baustromverteiler", "Verwendung eines Baustromverteilers, Prüfintervalle beachten.", "Beschreibung A4 Baustromverteiler", ["Baustromverteiler", "Baustrom", "Stromversorgung"]],
      ["Construction-site distribution board", "Use a construction-site distribution board and observe inspection intervals.", "Detailed requirements for construction-site distribution boards.", ["distribution board", "temporary power"]],
    ),
  },
  {
    id: "import-small-distribution", primaryCategoryId: "mobile-distribution-units",
    categoryIds: ["site-setup", "site-utilities", "site-power-water", "temporary-electrical-distribution", "mobile-distribution-units"], visualKey: "power",
    regulations: ["DGUV Information 203-070", "DGUV Vorschrift 4", "DGUV Information 203-005"], lifecycle: "active",
    translations: localizedContent(
      ["Elektrokleinverteiler", "Nutzung von spritzwassergeschützten und für den Baustellenbetrieb geeigneten Elektrokleinverteilern.", "Beschreibung A4 Elektrokleinverteiler", ["Elektrokleinverteiler", "Baustrom", "Verteiler"]],
      ["Portable electrical distribution board", "Use splash-protected portable distribution boards suitable for construction sites.", "Detailed requirements for portable electrical distribution boards.", ["portable distribution", "temporary power"]],
    ),
  },
  {
    id: "import-portable-fence", primaryCategoryId: "imported-site-security",
    categoryIds: ["site-setup", "imported-site-security"], visualKey: "fence",
    regulations: [], lifecycle: "active",
    translations: localizedContent(
      ["Bauzaun, transportabel", "Schutzzaun aus Einzelelementen mit verzinktem Stahlrohrrahmen und Drahtgitterfüllung, mit Standfüßen, transportabel.", "Beschreibung A4 Bauzaun transportabel", ["Bauzaun", "transportabel", "Sicherung"]],
      ["Portable site fence", "Portable protective fence made from individual galvanized steel frames with wire-mesh infill and stable feet.", "Detailed requirements for portable site fencing.", ["site fence", "portable", "security"]],
    ),
  },
];

const organizationBlocks: BuildingBlock[] = [
  {
    ...structuredClone(starterBlocks[0]), id: "organization-delivery-check-in", primaryCategoryId: "site-access-emergency",
    categoryIds: ["site-setup", "site-access-emergency"], lifecycle: "active", regulations: [],
    translations: localizedContent(
      ["Digitale Anlieferungsanmeldung", "Anlieferungen vorab anmelden und Zeitfenster verbindlich koordinieren.", "Fahrer melden sich vor Zufahrt digital an; Baustellenlogistik und Einweiser bestätigen das Zeitfenster.", ["Anlieferung", "Zeitfenster", "Logistik"]],
      ["Digital delivery check-in", "Register deliveries in advance and coordinate binding time slots.", "Drivers check in digitally before access; site logistics and the banksman confirm the time slot.", ["delivery", "time slot", "logistics"]],
    ),
  },
  {
    ...structuredClone(starterBlocks[0]), id: "organization-archived-infection-access",
    primaryCategoryId: "site-access-emergency", categoryIds: ["site-setup", "site-access-emergency"], lifecycle: "archived", regulations: [],
    translations: localizedContent(
      ["Ehemalige Infektionsschutz-Zutrittsregel", "Historische Zutrittsregel für zeitlich begrenzte Infektionsschutzmaßnahmen.", "Bei behördlich angeordneten Infektionsschutzmaßnahmen wurden Zugangsvoraussetzungen vor Betreten der Baustelle dokumentiert.", ["Infektionsschutz", "Zutritt"]],
      ["Former infection-control access rule", "Historical access rule for time-limited infection-control measures.", "When infection-control measures were ordered by authorities, access requirements were documented before entering the construction site.", ["infection control", "access"]],
    ),
  },
];

export const seedBlocks: BuildingBlock[] = [...starterBlocks, ...importedBlocks, ...organizationBlocks].map((block) => ({
  ...block,
  categoryIds: categoryPlacementIds(block.primaryCategoryId, seedCategories),
  imageDataUrl: defaultBlockImageSource(block.id),
}));

const LOGISTICS_SITE_PLAN_ASSET_ID = "asset-logistics-site-plan";
const LOGISTICS_INFORMATION_PDF_ASSET_ID = "asset-logistics-info-pdf";
const EXAMPLE_DOCUMENT_Z_INDEX = 700;
const EXAMPLE_DOCUMENT_SEMANTIC_ORDER = 20_000;
const EXAMPLE_DOCUMENT_LEFT_COLUMN_X = 8_440;
const EXAMPLE_DOCUMENT_RIGHT_COLUMN_X = 10_140;
const EXAMPLE_SITE_PLAN_Y = 400;
const EXAMPLE_SITE_PLAN_WIDTH = 3_300;
const EXAMPLE_SITE_PLAN_HEIGHT = 2_040;
const EXAMPLE_PDF_FIRST_ROW_Y = 2_700;
const EXAMPLE_PDF_SECOND_ROW_Y = 5_200;
const EXAMPLE_PDF_PAGE_WIDTH = 1_600;
const EXAMPLE_PDF_PAGE_HEIGHT = 2_260;

function placeExampleProjectDocuments(plan: Plan): Plan {
  const pagePositions = [
    { pageNumber: 1, x: EXAMPLE_DOCUMENT_LEFT_COLUMN_X, y: EXAMPLE_PDF_FIRST_ROW_Y },
    { pageNumber: 2, x: EXAMPLE_DOCUMENT_RIGHT_COLUMN_X, y: EXAMPLE_PDF_FIRST_ROW_Y },
    { pageNumber: 3, x: EXAMPLE_DOCUMENT_LEFT_COLUMN_X, y: EXAMPLE_PDF_SECOND_ROW_Y },
    { pageNumber: 4, x: EXAMPLE_DOCUMENT_RIGHT_COLUMN_X, y: EXAMPLE_PDF_SECOND_ROW_Y },
  ];
  const documentElements: PlanAssetElement[] = [
    {
      id: "layout-logistics-site-plan",
      kind: "image",
      assetId: LOGISTICS_SITE_PLAN_ASSET_ID,
      fitMode: "contain",
      x: EXAMPLE_DOCUMENT_LEFT_COLUMN_X,
      y: EXAMPLE_SITE_PLAN_Y,
      width: EXAMPLE_SITE_PLAN_WIDTH,
      height: EXAMPLE_SITE_PLAN_HEIGHT,
      zIndex: EXAMPLE_DOCUMENT_Z_INDEX,
      semanticOrder: EXAMPLE_DOCUMENT_SEMANTIC_ORDER,
    },
    ...pagePositions.map<PlanAssetElement>(({ pageNumber, x, y }, index) => ({
      id: `layout-logistics-info-page-${pageNumber}`,
      kind: "pdf_page",
      assetId: LOGISTICS_INFORMATION_PDF_ASSET_ID,
      pageNumber,
      fitMode: "contain",
      x,
      y,
      width: EXAMPLE_PDF_PAGE_WIDTH,
      height: EXAMPLE_PDF_PAGE_HEIGHT,
      zIndex: EXAMPLE_DOCUMENT_Z_INDEX + index + 1,
      semanticOrder: EXAMPLE_DOCUMENT_SEMANTIC_ORDER + index + 1,
    })),
  ];
  return {
    ...plan,
    includedAssetIds: [LOGISTICS_SITE_PLAN_ASSET_ID, LOGISTICS_INFORMATION_PDF_ASSET_ID],
    layout: { ...plan.layout, elements: [...plan.layout.elements, ...documentElements] },
  };
}

const demoProject: Project = {
  id: "project-logistics-center",
  organizationId: "organization-demo",
  name: "Logistikzentrum West",
  description: "Neubau einer Logistikhalle mit Büroeinbau, Außenanlagen und laufendem Werksverkehr.",
  address: "Industriestraße 18",
  city: "04158 Leipzig",
  constructionType: "new_build",
  startDate: "2026-10-12",
  endDate: "2027-09-30",
  status: "in_review",
  participants: [
    { id: "participant-owner", role: "owner", company: "Westpark Projekt GmbH", name: "Dr. Anna Richter", email: "anna.richter@example.test", phone: "+49 341 555 100" },
    { id: "participant-coordinator", role: "coordinator", company: "Sicher Planen Ingenieure", name: "Max Mustermann", email: "max@example.test", phone: "+49 341 555 220" },
    { id: "participant-architect", role: "architect", company: "Studio Nord Architektur", name: "Leonie Weber", email: "leonie@example.test", phone: "+49 341 555 330" },
    { id: "participant-site", role: "site_manager", company: "Bauwerk Generalbau AG", name: "Daniel König", email: "daniel@example.test", phone: "+49 171 555 4422" },
  ],
  emergencyContacts: [
    { id: "emergency-fire", label: "Feuerwehr / Rettungsdienst", name: "Notruf", phone: "112" },
    { id: "emergency-police", label: "Polizei", name: "Notruf", phone: "110" },
    { id: "emergency-hospital", label: "Nächstes Unfallkrankenhaus", name: "Klinikum Nord", phone: "+49 341 555 990" },
  ],
  customFields: [
    { id: "field-client", key: "Bauherr", value: "Westpark Projekt GmbH", placeholderKey: "client" },
    { id: "field-site-access", key: "Baustellenzufahrt", value: "Tor West, Industriestraße 18", placeholderKey: "site_access" },
    { id: "field-permit", key: "Baugenehmigungsnummer", value: "", placeholderKey: "building_permit_number" },
  ],
  customSections: [{
    id: "section-site-logistics", title: "Baustellenlogistik", placeholderKey: "site_logistics",
    fields: [
      { id: "field-delivery-window", key: "Anlieferzeitfenster", value: "06:30–15:30 Uhr", placeholderKey: "delivery_window" },
      { id: "field-waiting-area", key: "Wartebereich", value: "", placeholderKey: "waiting_area" },
    ],
  }],
  participantsSectionName: "Projektbeteiligte",
  overviewSections: [],
  overviewSectionOrder: [],
  assets: [
    {
      id: LOGISTICS_SITE_PLAN_ASSET_ID,
      filename: "lageplan.jpg",
      mimeType: "image/jpeg",
      byteSize: 154_509,
      dataUrl: "/project-documents/logistikzentrum-west/lageplan.jpg",
      width: 1_212,
      height: 748,
      createdAt,
    },
    {
      id: LOGISTICS_INFORMATION_PDF_ASSET_ID,
      filename: "Infos.pdf",
      mimeType: "application/pdf",
      byteSize: 332_327,
      dataUrl: "/project-documents/logistikzentrum-west/Infos.pdf",
      previewDataUrl: "/project-documents/logistikzentrum-west/infos-page-1.png",
      pageCount: 4,
      pdfPages: [
        { pageNumber: 1, width: 595, height: 842 },
        { pageNumber: 2, width: 595, height: 842 },
        { pageNumber: 3, width: 595, height: 842 },
        { pageNumber: 4, width: 595, height: 842 },
      ],
      createdAt,
    },
  ],
  documentFolders: [],
  createdAt,
  updatedAt: createdAt,
};

const demoAssessment: AssessmentAnswers = {
  employerCount: 14,
  maxWorkers: 48,
  workDays: 240,
  estimatedPersonDays: 5600,
  liveOperations: true,
  publicTraffic: true,
  existingUtilities: true,
  excavationDepth: 3.5,
  maxWorkHeight: 12,
  cranesOrLifting: true,
  scaffolding: true,
  temporaryPower: true,
  hotWorks: true,
  hazardousSubstances: false,
  waterOrDrowningRisk: false,
  confinedSpaces: false,
  season: "year_round",
  notes: "Anlieferungen kreuzen zeitweise die Zufahrt des laufenden Nachbarbetriebs.",
};

function seedOverviewSections(project: Project, locale: Locale) {
  let identifierIndex = 0;
  return legacyProjectOverviewSections(project, (prefix) => `${project.id}-${prefix}-${identifierIndex++}`, locale);
}

demoProject.overviewSections = seedOverviewSections(demoProject, "de");
demoProject.overviewSectionOrder = normalizeProjectOverviewSectionOrder(
  [PROJECT_PARTICIPANTS_SECTION_ID, ...demoProject.overviewSections.map((section) => section.id)],
  demoProject.overviewSections,
);

export function createSeedDatabase(): AppDatabase {
  const demoAssessmentRunId = `assessment-${demoProject.id}-initial`;
  const contactMigration = migrateLegacyProjectContacts(
    demoProject.organizationId,
    [structuredClone(demoProject)],
  );
  const migratedDemoProject = {
    ...contactMigration.projects[0],
    overviewSectionOrder: normalizeProjectOverviewSectionOrder(
      contactMigration.projects[0].overviewSectionOrder,
      contactMigration.projects[0].overviewSections,
    ),
  };
  const generatedPlan = createPlanFromAssessment(migratedDemoProject, demoAssessment, seedBlocks, seedCategories, undefined, {
    method: "guided_assessment",
    createdByName: "Max",
    sourceAssessmentRunId: demoAssessmentRunId,
  });
  const publishedPlan = structuredClone(generatedPlan);
  publishedPlan.status = "published";
  publishedPlan.updatedAt = "2026-09-20T09:00:00.000Z";
  const plan = placeExampleProjectDocuments(structuredClone(generatedPlan));
  plan.status = "draft";
  plan.updatedAt = "2026-09-26T18:00:00.000Z";
  const documentTemplates = (["de", "en"] as const).map((locale) => ({
    id: `standard-a4_plan-${locale}`,
    organizationId: "organization-demo",
    name: "QuickSiGe Standard",
    documentType: "a4_plan" as const,
    locale,
    origin: "standard" as const,
    filename: `a4_plan-${locale}.docx`,
    description: locale === "de" ? "Bearbeitbare Word-Vorlage" : "Editable Word template",
    lifecycle: "active" as const,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  }));
  return {
    schemaVersion: 36,
    organization: {
      id: "organization-demo",
      name: "Sicher Planen Ingenieure",
      accentColor: "#d5ff3f",
    },
    user: {
      id: "user-demo",
      organizationId: "organization-demo",
      name: "Max",
      email: "max@example.test",
      role: "owner",
      preferredLocale: "de",
    },
    projects: [migratedDemoProject],
    contacts: contactMigration.contacts,
    companies: contactMigration.companies,
    contactAffiliations: contactMigration.affiliations,
    projectContactAssignments: contactMigration.assignments,
    projectRoleDefinitions: [],
    externalContactIdentities: [],
    contactImportBatches: [],
    assessmentRuns: [
      {
        id: demoAssessmentRunId,
        projectId: demoProject.id,
        definitionVersion: 1,
        answers: demoAssessment,
        createdByName: "Max",
        createdAt,
        updatedAt: createdAt,
        completedAt: createdAt,
      },
    ],
    blocks: seedBlocks,
    categories: seedCategories,
    plans: [plan],
    revisions: [{
      id: "revision-demo-a", projectId: demoProject.id, planId: plan.id, index: "A", changeSummary: "Erste fachlich geprüfte Ausgabe",
      approvedBy: "Max Mustermann", publishedAt: "2026-09-20T09:00:00.000Z",
      snapshot: {
        project: { ...structuredClone(demoProject), status: "published", updatedAt: "2026-09-20T09:00:00.000Z" },
        plan: publishedPlan, blocks: structuredClone(seedBlocks.filter((block) => publishedPlan.sections.some((section) => section.items.some((item) => item.blockId === block.id)))),
        categories: structuredClone(seedCategories), documentTemplates: structuredClone(documentTemplates), documentConfigurations: [], generatedDocuments: [],
      },
    }],
    overviewTemplates: [
      {
        id: "overview-template-standard",
        organizationId: "organization-demo",
        name: "Allgemein",
        sourceLocale: "de",
        translations: { en: { name: "General" } },
        entries: [
          { id: "template-field-client", label: "Bauherr", type: "text", defaultValue: "", children: [], translations: { en: { label: "Client", defaultValue: "" } } },
          { id: "template-field-site-access", label: "Baustellenzufahrt", type: "text", defaultValue: "", children: [], translations: { en: { label: "Site access", defaultValue: "" } } },
          { id: "template-field-start", label: "Geplanter Beginn", type: "date", defaultValue: "", children: [], translations: { en: { label: "Planned start", defaultValue: "" } } },
          {
            id: "template-group-address", label: "Projektadresse", type: "group", defaultValue: "", translations: { en: { label: "Project address", defaultValue: "" } }, children: [
              { id: "template-field-street", label: "Straße", type: "text", defaultValue: "", children: [], translations: { en: { label: "Street", defaultValue: "" } } },
              { id: "template-field-postcode", label: "Postleitzahl", type: "text", defaultValue: "", children: [], translations: { en: { label: "Postal code", defaultValue: "" } } },
              { id: "template-field-city", label: "Ort", type: "text", defaultValue: "", children: [], translations: { en: { label: "City", defaultValue: "" } } },
            ],
          },
        ],
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "overview-template-emergency",
        organizationId: "organization-demo",
        name: "Notfallkontakte",
        sourceLocale: "de",
        translations: { en: { name: "Emergency contacts" } },
        entries: [
          {
            id: "template-emergency-contacts", label: "Kontakte", type: "repeating_group", defaultValue: "", translations: { en: { label: "Contacts", defaultValue: "" } }, children: [
              { id: "template-emergency-label", label: "Bezeichnung", type: "text", defaultValue: "Feuerwehr / Rettungsdienst", children: [], translations: { en: { label: "Service", defaultValue: "Fire brigade / emergency services" } } },
              { id: "template-emergency-name", label: "Ansprechpartner", type: "text", defaultValue: "Notruf", children: [], translations: { en: { label: "Contact", defaultValue: "Emergency call" } } },
              { id: "template-emergency-phone", label: "Telefon", type: "text", defaultValue: "112", children: [], translations: { en: { label: "Phone", defaultValue: "112" } } },
            ],
          },
        ],
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "overview-template-logistics",
        organizationId: "organization-demo",
        name: "Baustellenlogistik",
        sourceLocale: "de",
        translations: { en: { name: "Site logistics" } },
        entries: [
          {
            id: "template-group-delivery", label: "Anlieferung", type: "group", defaultValue: "", translations: { en: { label: "Deliveries", defaultValue: "" } }, children: [
              { id: "template-field-delivery", label: "Anlieferzeitfenster", type: "text", defaultValue: "", children: [], translations: { en: { label: "Delivery time window", defaultValue: "" } } },
              { id: "template-field-waiting", label: "Wartebereich", type: "text", defaultValue: "", children: [], translations: { en: { label: "Waiting area", defaultValue: "" } } },
            ],
          },
        ],
        createdAt, updatedAt: createdAt,
      },
      {
        id: "overview-template-participants",
        organizationId: "organization-demo",
        name: "Projektbeteiligte",
        sourceLocale: "de",
        translations: { en: { name: "Project participants" } },
        entries: [{
          id: "template-project-participants", label: "Beteiligte", type: "repeating_group", defaultValue: "", translations: { en: { label: "Participants", defaultValue: "" } }, children: [
            { id: "template-participant-name", label: "Name", type: "text", defaultValue: "", children: [], translations: { en: { label: "Name", defaultValue: "" } } },
            { id: "template-participant-company", label: "Unternehmen", type: "text", defaultValue: "", children: [], translations: { en: { label: "Company", defaultValue: "" } } },
            { id: "template-participant-role", label: "Rolle", type: "text", defaultValue: "", children: [], translations: { en: { label: "Role", defaultValue: "" } } },
            { id: "template-participant-email", label: "E-Mail", type: "text", defaultValue: "", children: [], translations: { en: { label: "Email", defaultValue: "" } } },
            { id: "template-participant-phone", label: "Telefon", type: "text", defaultValue: "", children: [], translations: { en: { label: "Phone", defaultValue: "" } } },
          ],
        }],
        createdAt,
        updatedAt: createdAt,
      },
    ],
    documentTemplates,
    documentConfigurations: [],
    generatedDocuments: [],
    auditEvents: [
      {
        id: "audit-seed",
        projectId: demoProject.id,
        action: "workspace.initialized",
        actorName: "QuickSiGe",
        createdAt,
        details: "QuickSiGe workspace initialized.",
      },
    ],
  };
}

export const defaultAssessmentAnswers: AssessmentAnswers = {
  employerCount: 2,
  maxWorkers: 10,
  workDays: 20,
  estimatedPersonDays: 200,
  liveOperations: false,
  publicTraffic: false,
  existingUtilities: false,
  excavationDepth: 0,
  maxWorkHeight: 0,
  cranesOrLifting: false,
  scaffolding: false,
  temporaryPower: true,
  hotWorks: false,
  hazardousSubstances: false,
  waterOrDrowningRisk: false,
  confinedSpaces: false,
  season: "year_round",
  notes: "",
};
