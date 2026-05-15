export interface ClinicPatientDetails {
  name: string;
  age: string;
  dateOfBirth: string;
  address: string;
  motherName: string;
  fatherName: string;
  nutritionalStatus: string;
  birthWeight: string;
  epiStatus: string;
  feedingType: string;
}

export interface ClinicVisitRow {
  id: string;
  date: string;
  wt: string;
  vs: string;
  episode: string;
  dangerSigns: string;
  otherCc: string;
  management: string;
}

export interface ClinicRecordDraft {
  patient: ClinicPatientDetails;
  vaccines: string[];
  visits: ClinicVisitRow[];
}

export interface OcrTokenMetadata {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
  section: "HEADER" | "PATIENT_INFORMATION" | "NUTRITIONAL_STATUS" | "TABLE_RECORDS" | "UNKNOWN";
  label: string;
  confidence?: number;
  bbox?: number[];
}

export interface OcrExtractionMetadata {
  imageSize?: [number, number];
  processingTimeMs?: number;
  averageConfidence?: number;
  modelInfo?: Record<string, string | number | boolean>;
  tokens: OcrTokenMetadata[];
}

export interface ReviewedRecordLabel {
  label: string;
  displayLabel: string;
  value: string;
  field: string;
  source: "clinicRecord" | "correctedText";
  row?: number;
}

export interface OcrVisualization {
  mimeType: string;
  dataUrl: string;
  boxes: Array<{
    index: number;
    field?: string;
    text?: string;
    confidence?: number;
    bbox?: number[];
  }>;
}
