export interface VaccinationRecord {
  id: string;
  patientName: string;
  vaccineType: string;
  timestamp: string;
  status?: "Completed" | "Pending Review";
}