"use server";

import type { SystemLog } from "@/app/types/log";
import type { DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertAdmin } from "@/lib/firebase/admin-access";
import { mapAuditLog } from "@/lib/firebase/audit-log";

const auditLogsCollection = "auditLogs";
const recordsCollection = "vaccinationRecords";

export async function getSystemLogs(idToken: string, query: string): Promise<SystemLog[]> {
  await assertAdmin(idToken);

  const [auditSnapshot, recordSnapshot] = await Promise.all([
    adminDb
      .collection(auditLogsCollection)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get(),
    adminDb
      .collection(recordsCollection)
      .orderBy("createdAt", "desc")
      .limit(25)
      .get(),
  ]);

  const auditLogs = auditSnapshot.docs.map((doc) => mapAuditLog(doc.id, doc.data()));
  const recordLogs = recordSnapshot.docs.map((doc) => mapRecordLog(doc.id, doc.data()));
  const logs = auditLogs.length > 0 ? auditLogs : recordLogs;

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

function mapRecordLog(id: string, data: DocumentData): SystemLog {
  const patientName = getString(data.patientName, "Unknown Patient");

  return {
    id: `REC-${id}`,
    user: getString(data.createdByName, "Staff"),
    action: data.status === "Completed" ? "Review Completed" : "Digitalized Record",
    target: patientName,
    timestamp: formatDateTime(data.createdAt),
    status: data.status === "Completed" ? "success" : "warning",
  };
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
