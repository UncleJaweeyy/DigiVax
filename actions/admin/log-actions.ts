"use server";

import type { SystemLog } from "@/app/types/log";
import { adminDb } from "@/lib/firebase/admin";
import { assertAdmin } from "@/lib/firebase/admin-access";

const recordsCollection = "vaccinationRecords";

export async function getSystemLogs(idToken: string, query: string): Promise<SystemLog[]> {
  await assertAdmin(idToken);

  const snapshot = await adminDb
    .collection(recordsCollection)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const logs = snapshot.docs.map((doc) => {
    const data = doc.data();
    const patientName = getString(data.patientName, "Unknown Patient");

    return {
      id: `REC-${doc.id}`,
      user: getString(data.createdByName, "Staff"),
      action: data.status === "Completed" ? "Review Completed" : "Digitalized Record",
      target: patientName,
      timestamp: formatDateTime(data.createdAt),
      status: data.status === "Completed" ? "success" : "warning",
    } satisfies SystemLog;
  });

  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return logs;
  }

  return logs.filter((log) =>
    [log.user, log.action, log.target, log.timestamp]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

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
