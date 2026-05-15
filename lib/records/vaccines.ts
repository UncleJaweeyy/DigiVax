export const knownVaccineOptions = ["BCG", "DPT", "OPV", "Hepa B", "AM"];

const knownVaccinePattern = /\b(BCG|HEPA\s*B|HEPAB|HEP\s*B|HEPB|DPT|DTP|OPV\d*|0PV\d*|IPV|PCV\d*|PENTA\w*|PENTO\w*|ROTA|AM|MCV|MMR)\b/i;

const nonVaccineTerms = new Set([
  "ARI",
  "CC",
  "COUGH",
  "COLDS",
  "COLD",
  "DIARRHEA",
  "FEVER",
  "MANAGEMENT",
  "OTHER",
  "WT",
  "VS",
]);

export function splitVaccineText(value: string) {
  return value
    .split(/\s*(?:\/|,|;|\n)\s*/g)
    .map((item) => normalizeVaccineName(item))
    .filter(Boolean);
}

export function normalizeVaccineName(value: string) {
  return value
    .replace(/\bHEPA\s*B\b/i, "Hepa B")
    .replace(/\bHEP\s*B\b/i, "Hepa B")
    .replace(/\bHEPAB\b/i, "Hepa B")
    .replace(/\bHEPB\b/i, "Hepa B")
    .replace(/\b0PV\b/i, "OPV")
    .replace(/\bDTP\b/i, "DPT")
    .replace(/\bPENTAT\b/i, "Penta")
    .replace(/\bPENTO\b/i, "Penta")
    .replace(/\s+/g, " ")
    .trim();
}

export function isKnownVaccineOption(value: string) {
  const normalized = normalizeVaccineKey(value);
  return knownVaccineOptions.some((option) => normalizeVaccineKey(option) === normalized);
}

export function isLikelyVaccineTerm(value: string) {
  const normalized = normalizeVaccineName(value);
  if (!normalized) return false;
  if (knownVaccinePattern.test(normalized)) return true;

  const key = normalized.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!key || nonVaccineTerms.has(key)) return false;

  if (/\b(vaccines?|vaccinations?|vax|booster|dose)\b/i.test(normalized)) {
    return true;
  }

  if (/^[A-Z0-9-]{2,16}$/.test(normalized) && /[A-Z]/.test(normalized)) {
    return /[0-9]/.test(normalized) || normalized === normalized.toUpperCase();
  }

  return false;
}

export function getCustomVaccineText(vaccines: string[]) {
  return vaccines.filter((vaccine) => !isKnownVaccineOption(vaccine)).join(", ");
}

export function mergeKnownVaccineSelection(vaccines: string[], value: string, checked: boolean) {
  const normalizedValue = normalizeVaccineName(value);
  const nextVaccines = checked
    ? [...vaccines, normalizedValue]
    : vaccines.filter((item) => normalizeVaccineKey(item) !== normalizeVaccineKey(normalizedValue));

  return uniqueVaccines(nextVaccines);
}

export function mergeCustomVaccines(vaccines: string[], customText: string) {
  const knownVaccines = vaccines.filter(isKnownVaccineOption);
  return uniqueVaccines([...knownVaccines, ...splitVaccineText(customText)]);
}

function uniqueVaccines(vaccines: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const vaccine of vaccines.map(normalizeVaccineName).filter(Boolean)) {
    const key = normalizeVaccineKey(vaccine);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(vaccine);
  }

  return unique;
}

function normalizeVaccineKey(value: string) {
  return normalizeVaccineName(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}
