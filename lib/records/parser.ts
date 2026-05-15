export interface ParsedVaccinationText {
  patientName: string;
  vaccineType: string;
  vaccinationDate: string;
  recordYear: string;
  searchKeywords: string[];
}

const unknownPatient = "Unknown Patient";
const unknownVaccine = "Unspecified Vaccine";

export function parseVaccinationText(text: string): ParsedVaccinationText {
  // Until the TF-IDF/SVM classifier is connected, regex extraction gives saved records stable fields.
  const patientName = findValue(text, [
    /(?:name|patient name|child name)\s*:\s*([^\n\r]+)/i,
  ]) || unknownPatient;

  const vaccineType = findValue(text, [
    /(?:vaccine|vaccine type|immunization)\s*:\s*([^\n\r]+)/i,
    /(?:1st dose|2nd dose|3rd dose|booster)\s*:\s*([^\n\r]+)/i,
  ]) || unknownVaccine;

  const vaccinationDate = findValue(text, [
    /(?:date administered|date given|date)\s*:\s*([^\n\r]+)/i,
  ]) || "";

  // Year is stored separately so dashboard/search filters can group records without reparsing text.
  const recordYear = extractRecordYear(vaccinationDate) || extractRecordYear(text);

  return {
    patientName: normalizeDisplayValue(patientName),
    vaccineType: normalizeDisplayValue(vaccineType),
    vaccinationDate: normalizeDisplayValue(vaccinationDate),
    recordYear,
    searchKeywords: buildSearchKeywords([patientName, vaccineType, vaccinationDate, recordYear, text]),
  };
}

function findValue(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function normalizeDisplayValue(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractRecordYear(value: string) {
  const fourDigitYear = value.match(/\b(19|20)\d{2}\b/)?.[0];

  if (fourDigitYear) {
    return fourDigitYear;
  }

  const twoDigitDate = value.match(/\b\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*(\d{2})\b/);
  const year = twoDigitDate ? Number(twoDigitDate[1]) : Number.NaN;

  if (!Number.isFinite(year)) {
    return "";
  }

  return String(year <= 49 ? 2000 + year : 1900 + year);
}

function buildSearchKeywords(values: string[]) {
  // Firestore stores a compact keyword list alongside the display fields for lightweight search.
  const words = values
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2);

  return Array.from(new Set(words)).slice(0, 200);
}
