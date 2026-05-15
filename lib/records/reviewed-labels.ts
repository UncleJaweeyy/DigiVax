import type { ClinicRecordDraft, ReviewedRecordLabel } from "@/types/clinic-record";
import { getCrfLabelDisplayName, normalizeCrfLabel } from "@/lib/records/crf-labels";
import { isLikelyVaccineTerm, normalizeVaccineName } from "@/lib/records/vaccines";

const textLineLabels: Array<{ pattern: RegExp; label: string; field: string }> = [
  { pattern: /^name\s*:/i, label: "PATIENT_INFORMATION", field: "Name" },
  { pattern: /^age\s*:/i, label: "PATIENT_INFORMATION", field: "Age" },
  { pattern: /^date of birth\s*:/i, label: "PATIENT_INFORMATION", field: "Date of Birth" },
  { pattern: /^address\s*:/i, label: "PATIENT_INFORMATION", field: "Address" },
  { pattern: /^mother'?s name\s*:/i, label: "PATIENT_INFORMATION", field: "Mother's Name" },
  { pattern: /^father'?s name\s*:/i, label: "PATIENT_INFORMATION", field: "Father's Name" },
  { pattern: /^nutritional status\s*:/i, label: "NUTRITIONAL_STATUS", field: "Nutritional Status" },
  { pattern: /^birth weight\s*:/i, label: "NUTRITIONAL_STATUS", field: "Birth Weight" },
  { pattern: /^epi status\s*:/i, label: "NUTRITIONAL_STATUS", field: "EPI Status" },
  { pattern: /^type of feeding\s*:/i, label: "NUTRITIONAL_STATUS", field: "Type of Feeding" },
  { pattern: /^vaccine type\s*:/i, label: "VACCINE", field: "Vaccine Type" },
  { pattern: /^date\s*:/i, label: "DATE", field: "Date" },
];

export function buildReviewedLabels(
  clinicRecord: ClinicRecordDraft | undefined,
  correctedText: string,
): ReviewedRecordLabel[] {
  const clinicLabels = clinicRecord ? buildClinicRecordLabels(clinicRecord) : [];
  const labels = clinicLabels.length ? clinicLabels : buildCorrectedTextLabels(correctedText);

  return dedupeLabels(labels).slice(0, 160);
}

export function getReviewedLabelCounts(labels?: ReviewedRecordLabel[]) {
  const counts = new Map<string, number>();

  for (const item of labels || []) {
    const label = normalizeCrfLabel(item.label);
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      displayLabel: getCrfLabelDisplayName(label),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.displayLabel.localeCompare(b.displayLabel));
}

export function getReviewedLabelTotal(labels?: ReviewedRecordLabel[]) {
  return labels?.length || 0;
}

function buildClinicRecordLabels(record: ClinicRecordDraft) {
  const labels: ReviewedRecordLabel[] = [];
  const patient = record.patient;

  add(labels, "PATIENT_INFORMATION", "Name", patient.name);
  add(labels, "PATIENT_INFORMATION", "Age", patient.age);
  add(labels, "PATIENT_INFORMATION", "Date of Birth", patient.dateOfBirth);
  add(labels, "PATIENT_INFORMATION", "Address", patient.address);
  add(labels, "PATIENT_INFORMATION", "Mother's Name", patient.motherName);
  add(labels, "PATIENT_INFORMATION", "Father's Name", patient.fatherName);
  add(labels, "NUTRITIONAL_STATUS", "Nutritional Status", patient.nutritionalStatus);
  add(labels, "NUTRITIONAL_STATUS", "Birth Weight", patient.birthWeight);
  add(labels, "NUTRITIONAL_STATUS", "EPI Status", normalizeCheckedStatus(patient.epiStatus));
  add(labels, "NUTRITIONAL_STATUS", "Type of Feeding", patient.feedingType);

  for (const vaccine of record.vaccines) {
    add(labels, "VACCINE", "Vaccine Type", vaccine);
  }

  record.visits.forEach((visit, index) => {
    const row = index + 1;
    add(labels, "DATE", "Visit Date", visit.date, row);
    add(labels, "FINDINGS", "Weight", visit.wt, row);
    add(labels, "FINDINGS", "Vital Signs", visit.vs, row);
    add(labels, "FINDINGS", "Episode", visit.episode, row);
    add(labels, "FINDINGS", "Danger Signs", visit.dangerSigns, row);
    addVisitOtherCcLabels(labels, visit.otherCc, row);
    add(labels, "FINDINGS", "Management", isLikelyOcrNoise(visit.management) ? "" : visit.management, row);
  });

  return labels;
}

function addVisitOtherCcLabels(labels: ReviewedRecordLabel[], value: string, row: number) {
  const parts = splitClinicalList(value);
  const vaccines = parts.filter(isLikelyVaccineTerm);
  const findings = parts.filter((part) => !isLikelyVaccineTerm(part));

  for (const vaccine of vaccines) {
    add(labels, "VACCINE", "Visit Vaccine", normalizeVaccineName(vaccine), row);
  }

  if (findings.length) {
    add(labels, "FINDINGS", "Other Chief Complaint", findings.join(" "), row);
  }
}

function splitClinicalList(value: string) {
  return value
    .split(/\s*(?:\/|,|;|\n)\s*/g)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeCheckedStatus(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (/^\(\s*\)\s*(complete|incomplete)$/i.test(trimmed)) return "";
  return trimmed.replace(/^\([^)]*[x✓✔]\)\s*/i, "");
}

function isLikelyOcrNoise(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/[a-z0-9]/i.test(trimmed)) return false;
  return Array.from(trimmed).length <= 2;
}

function buildCorrectedTextLabels(text: string) {
  const labels: ReviewedRecordLabel[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const matched = textLineLabels.find((item) => item.pattern.test(trimmed));
    if (!matched) continue;

    const value = trimmed.replace(/^[^:]+:\s*/, "").trim();
    add(labels, matched.label, matched.field, value, undefined, "correctedText");
  }

  return labels;
}

function add(
  labels: ReviewedRecordLabel[],
  label: string,
  field: string,
  value: string,
  row?: number,
  source: ReviewedRecordLabel["source"] = "clinicRecord",
) {
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  if (!normalizedValue) return;

  const normalizedLabel = normalizeCrfLabel(label);
  labels.push({
    label: normalizedLabel,
    displayLabel: getCrfLabelDisplayName(normalizedLabel),
    value: normalizedValue,
    field,
    source,
    ...(row ? { row } : {}),
  });
}

function dedupeLabels(labels: ReviewedRecordLabel[]) {
  const seen = new Set<string>();
  const unique: ReviewedRecordLabel[] = [];

  for (const label of labels) {
    const key = [
      label.label,
      label.field.toLowerCase(),
      label.value.toLowerCase(),
      label.row || "",
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(label);
  }

  return unique;
}
