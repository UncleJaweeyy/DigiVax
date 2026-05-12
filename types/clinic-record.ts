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
