"use server";

import type { DashboardStat } from "@/app/types/dashboard";
import type { VaccinationRecord } from "@/app/types/records";
import { adminDb } from "@/lib/firebase/admin";
import { assertActiveStaff } from "@/lib/firebase/admin-access";

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
    const data = doc.data();

    return {
      id: doc.id,
      patientName: getString(data.patientName, "Unknown Patient"),
      vaccineType: getString(data.vaccineType, "Unspecified Vaccine"),
      timestamp: formatDateTime(data.createdAt),
      status: data.status === "Completed" ? "Completed" : "Pending Review",
    } satisfies VaccinationRecord;
  });

  const uniquePatients = new Set(
    snapshot.docs
      .map((doc) => doc.data())
      .map((data) => getString(data.patientNameLower) || getString(data.patientName).toLowerCase())
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

function getString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatDateTime(value: unknown) {
  const date = toDate(value);

  if (!date) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function toDate(value: unknown) {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }

  return null;
}
