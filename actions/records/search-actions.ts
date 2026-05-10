"use server";

import { SEARCH_RECORDS } from "@/lib/dummy-data";

export interface RecordType {
  id: string;
  patientName: string;
  vaccineType: string;
  timestamp: string;
}

export async function getVaccinationRecords(query: string): Promise<RecordType[]> {
  await new Promise((resolve) => setTimeout(resolve, 400)); // Simulate delay

  try {
    // BACKEND CALL (Commented for now)
    // const records = await db.vaccinationRecords.findMany({...});
    
    if (!query) return SEARCH_RECORDS;

    const lowerQuery = query.toLowerCase();
    return SEARCH_RECORDS.filter(
      (record) =>
        record.patientName.toLowerCase().includes(lowerQuery) ||
        record.id.toLowerCase().includes(lowerQuery) ||
        record.vaccineType.toLowerCase().includes(lowerQuery)
    );
  } catch (error) {
    throw new Error("Could not fetch records.");
  }
}