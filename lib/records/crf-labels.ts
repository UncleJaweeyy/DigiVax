import type { OcrExtractionMetadata } from "@/types/clinic-record";

export interface CrfLabelCount {
  label: string;
  displayLabel: string;
  count: number;
}

const labelNames: Record<string, string> = {
  DATE: "Date",
  FINDINGS: "Findings",
  HEADER: "Header",
  NUTRITIONAL_STATUS: "Nutritional Status",
  PATIENT_INFORMATION: "Patient Information",
  VACCINE: "Vaccine",
  TEXT: "Text",
  UNKNOWN: "Unknown",
};

export function getCrfLabelCounts(metadata?: OcrExtractionMetadata): CrfLabelCount[] {
  const counts = new Map<string, number>();

  for (const token of metadata?.tokens || []) {
    const label = normalizeCrfLabel(token.label || token.section || "TEXT");
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

export function getCrfPredictionTotal(metadata?: OcrExtractionMetadata) {
  return metadata?.tokens?.length || 0;
}

export function getCrfLabelDisplayName(label: string) {
  const normalized = normalizeCrfLabel(label);

  return labelNames[normalized] || titleCase(normalized.replace(/_/g, " "));
}

export function normalizeCrfLabel(label: string) {
  const normalized = label.trim().toUpperCase().replace(/[\s-]+/g, "_");

  if (normalized === "PATIENT" || normalized === "PATIENT_INFO" || normalized === "CHILD_NAME") {
    return "PATIENT_INFORMATION";
  }

  if (normalized === "NUTRITION" || normalized === "NUTRITIONAL") {
    return "NUTRITIONAL_STATUS";
  }

  return normalized || "TEXT";
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
