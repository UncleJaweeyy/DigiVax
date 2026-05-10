export interface VaccinationRecord {
  id: string;
  patientName: string;
  vaccineType: string;
  timestamp: string;
  status?: "Completed" | "Pending Review";
}

export type VaccinationRecordStatus = "Completed" | "Pending Review";

export interface VaccinationRecordDocument {
  id: string;
  patientName: string;
  patientNameLower: string;
  vaccineType: string;
  vaccineTypeLower: string;
  vaccinationDate: string;
  recordYear: string;
  rawText: string;
  correctedText: string;
  status: VaccinationRecordStatus;
  sourceFileName?: string;
  sourceFileType?: string;
  sourceStoragePath?: string;
  searchKeywords: string[];
  createdBy: string;
  createdByName: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface NewVaccinationRecordInput {
  rawText: string;
  correctedText?: string;
  sourceFileName?: string;
  sourceFileType?: string;
}
