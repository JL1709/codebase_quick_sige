import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { createSeedDatabase } from "../data/seed";
import {
  autoMapContactHeaders,
  candidatesFromDelimited,
  candidatesFromDelimitedAsync,
  exportContactCsvTemplate,
  exportCandidatesCsv,
  exportCandidatesVCard,
  MAX_CONTACT_XLSX_EXPANDED_BYTES,
  matchContactImportCandidate,
  parseDelimitedContacts,
  parseDelimitedContactsAsync,
  parseVCardContacts,
  parseXlsxContacts,
  readContactImportFile,
  sanitizeContactImportLabel,
} from "./contactImport";
import { commitContactImport } from "./contactImportCommit";
import { contactDisplayName } from "./contacts";

function xlsxFixture(formulaOnly = false): ArrayBuffer {
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="People" sheetId="1" r:id="rId1"/><sheet name="Companies" sheetId="2" r:id="rId2"/></sheets>
      </workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
      </Relationships>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>First Name</t></is></c><c r="B1" t="inlineStr"><is><t>Phone</t></is></c><c r="C1" t="inlineStr"><is><t>Label</t></is></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>Ada</t></is></c><c r="B2" t="inlineStr"><is><t>00123</t></is></c><c r="C2" t="str"><f>CONCATENATE(A2,B2)</f>${formulaOnly ? "" : "<v>Ada00123</v>"}</c></row>
      </sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>Company</t></is></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>Analytical Engines</t></is></c></row>
      </sheetData></worksheet>`,
  };
  const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([path, contents]) => [path, strToU8(contents)])));
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

describe("contact import", () => {
  it("sanitizes labels without allowing control characters into import metadata", () => {
    expect(sanitizeContactImportLabel("  contacts\u0000\n2026.csv  ")).toBe("contacts  2026.csv");
    expect(sanitizeContactImportLabel("long-name.csv", 4)).toBe("long");
  });

  it("matches only deterministic identities and never auto-merges a fuzzy name candidate", () => {
    const database = createSeedDatabase();
    const existing = database.contacts[0];
    const candidate = {
      sourceKey: "candidate", prefix: existing.prefix, givenName: existing.givenName, familyName: existing.familyName,
      suffix: existing.suffix, fullName: contactDisplayName(existing), companyName: "", jobTitle: "", department: "",
      emails: [], phones: [], addresses: [], notes: "", tags: [], warnings: [],
    };

    expect(matchContactImportCandidate(candidate, database.contacts)).toBeUndefined();
    expect(matchContactImportCandidate({
      ...candidate,
      phones: [{ value: existing.phones[0].value, type: "work", primary: true }],
    }, database.contacts)).toBeUndefined();
    expect(matchContactImportCandidate({
      ...candidate,
      emails: [{ value: existing.emails[0].value.toLocaleUpperCase(), type: "work", primary: true }],
    }, database.contacts)?.id).toBe(existing.id);
  });

  it("parses quoted CSV rows and maps common German and Outlook headers", () => {
    const data = parseDelimitedContacts('Vorname;Nachname;E-Mail-Adresse;Firma;Notizen\r\nAda;Lovelace;ada@example.com;"Analytical; Engines";"Line 1\nLine 2"');
    const mapping = autoMapContactHeaders(data.headers);
    const candidates = candidatesFromDelimited(data, mapping);

    expect(data.delimiter).toBe(";");
    expect(candidates[0]).toMatchObject({ givenName: "Ada", familyName: "Lovelace", companyName: "Analytical; Engines", notes: "Line 1\nLine 2" });
    expect(candidates[0].emails[0].value).toBe("ada@example.com");
  });

  it("parses and maps large delimited imports in bounded asynchronous chunks", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => `Person ${index},person${index}@example.com`).join("\n");
    const data = await parseDelimitedContactsAsync(`Name,Email\n${rows}`);
    const candidates = await candidatesFromDelimitedAsync(data, autoMapContactHeaders(data.headers));

    expect(candidates).toHaveLength(501);
    expect(candidates[0].sourceKey).toBe("row-2");
    expect(candidates[500].sourceKey).toBe("row-502");
    expect(candidates[500].emails[0].value).toBe("person500@example.com");
  });

  it("supports explicit legacy encoding and delimiter overrides for older Outlook exports", async () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode("Vorname;Nachname;E-Mail-Adresse\r\nJ"),
      0xfc,
      ...new TextEncoder().encode("rgen;M"),
      0xfc,
      ...new TextEncoder().encode("ller;juergen@example.com"),
    ]);
    const imported = await readContactImportFile(new File([bytes], "outlook.csv", { type: "text/csv" }), { encoding: "windows-1252", delimiter: ";" });

    expect(imported.candidates?.[0]).toMatchObject({ givenName: "Jürgen", familyName: "Müller" });
    expect(imported.sheets?.[0].delimiter).toBe(";");
    expect(exportContactCsvTemplate("de")).toContain("E-Mail-Adresse");
  });

  it("parses common vCard 3 and 4 contact fields", () => {
    const [candidate] = parseVCardContacts([
      "BEGIN:VCARD", "VERSION:4.0", "FN:Ada Lovelace", "N:Lovelace;Ada;;;", "ORG:Analytical Engines",
      "TITLE:Engineer", "EMAIL;TYPE=work;PREF=1:ada@example.com", "TEL;TYPE=cell:+49 170 123456",
      "ADR;TYPE=work:;;Main Street 1;Berlin;;10115;Germany", "CATEGORIES:Planning,Safety", "END:VCARD",
    ].join("\r\n"));

    expect(candidate).toMatchObject({ fullName: "Ada Lovelace", familyName: "Lovelace", givenName: "Ada", companyName: "Analytical Engines", jobTitle: "Engineer" });
    expect(candidate.phones[0].type).toBe("mobile");
    expect(candidate.addresses[0]).toMatchObject({ street: "Main Street 1", city: "Berlin", postalCode: "10115", country: "Germany" });
  });

  it("parses vCard 2.1 quoted-printable legacy text, soft line breaks, and multiple cards", () => {
    const candidates = parseVCardContacts([
      "BEGIN:VCARD", "VERSION:2.1", "FN;CHARSET=ISO-8859-1;ENCODING=QUOTED-PRINTABLE:J=FCrgen =",
      "M=FCller", "N;CHARSET=ISO-8859-1;ENCODING=QUOTED-PRINTABLE:M=FCller;J=FCrgen;;;", "PHOTO;ENCODING=b:ignored", "BDAY:1970-01-01", "END:VCARD",
      "BEGIN:VCARD", "VERSION:3.0", "FN:Lin Chen", "EMAIL:lin@example.com", "END:VCARD",
    ].join("\r\n"));

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ fullName: "Jürgen Müller", givenName: "Jürgen", familyName: "Müller", warnings: ["ignored:bday,photo"] });
    expect(candidates[1]).toMatchObject({ fullName: "Lin Chen" });
  });

  it("reports a malformed individual card without dropping valid cards in the same file", () => {
    const candidates = parseVCardContacts([
      "BEGIN:VCARD", "VERSION:4.0", "FN:Valid Contact", "EMAIL:valid@example.com", "END:VCARD",
      "BEGIN:VCARD", "VERSION:4.0", "FN:Incomplete Contact",
    ].join("\r\n"));

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ fullName: "Valid Contact" });
    expect(candidates[1]).toMatchObject({ fullName: "", warnings: ["malformed_card:missing_end"] });
  });

  it("parses every XLSX worksheet using cached values without losing text leading zeros", async () => {
    const sheets = await parseXlsxContacts(xlsxFixture());

    expect(sheets.map((sheet) => sheet.delimiter)).toEqual(["People", "Companies"]);
    expect(sheets[0]).toMatchObject({
      headers: ["First Name", "Phone", "Label"],
      rows: [["Ada", "00123", "Ada00123"]],
    });
    expect(sheets[1]).toMatchObject({ headers: ["Company"], rows: [["Analytical Engines"]] });
  });

  it("reports formula-only XLSX cells that do not have safe cached display values", async () => {
    const sheets = await parseXlsxContacts(xlsxFixture(true));
    const candidates = candidatesFromDelimited(sheets[0], autoMapContactHeaders(sheets[0].headers));

    expect(sheets[0].warnings).toEqual(["formula_only_cells:1"]);
    expect(candidates[0].warnings).toEqual(["formula_only_cells:1"]);
  });

  it("checks file contents instead of trusting the filename or browser MIME type", async () => {
    const disguisedArchive = new File([xlsxFixture()], "contacts.csv", { type: "text/csv" });
    const disguisedPdf = new File(["%PDF-1.7"], "contacts.vcf", { type: "text/vcard" });

    await expect(readContactImportFile(disguisedArchive)).rejects.toThrow("unsupported_file");
    await expect(readContactImportFile(disguisedPdf)).rejects.toThrow("unsupported_file");
  });

  it("rejects malformed XLSX input before persistence", async () => {
    await expect(parseXlsxContacts(new TextEncoder().encode("not a workbook").buffer)).rejects.toThrow("malformed_xlsx");
  });

  it("rejects macro payloads and suspicious expanded XLSX sizes before decompression", async () => {
    const macroArchive = zipSync({ "xl/vbaProject.bin": new Uint8Array([1, 2, 3]) });
    await expect(parseXlsxContacts(macroArchive.buffer.slice(macroArchive.byteOffset, macroArchive.byteOffset + macroArchive.byteLength) as ArrayBuffer)).rejects.toThrow("unsupported_file");

    const expandedArchive = xlsxFixture();
    const view = new DataView(expandedArchive);
    let centralDirectoryOffset = -1;
    for (let offset = 0; offset < view.byteLength - 4; offset += 1) {
      if (view.getUint32(offset, true) === 0x02014b50) { centralDirectoryOffset = offset; break; }
    }
    expect(centralDirectoryOffset).toBeGreaterThanOrEqual(0);
    view.setUint32(centralDirectoryOffset + 24, MAX_CONTACT_XLSX_EXPANDED_BYTES + 1, true);
    await expect(parseXlsxContacts(expandedArchive)).rejects.toThrow("xlsx_expansion_limit");
  });

  it("commits contacts, company, affiliation, external identity, project assignment, and journal atomically", () => {
    const database = createSeedDatabase();
    database.projectRoleDefinitions.push({
      id: "project-role-fire-protection", organizationId: database.organization.id, name: "Fire protection",
      lifecycle: "active", sortOrder: 0, createdAt: "2026-09-29T12:00:00.000Z", updatedAt: "2026-09-29T12:00:00.000Z",
    });
    let sequence = 0;
    const result = commitContactImport(database, {
      source: "microsoft",
      sourceLabel: "Microsoft Outlook",
      projectAssignment: {
        projectId: database.projects[0].id,
        roles: [{ role: "architect" }, { role: "custom", roleDefinitionId: "project-role-fire-protection", customLabel: "Fire protection" }],
      },
      decisions: [{
        action: "create",
        candidate: {
          sourceKey: "outlook-1", prefix: "", givenName: "Grace", familyName: "Hopper", suffix: "", fullName: "Grace Hopper",
          companyName: "Navy", jobTitle: "Engineer", department: "Computing",
          emails: [{ value: "grace@example.com", type: "work", primary: true }], phones: [], addresses: [], notes: "", tags: [], warnings: [],
          externalIdentity: { provider: "microsoft", providerAccountId: "account-1", externalContactId: "outlook-1" },
        },
      }],
    }, (prefix) => `${prefix}-${sequence += 1}`, "2026-09-29T12:00:00.000Z");

    const createdItem = result.batch.items[0];
    expect(result.database.contacts.find((value) => value.id === createdItem.contactId)).toMatchObject({ givenName: "Grace", familyName: "Hopper" });
    expect(result.database.contacts.find((value) => value.id === createdItem.contactId)).not.toHaveProperty("displayName");
    expect(result.database.companies.find((value) => value.id === createdItem.companyId)?.name).toBe("Navy");
    expect(result.database.contactAffiliations.some((value) => value.contactId === createdItem.contactId)).toBe(true);
    expect(result.database.externalContactIdentities.some((value) => value.contactId === createdItem.contactId)).toBe(true);
    expect(result.database.projectContactAssignments.find((value) => value.contactId === createdItem.contactId)?.roles).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "architect" }),
      expect.objectContaining({ role: "custom", roleDefinitionId: "project-role-fire-protection", customLabel: "Fire protection" }),
    ]));
    expect(result.database.contactImportBatches[0].id).toBe(result.batch.id);
    expect(database.contacts.some((value) => value.id === createdItem.contactId)).toBe(false);
  });

  it("assigns an imported contact to a project without requiring a role", () => {
    const database = createSeedDatabase();
    let sequence = 0;
    const result = commitContactImport(database, {
      source: "csv",
      sourceLabel: "contacts.csv",
      projectAssignment: { projectId: database.projects[0].id, roles: [] },
      decisions: [{
        action: "create",
        candidate: {
          sourceKey: "roleless-contact", prefix: "", givenName: "Roleless", familyName: "Participant", suffix: "", fullName: "Roleless Participant",
          companyName: "", jobTitle: "", department: "", emails: [], phones: [], addresses: [], notes: "", tags: [], warnings: [],
        },
      }],
    }, (prefix) => `${prefix}-${sequence += 1}`, "2026-09-30T12:00:00.000Z");

    const contactId = result.batch.items[0].contactId;
    expect(result.database.projectContactAssignments.find((assignment) => assignment.contactId === contactId)?.roles).toEqual([]);
  });

  it("converts a full-name-only import into structured contact name fields", () => {
    const database = createSeedDatabase();
    let sequence = 0;
    const result = commitContactImport(database, {
      source: "vcard",
      sourceLabel: "name-only.vcf",
      decisions: [{
        action: "create",
        candidate: {
          sourceKey: "name-only", prefix: "", givenName: "", familyName: "", suffix: "", fullName: "Lin Chen",
          companyName: "", jobTitle: "", department: "", emails: [], phones: [], addresses: [], notes: "", tags: [], warnings: [],
        },
      }],
    }, (prefix) => `${prefix}-${sequence += 1}`, "2026-09-30T12:00:00.000Z");

    expect(result.database.contacts[0]).toMatchObject({ givenName: "Lin", familyName: "Chen" });
    expect(result.database.contacts[0]).not.toHaveProperty("displayName");
  });

  it("does not treat a provider identity as a duplicate when its email does not match", () => {
    const database = createSeedDatabase();
    let sequence = 0;
    const id = (prefix: string) => `${prefix}-${sequence += 1}`;
    const initialCandidate = {
      sourceKey: "people/stable", prefix: "", givenName: "Ada", familyName: "Lovelace", suffix: "", fullName: "Ada Lovelace",
      companyName: "", jobTitle: "", department: "", emails: [{ value: "initial@example.com", type: "work" as const, primary: true }], phones: [], addresses: [], notes: "Initial", tags: [], warnings: [],
      externalIdentity: { provider: "google" as const, providerAccountId: "account", externalContactId: "people/stable", sourceRevision: "etag-1" },
    };
    const first = commitContactImport(database, {
      source: "google", sourceLabel: "Google Contacts", decisions: [{ action: "create", candidate: initialCandidate }],
    }, id, "2026-09-29T10:00:00.000Z");
    const matched = matchContactImportCandidate({
      ...initialCandidate, emails: [{ value: "changed@example.com", type: "work" as const, primary: true }],
      notes: "Updated", externalIdentity: { ...initialCandidate.externalIdentity, sourceRevision: "etag-2" },
    }, first.database.contacts);

    expect(matched).toBeUndefined();
  });

  it("overwrites only explicitly selected fields and records reviewed merge decisions", () => {
    const database = createSeedDatabase();
    const existing = database.contacts[0];
    existing.givenName = "Existing";
    existing.familyName = "Person";
    existing.notes = "Keep this note";
    let sequence = 0;
    const result = commitContactImport(database, {
      source: "csv",
      sourceLabel: "reviewed.csv",
      decisions: [{
        action: "merge",
        existingContactId: existing.id,
        overwriteFields: ["givenName"],
        candidate: {
          sourceKey: "row-2", prefix: "", givenName: "Imported", familyName: "Replacement", suffix: "", fullName: "",
          companyName: "", jobTitle: "", department: "", emails: [], phones: [], addresses: [], notes: "Imported note", tags: [], warnings: [],
        },
      }],
    }, (prefix) => `${prefix}-${sequence += 1}`, "2026-09-29T12:00:00.000Z");

    expect(result.database.contacts.find((contact) => contact.id === existing.id)).toMatchObject({
      givenName: "Imported",
      familyName: "Person",
      notes: "Keep this note",
    });
    expect(result.batch.items[0].action).toBe("merged");
  });

  it("updates non-empty imported fields while preserving values omitted by the import", () => {
    const database = createSeedDatabase();
    const existing = database.contacts[0];
    existing.givenName = "Existing";
    existing.familyName = "Person";
    existing.notes = "Keep this note";
    let sequence = 0;
    const result = commitContactImport(database, {
      source: "vcard",
      sourceLabel: "updated.vcf",
      decisions: [{
        action: "update",
        existingContactId: existing.id,
        candidate: {
          sourceKey: "card-1", prefix: "", givenName: "Imported", familyName: "", suffix: "", fullName: "Imported Person",
          companyName: "New Company", jobTitle: "New role", department: "Planning",
          emails: [{ value: existing.emails[0].value, type: "work", primary: true }],
          phones: [{ value: "+49 30 123456", type: "work", primary: true }], addresses: [], notes: "", tags: [], warnings: [],
        },
      }],
    }, (prefix) => `${prefix}-${sequence += 1}`, "2026-09-30T12:00:00.000Z");

    const updated = result.database.contacts.find((contact) => contact.id === existing.id)!;
    const primaryAffiliation = result.database.contactAffiliations.find((affiliation) => affiliation.contactId === existing.id && affiliation.primary)!;
    expect(updated).toMatchObject({ givenName: "Imported", familyName: "Person", notes: "Keep this note" });
    expect(updated).not.toHaveProperty("displayName");
    expect(updated.phones.map((phone) => phone.value)).toEqual(["+49 30 123456"]);
    expect(result.database.companies.find((company) => company.id === primaryAffiliation.companyId)?.name).toBe("New Company");
    expect(primaryAffiliation).toMatchObject({ jobTitle: "New role", department: "Planning" });
    expect(result.batch.items[0].previousAffiliations?.length).toBeGreaterThan(0);
  });

  it("protects spreadsheet exports and round-trips supported CSV and vCard fields", () => {
    const candidate = {
      sourceKey: "one", prefix: "", givenName: "=cmd", familyName: "Lovelace", suffix: "", fullName: "", companyName: "Analytical Engines", jobTitle: "Engineer", department: "",
      emails: [{ value: "ada@example.com", type: "work" as const, primary: true }, { value: "ada@history.test", type: "other" as const, primary: false }],
      phones: [{ value: "+44 20 1234", type: "work" as const, primary: true }], addresses: [], notes: "Notes", tags: ["Planning"], warnings: [],
    };
    const csv = exportCandidatesCsv([candidate]);
    expect(csv).toContain("'=cmd");
    const csvData = parseDelimitedContacts(csv);
    const [csvRoundTrip] = candidatesFromDelimited(csvData, autoMapContactHeaders(csvData.headers));
    expect(csvRoundTrip.emails.map((email) => email.value)).toEqual(["ada@example.com", "ada@history.test"]);
    const vCard = exportCandidatesVCard([candidate]);
    expect(vCard).toMatch(/^BEGIN:VCARD\r\nVERSION:4.0[\s\S]*END:VCARD$/);
    expect(parseVCardContacts(vCard)[0]).toMatchObject({ givenName: "=cmd", familyName: "Lovelace", companyName: "Analytical Engines", jobTitle: "Engineer", notes: "Notes", tags: ["Planning"] });
  });
});
