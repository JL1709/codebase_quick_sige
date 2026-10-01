import { contactDisplayName, normalizeEmail, splitContactFullName } from "./contacts";
import type { Contact, ContactAddress, ContactMethodType, ContactSource, ExternalContactProvider } from "./types";

export const MAX_CONTACT_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_CONTACT_IMPORT_RECORDS = 10_000;
export const MAX_CONTACT_FIELD_LENGTH = 4_000;
export const MAX_CONTACT_XLSX_EXPANDED_BYTES = 64 * 1024 * 1024;
const MAX_CONTACT_XLSX_ENTRIES = 1_000;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;

export function sanitizeContactImportLabel(value: string, maximumLength = 240): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? " " : character;
    })
    .join("")
    .trim()
    .slice(0, maximumLength);
}

function readFileArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("unsupported_encoding"));
    reader.onerror = () => reject(reader.error ?? new Error("unsupported_encoding"));
    reader.readAsArrayBuffer(file);
  });
}

export interface ContactImportValue {
  value: string;
  type: ContactMethodType;
  primary: boolean;
}

export interface ContactImportCandidate {
  sourceKey: string;
  /** Transient provider folder/group membership used only by the review filter. */
  collectionIds?: string[];
  prefix: string;
  givenName: string;
  familyName: string;
  suffix: string;
  /** A transient full-name value from files/providers; saved contacts use structured name parts only. */
  fullName: string;
  companyName: string;
  jobTitle: string;
  department: string;
  emails: ContactImportValue[];
  phones: ContactImportValue[];
  addresses: Omit<ContactAddress, "id">[];
  notes: string;
  tags: string[];
  externalIdentity?: {
    provider: ExternalContactProvider;
    providerAccountId: string;
    externalContactId: string;
    sourceRevision?: string;
  };
  warnings: string[];
}

export function structuredNameForCandidate(candidate: Pick<ContactImportCandidate, "prefix" | "givenName" | "familyName" | "suffix" | "fullName">) {
  const structuredName = {
    prefix: candidate.prefix.trim(),
    givenName: candidate.givenName.trim(),
    familyName: candidate.familyName.trim(),
    suffix: candidate.suffix.trim(),
  };
  if (structuredName.givenName || structuredName.familyName) return structuredName;
  const parsedName = splitContactFullName(candidate.fullName);
  return {
    prefix: structuredName.prefix || parsedName.prefix,
    givenName: parsedName.givenName,
    familyName: parsedName.familyName,
    suffix: structuredName.suffix || parsedName.suffix,
  };
}

export function candidateDisplayName(candidate: Pick<ContactImportCandidate, "prefix" | "givenName" | "familyName" | "suffix" | "fullName">): string {
  return contactDisplayName(structuredNameForCandidate(candidate));
}

export function matchContactImportCandidate(
  candidate: ContactImportCandidate,
  contacts: Contact[],
): Contact | undefined {
  const emailValues = new Set(candidate.emails.map((email) => normalizeEmail(email.value)).filter(Boolean));
  if (emailValues.size === 0) return undefined;
  return contacts.find((contact) => contact.emails.some((email) => emailValues.has(email.normalizedValue || normalizeEmail(email.value))));
}

export type ContactImportField =
  | "ignore"
  | "fullName"
  | "givenName"
  | "familyName"
  | "prefix"
  | "suffix"
  | "companyName"
  | "jobTitle"
  | "department"
  | "email"
  | "phone"
  | "street"
  | "postalCode"
  | "city"
  | "region"
  | "country"
  | "notes"
  | "tags";

export interface DelimitedImportData {
  delimiter: string;
  headers: string[];
  rows: string[][];
  sourceRows?: string[][];
  warnings?: string[];
}

export type ContactTextEncoding = "utf-8" | "windows-1252" | "iso-8859-1";

const HEADER_ALIASES: Record<string, ContactImportField> = {
  name: "fullName",
  fullname: "fullName",
  "full name": "fullName",
  "display name": "fullName",
  anzeigename: "fullName",
  vorname: "givenName",
  firstname: "givenName",
  "first name": "givenName",
  givenname: "givenName",
  nachname: "familyName",
  lastname: "familyName",
  "last name": "familyName",
  surname: "familyName",
  title: "prefix",
  anrede: "prefix",
  suffix: "suffix",
  firma: "companyName",
  unternehmen: "companyName",
  company: "companyName",
  organization: "companyName",
  "company name": "companyName",
  position: "jobTitle",
  funktion: "jobTitle",
  jobtitle: "jobTitle",
  "job title": "jobTitle",
  department: "department",
  abteilung: "department",
  email: "email",
  "e-mail": "email",
  "e-mail address": "email",
  "email address": "email",
  "geschäftlich e-mail": "email",
  "e-mail-adresse": "email",
  phone: "phone",
  telefon: "phone",
  mobil: "phone",
  mobile: "phone",
  "mobile phone": "phone",
  "business phone": "phone",
  straße: "street",
  strasse: "street",
  street: "street",
  "business street": "street",
  plz: "postalCode",
  postleitzahl: "postalCode",
  "postal code": "postalCode",
  zip: "postalCode",
  ort: "city",
  city: "city",
  "business city": "city",
  bundesland: "region",
  state: "region",
  region: "region",
  land: "country",
  country: "country",
  notizen: "notes",
  notes: "notes",
  tags: "tags",
  schlagwörter: "tags",
};

function normalizedHeader(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function autoMapContactHeaders(headers: string[]): ContactImportField[] {
  return headers.map((header) => {
    const normalized = normalizedHeader(header);
    const exact = Object.entries(HEADER_ALIASES).find(([alias]) => normalizedHeader(alias) === normalized)?.[1];
    if (exact) return exact;
    if (/^given name$/.test(normalized)) return "givenName";
    if (/^family name$/.test(normalized)) return "familyName";
    if (/^organization.*name$/.test(normalized)) return "companyName";
    if (/^organization.*title$/.test(normalized)) return "jobTitle";
    if (/^organization.*department$/.test(normalized)) return "department";
    if (/^(e mail|email).*(value|address)$/.test(normalized)) return "email";
    if (/(^| )(e mail|email)( |$)/.test(normalized) && !/(type|label)/.test(normalized)) return "email";
    if (/^phone.*value$/.test(normalized)) return "phone";
    if (/(^| )(phone|telefon|mobile|mobil)( |$)/.test(normalized) && !/(type|label)/.test(normalized)) return "phone";
    if (/^address.*street$/.test(normalized)) return "street";
    if (/^address.*(postal code|zip)$/.test(normalized)) return "postalCode";
    if (/^address.*city$/.test(normalized)) return "city";
    if (/^address.*(region|state)$/.test(normalized)) return "region";
    if (/^address.*country$/.test(normalized)) return "country";
    return "ignore";
  });
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 8).join("\n");
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestScore = -1;
  for (const delimiter of candidates) {
    const rows = parseDelimitedRows(sample, delimiter);
    const lengths = rows.filter((row) => row.some(Boolean)).map((row) => row.length);
    if (lengths.length === 0) continue;
    const commonLength = Math.max(...lengths.map((length) => lengths.filter((candidate) => candidate === length).length));
    const score = Math.max(...lengths) * 100 + commonLength;
    if (score > bestScore) { best = delimiter; bestScore = score; }
  }
  return best;
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
      continue;
    }
    if (character === '"' && value.length === 0) { quoted = true; continue; }
    if (character === delimiter) { row.push(value); value = ""; continue; }
    if (character === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; continue; }
    value += character;
  }
  row.push(value.replace(/\r$/, ""));
  if (row.some((cell) => cell.length > 0) || rows.length === 0) rows.push(row);
  return rows;
}

async function parseDelimitedRowsCooperatively(text: string, delimiter: string): Promise<string[][]> {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const charactersPerChunk = 250_000;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"' && value.length === 0) quoted = true;
    else if (character === delimiter) { row.push(value); value = ""; }
    else if (character === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += character;
    if (index > 0 && index % charactersPerChunk === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  row.push(value.replace(/\r$/, ""));
  if (row.some((cell) => cell.length > 0) || rows.length === 0) rows.push(row);
  return rows;
}

export function parseDelimitedContacts(text: string, delimiterOverride?: string): DelimitedImportData {
  const normalizedText = text.replace(/^\uFEFF/, "");
  const delimiter = delimiterOverride ?? detectDelimiter(normalizedText);
  const rows = parseDelimitedRows(normalizedText, delimiter);
  const headers = rows.shift()?.map(limitedValue) ?? [];
  const dataRows = rows.filter((row) => row.some((value) => value.trim())).map((row) => row.map(limitedValue));
  return { delimiter, headers, rows: dataRows, sourceRows: [headers, ...dataRows] };
}

export async function parseDelimitedContactsAsync(text: string, delimiterOverride?: string): Promise<DelimitedImportData> {
  const normalizedText = text.replace(/^\uFEFF/, "");
  const delimiter = delimiterOverride ?? detectDelimiter(normalizedText);
  const rows = await parseDelimitedRowsCooperatively(normalizedText, delimiter);
  const headers = rows.shift()?.map(limitedValue) ?? [];
  const dataRows = rows.filter((row) => row.some((value) => value.trim())).map((row) => row.map(limitedValue));
  return { delimiter, headers, rows: dataRows, sourceRows: [headers, ...dataRows] };
}

function limitedValue(value: string): string {
  return value.trim().slice(0, MAX_CONTACT_FIELD_LENGTH);
}

function contactMethodType(header: string): ContactMethodType {
  const normalized = normalizedHeader(header);
  if (/mobile|mobil|cell/.test(normalized)) return "mobile";
  if (/home|privat/.test(normalized)) return "home";
  if (/other|weitere/.test(normalized)) return "other";
  return "work";
}

export function candidatesFromDelimited(
  data: DelimitedImportData,
  mapping = autoMapContactHeaders(data.headers),
  rowOffset = 0,
): ContactImportCandidate[] {
  if (data.rows.length > MAX_CONTACT_IMPORT_RECORDS) throw new Error("too_many_records");
  return data.rows.map((row, rowIndex) => {
    const values: Record<ContactImportField, string[]> = {
      ignore: [], fullName: [], givenName: [], familyName: [], prefix: [], suffix: [], companyName: [], jobTitle: [], department: [],
      email: [], phone: [], street: [], postalCode: [], city: [], region: [], country: [], notes: [], tags: [],
    };
    row.forEach((cell, columnIndex) => values[mapping[columnIndex] ?? "ignore"].push(limitedValue(cell)));
    const emails = row.flatMap((cell, columnIndex) => mapping[columnIndex] === "email" && cell.trim() ? [{
      value: limitedValue(cell), type: contactMethodType(data.headers[columnIndex] ?? ""), primary: false,
    }] : []).map((email, index) => ({ ...email, primary: index === 0 }));
    const phones = row.flatMap((cell, columnIndex) => mapping[columnIndex] === "phone" && cell.trim() ? [{
      value: limitedValue(cell), type: contactMethodType(data.headers[columnIndex] ?? ""), primary: false,
    }] : []).map((phone, index) => ({ ...phone, primary: index === 0 }));
    const addressValues = [values.street[0], values.postalCode[0], values.city[0], values.region[0], values.country[0]];
    const addresses = addressValues.some(Boolean) ? [{
      type: "work" as const,
      street: values.street[0] ?? "",
      postalCode: values.postalCode[0] ?? "",
      city: values.city[0] ?? "",
      region: values.region[0] ?? "",
      country: values.country[0] ?? "",
      primary: true,
    }] : [];
    return {
      sourceKey: `row-${rowIndex + rowOffset + 2}`,
      prefix: values.prefix[0] ?? "",
      givenName: values.givenName[0] ?? "",
      familyName: values.familyName[0] ?? "",
      suffix: values.suffix[0] ?? "",
      fullName: values.fullName[0] ?? "",
      companyName: values.companyName[0] ?? "",
      jobTitle: values.jobTitle[0] ?? "",
      department: values.department[0] ?? "",
      emails,
      phones,
      addresses,
      notes: values.notes.filter(Boolean).join("\n"),
      tags: values.tags.flatMap((value) => value.split(/[;,]/)).map((value) => value.trim()).filter(Boolean),
      warnings: [...(data.warnings ?? [])],
    };
  });
}

export async function candidatesFromDelimitedAsync(
  data: DelimitedImportData,
  mapping = autoMapContactHeaders(data.headers),
): Promise<ContactImportCandidate[]> {
  if (data.rows.length > MAX_CONTACT_IMPORT_RECORDS) throw new Error("too_many_records");
  const rowsPerChunk = 250;
  const candidates: ContactImportCandidate[] = [];
  for (let offset = 0; offset < data.rows.length; offset += rowsPerChunk) {
    candidates.push(...candidatesFromDelimited({ ...data, rows: data.rows.slice(offset, offset + rowsPerChunk) }, mapping, offset));
    if (offset + rowsPerChunk < data.rows.length) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return candidates;
}

function decodeQuotedPrintable(value: string, charset = "utf-8"): string {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
    } else bytes.push(value.charCodeAt(index));
  }
  try { return new TextDecoder(charset).decode(new Uint8Array(bytes)); } catch { return value; }
}

function decodeVCardValue(value: string, quotedPrintable: boolean, charset?: string): string {
  const decoded = quotedPrintable ? decodeQuotedPrintable(value, charset) : value;
  return decoded.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function vCardType(parameters: string): ContactMethodType {
  const normalized = parameters.toLocaleLowerCase();
  if (normalized.includes("cell") || normalized.includes("mobile")) return "mobile";
  if (normalized.includes("home")) return "home";
  if (normalized.includes("work")) return "work";
  return "other";
}

function emptyCandidate(sourceKey: string): ContactImportCandidate {
  return {
    sourceKey, prefix: "", givenName: "", familyName: "", suffix: "", fullName: "", companyName: "", jobTitle: "", department: "",
    emails: [], phones: [], addresses: [], notes: "", tags: [], warnings: [],
  };
}

export function parseVCardContacts(text: string): ContactImportCandidate[] {
  const unfolded = text.replace(/=\r?\n[ \t]?/g, "").replace(/\r?\n[ \t]/g, "");
  const cardSegments = unfolded.split(/(?=BEGIN:VCARD)/i).filter((segment) => /^BEGIN:VCARD/i.test(segment));
  if (cardSegments.length > MAX_CONTACT_IMPORT_RECORDS) throw new Error("too_many_records");
  return cardSegments.map((segment, cardIndex) => {
    const candidate = emptyCandidate(`vcard-${cardIndex + 1}`);
    const endIndex = segment.search(/END:VCARD/i);
    if (endIndex < 0) {
      candidate.warnings.push("malformed_card:missing_end");
      return candidate;
    }
    const card = segment.slice(0, endIndex + "END:VCARD".length);
    const ignored = new Set<string>();
    for (const rawLine of card.split(/\r?\n/)) {
      const colonIndex = rawLine.indexOf(":");
      if (colonIndex < 0) continue;
      const descriptor = rawLine.slice(0, colonIndex);
      const rawValue = rawLine.slice(colonIndex + 1);
      const [rawName, ...parameterParts] = descriptor.split(";");
      const name = rawName.split(".").at(-1)?.toLocaleUpperCase() ?? "";
      const parameters = parameterParts.join(";");
      const charset = parameters.match(/CHARSET=([^;:]+)/i)?.[1]?.replace(/^"|"$/g, "") ?? "utf-8";
      const value = decodeVCardValue(rawValue, /ENCODING=QUOTED-PRINTABLE/i.test(parameters), charset);
      if (name === "FN") candidate.fullName = limitedValue(value);
      else if (name === "N") {
        const [familyName = "", givenName = "", additional = "", prefix = "", suffix = ""] = value.split(/(?<!\\);/).map((part) => decodeVCardValue(part, false));
        candidate.familyName = limitedValue(familyName);
        candidate.givenName = limitedValue([givenName, additional].filter(Boolean).join(" "));
        candidate.prefix = limitedValue(prefix);
        candidate.suffix = limitedValue(suffix);
      } else if (name === "ORG") candidate.companyName = limitedValue(value.split(/(?<!\\);/)[0] ?? "");
      else if (name === "TITLE") candidate.jobTitle = limitedValue(value);
      else if (name === "ROLE" && !candidate.jobTitle) candidate.jobTitle = limitedValue(value);
      else if (name === "EMAIL" && value) candidate.emails.push({ value: limitedValue(value.replace(/^mailto:/i, "")), type: vCardType(parameters), primary: /PREF(?:=1)?/i.test(parameters) || candidate.emails.length === 0 });
      else if (name === "TEL" && value) candidate.phones.push({ value: limitedValue(value.replace(/^tel:/i, "")), type: vCardType(parameters), primary: /PREF(?:=1)?/i.test(parameters) || candidate.phones.length === 0 });
      else if (name === "ADR") {
        const [, , street = "", city = "", region = "", postalCode = "", country = ""] = value.split(/(?<!\\);/).map((part) => decodeVCardValue(part, false));
        candidate.addresses.push({ type: vCardType(parameters), street: limitedValue(street), postalCode: limitedValue(postalCode), city: limitedValue(city), region: limitedValue(region), country: limitedValue(country), primary: /PREF(?:=1)?/i.test(parameters) || candidate.addresses.length === 0 });
      } else if (name === "NOTE") candidate.notes = limitedValue(value);
      else if (name === "CATEGORIES") candidate.tags = value.split(/(?<!\\),/).map((part) => decodeVCardValue(part, false)).filter(Boolean);
      else if (["PHOTO", "BDAY", "GENDER", "KEY", "SOUND"].includes(name)) ignored.add(name.toLocaleLowerCase());
    }
    if (ignored.size > 0) candidate.warnings.push(`ignored:${[...ignored].sort().join(",")}`);
    if (!candidate.fullName) candidate.fullName = [candidate.prefix, candidate.givenName, candidate.familyName, candidate.suffix].filter(Boolean).join(" ");
    return candidate;
  });
}

export async function parseXlsxContacts(arrayBuffer: ArrayBuffer): Promise<DelimitedImportData[]> {
  if (arrayBuffer.byteLength > MAX_CONTACT_IMPORT_BYTES) throw new Error("file_too_large");
  const signature = new Uint8Array(arrayBuffer.slice(0, 4));
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) throw new Error("malformed_xlsx");
  inspectXlsxArchive(arrayBuffer);
  const { unzipSync, strFromU8 } = await import("fflate");
  let formulaOnlyCellCount = 0;
  try {
    const entries = unzipSync(new Uint8Array(arrayBuffer));
    for (const [filename, contents] of Object.entries(entries)) {
      if (!/^xl\/worksheets\/[^/]+\.xml$/i.test(filename)) continue;
      const worksheetXml = strFromU8(contents);
      const cells = worksheetXml.match(/<c\b[^>]*>[\s\S]*?<\/c>/gi) ?? [];
      formulaOnlyCellCount += cells.filter((cell) => /<f\b/i.test(cell) && !/<v\b/i.test(cell) && !/<is\b/i.test(cell)).length;
    }
  } catch {
    throw new Error("malformed_xlsx");
  }
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  let workbook;
  try {
    workbook = await readXlsxFile(arrayBuffer);
  } catch {
    throw new Error("malformed_xlsx");
  }

  let totalRecords = 0;
  const cellText = (value: unknown): string => {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value === null || value === undefined ? "" : String(value);
  };

  return workbook.flatMap(({ sheet, data }) => {
    if (data.length === 0) return [];
    totalRecords += Math.max(0, data.length - 1);
    if (totalRecords > MAX_CONTACT_IMPORT_RECORDS) throw new Error("too_many_records");
    const textRows = data.map((row) => row.map((value) => limitedValue(cellText(value))));
    const [headerRow = [], ...dataRows] = textRows;
    const headers = headerRow.map((value) => limitedValue(cellText(value)));
    if (headers.length === 0 || headers.every((header) => header.length === 0)) return [];
    return [{
      delimiter: sanitizeContactImportLabel(sheet), headers, rows: dataRows, sourceRows: textRows,
      warnings: formulaOnlyCellCount > 0 ? [`formula_only_cells:${formulaOnlyCellCount}`] : [],
    }];
  });
}

function inspectXlsxArchive(arrayBuffer: ArrayBuffer): void {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const minimumEndRecordSize = 22;
  const maximumCommentSize = 65_535;
  let endRecordOffset = -1;
  for (let offset = Math.max(0, bytes.length - minimumEndRecordSize); offset >= Math.max(0, bytes.length - minimumEndRecordSize - maximumCommentSize); offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) { endRecordOffset = offset; break; }
  }
  if (endRecordOffset < 0) throw new Error("malformed_xlsx");
  const entryCount = view.getUint16(endRecordOffset + 10, true);
  const directorySize = view.getUint32(endRecordOffset + 12, true);
  const directoryOffset = view.getUint32(endRecordOffset + 16, true);
  if (entryCount === 0 || entryCount > MAX_CONTACT_XLSX_ENTRIES || directoryOffset + directorySize > endRecordOffset) throw new Error("malformed_xlsx");

  let cursor = directoryOffset;
  let expandedBytes = 0;
  const filenameDecoder = new TextDecoder("utf-8");
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endRecordOffset || view.getUint32(cursor, true) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) throw new Error("malformed_xlsx");
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const filenameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    if (uncompressedSize === 0xffffffff) throw new Error("xlsx_expansion_limit");
    expandedBytes += uncompressedSize;
    if (expandedBytes > MAX_CONTACT_XLSX_EXPANDED_BYTES) throw new Error("xlsx_expansion_limit");
    const filenameStart = cursor + 46;
    const filenameEnd = filenameStart + filenameLength;
    if (filenameEnd > endRecordOffset) throw new Error("malformed_xlsx");
    const filename = filenameDecoder.decode(bytes.subarray(filenameStart, filenameEnd));
    if (/vbaProject\.bin$/i.test(filename)) throw new Error("unsupported_file");
    cursor = filenameEnd + extraLength + commentLength;
  }
}

export async function readContactImportFile(file: File, options: { encoding?: ContactTextEncoding; delimiter?: string } = {}): Promise<{
  source: ContactSource;
  candidates?: ContactImportCandidate[];
  sheets?: DelimitedImportData[];
  rawText?: string;
}> {
  if (file.size > MAX_CONTACT_IMPORT_BYTES) throw new Error("file_too_large");
  const extension = file.name.split(".").at(-1)?.toLocaleLowerCase();
  const arrayBuffer = await readFileArrayBuffer(file);
  const signature = new Uint8Array(arrayBuffer.slice(0, 8));
  const isZip = signature[0] === 0x50 && signature[1] === 0x4b;
  const isPdf = String.fromCharCode(...signature.slice(0, 5)) === "%PDF-";
  const readText = async () => {
    if (isZip || isPdf) throw new Error("unsupported_file");
    try {
      return new TextDecoder(options.encoding ?? "utf-8", { fatal: true }).decode(arrayBuffer);
    } catch {
      throw new Error("unsupported_encoding");
    }
  };
  if (extension === "vcf" || extension === "vcard") {
    const text = await readText();
    if (text.includes("\0")) throw new Error("unsupported_encoding");
    if (!/BEGIN:VCARD/i.test(text)) throw new Error("malformed_vcard");
    const candidates = parseVCardContacts(text);
    if (candidates.length === 0) throw new Error("malformed_vcard");
    return { source: "vcard", candidates };
  }
  if (extension === "csv" || extension === "tsv" || extension === "txt") {
    const text = await readText();
    if (text.includes("\0")) throw new Error("unsupported_encoding");
    const data = await parseDelimitedContactsAsync(text, options.delimiter ?? (extension === "tsv" ? "\t" : undefined));
    return { source: "csv", candidates: await candidatesFromDelimitedAsync(data), sheets: [data], rawText: text };
  }
  if (extension === "xlsx") {
    if (!isZip) throw new Error("malformed_xlsx");
    return { source: "xlsx", sheets: await parseXlsxContacts(arrayBuffer) };
  }
  throw new Error("unsupported_file");
}

function csvCell(value: string): string {
  const protectedValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

export function exportCandidatesCsv(candidates: ContactImportCandidate[]): string {
  const emailColumnCount = Math.max(1, ...candidates.map((candidate) => candidate.emails.length));
  const phoneColumnCount = Math.max(1, ...candidates.map((candidate) => candidate.phones.length));
  const headers = [
    "Title / Prefix", "First Name", "Last Name", "Suffix", "Company", "Job Title",
    ...Array.from({ length: emailColumnCount }, (_, index) => `Email ${index + 1}`),
    ...Array.from({ length: phoneColumnCount }, (_, index) => `Phone ${index + 1}`),
    "Street", "Postal Code", "City", "Country", "Notes", "Tags",
  ];
  const rows = candidates.map((candidate) => {
    const name = structuredNameForCandidate(candidate);
    return [
      name.prefix, name.givenName, name.familyName, name.suffix, candidate.companyName, candidate.jobTitle,
      ...Array.from({ length: emailColumnCount }, (_, index) => candidate.emails[index]?.value ?? ""),
      ...Array.from({ length: phoneColumnCount }, (_, index) => candidate.phones[index]?.value ?? ""),
      candidate.addresses[0]?.street ?? "",
      candidate.addresses[0]?.postalCode ?? "", candidate.addresses[0]?.city ?? "", candidate.addresses[0]?.country ?? "",
      candidate.notes, candidate.tags.join("; "),
    ];
  });
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function exportContactCsvTemplate(locale: "de" | "en"): string {
  const headers = locale === "de"
    ? ["Titel / Präfix", "Vorname", "Nachname", "Suffix", "Firma", "Position", "E-Mail-Adresse", "Telefon", "Straße", "PLZ", "Ort", "Land", "Notizen", "Tags"]
    : ["Title / Prefix", "First Name", "Last Name", "Suffix", "Company", "Job Title", "Email Address", "Phone", "Street", "Postal Code", "City", "Country", "Notes", "Tags"];
  return `\uFEFF${headers.map(csvCell).join(",")}`;
}

function vCardEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function exportCandidatesVCard(candidates: ContactImportCandidate[]): string {
  return candidates.map((candidate) => {
    const name = structuredNameForCandidate(candidate);
    const lines = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      `FN:${vCardEscape(candidateDisplayName(candidate))}`,
      `N:${[name.familyName, name.givenName, "", name.prefix, name.suffix].map(vCardEscape).join(";")}`,
    ];
    if (candidate.companyName) lines.push(`ORG:${vCardEscape(candidate.companyName)}`);
    if (candidate.jobTitle) lines.push(`TITLE:${vCardEscape(candidate.jobTitle)}`);
    candidate.emails.forEach((email) => lines.push(`EMAIL;TYPE=${email.type}${email.primary ? ";PREF=1" : ""}:${vCardEscape(email.value)}`));
    candidate.phones.forEach((phone) => lines.push(`TEL;TYPE=${phone.type}${phone.primary ? ";PREF=1" : ""}:${vCardEscape(phone.value)}`));
    candidate.addresses.forEach((address) => lines.push(`ADR;TYPE=${address.type}${address.primary ? ";PREF=1" : ""}:;;${[address.street, address.city, address.region, address.postalCode, address.country].map(vCardEscape).join(";")}`));
    if (candidate.notes) lines.push(`NOTE:${vCardEscape(candidate.notes)}`);
    if (candidate.tags.length > 0) lines.push(`CATEGORIES:${candidate.tags.map(vCardEscape).join(",")}`);
    lines.push("END:VCARD");
    return lines.join("\r\n");
  }).join("\r\n");
}
