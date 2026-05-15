"use server";

import type { DashboardStat } from "@/types/dashboard";
import type { VaccinationRecord } from "@/types/records";
import { adminDb } from "@/lib/firebase/admin";
import { assertActiveStaff } from "@/lib/firebase/admin-access";
import { mapSecureRecordDocument } from "@/lib/firebase/secure-records";
import { formatAppDateTime } from "@/lib/utils/date-format";

const recordsCollection = "vaccinationRecords";

export const getBHWDashboardOverview = async (
  idToken: string,
): Promise<{ stats: DashboardStat[]; records: VaccinationRecord[] }> => {
  await assertActiveStaff(idToken);

  const snapshot = await adminDb
    .collection(recordsCollection)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const records = snapshot.docs.map((doc) => {
    const data = mapSecureRecordDocument(doc.id, doc.data());

    return {
      id: doc.id,
      patientName: data.patientName,
      vaccineType: data.vaccineType,
      timestamp: formatDateTime(data.createdAt),
      status: data.status,
    } satisfies VaccinationRecord;
  });

  const uniquePatients = new Set(
    snapshot.docs
      .map((doc) => mapSecureRecordDocument(doc.id, doc.data()))
      .map((data) => data.patientNameLower || data.patientName.toLowerCase())
      .filter(Boolean),
  );
  const pendingCount = records.filter((record) => record.status === "Pending Review").length;

  return {
    stats: [
      {
        label: "Digitized Records",
        value: String(records.length),
        type: "total",
        description: "Latest 100 saved records",
      },
      {
        label: "Total Patients",
        value: String(uniquePatients.size),
        type: "patients",
        description: "Unique names in records",
      },
      {
        label: "Awaiting Review",
        value: String(pendingCount),
        type: "pending",
        description: "Pending OCR review",
      },
    ],
    records: records.slice(0, 5),
  };
};

function formatDateTime(value: unknown) {
  const date = toDate(value);

  if (!date) {
    return "No date";
  }

  return formatAppDateTime(date);
}

function toDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }

  return null;
}
