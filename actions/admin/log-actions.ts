"use server";

import type { LogDateFilter, LogType, SystemLog } from "@/app/types/log";
import type { DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertAdmin } from "@/lib/firebase/admin-access";
import { mapAuditLog } from "@/lib/firebase/audit-log";

const auditLogsCollection = "auditLogs";
const recordsCollection = "vaccinationRecords";

export async function getSystemLogs(
  idToken: string,
  query: string,
  type: LogType = "All",
  dateFilter: LogDateFilter = { mode: "All Dates" },
): Promise<SystemLog[]> {
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

  const dateBounds = getDateBounds(dateFilter);
  const auditLogs = auditSnapshot.docs
    .filter((doc) => isWithinDateBounds(doc.data().createdAt, dateBounds))
    .map((doc) => mapAuditLog(doc.id, doc.data()));
  const recordLogs = recordSnapshot.docs
    .filter((doc) => isWithinDateBounds(doc.data().createdAt, dateBounds))
    .map((doc) => mapRecordLog(doc.id, doc.data()));
  const logs = auditLogs.length > 0 ? auditLogs : recordLogs;

  const filteredByType = type === "All" ? logs : logs.filter((log) => log.action === type);
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return filteredByType;
  }

  return filteredByType.filter((log) =>
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

function getDateBounds(filter: LogDateFilter) {
  const today = getTodayDateString();

  if (filter.mode === "Specific Date" && filter.date) {
    const date = clampDateString(filter.date, today);

    return {
      start: parseStartOfDate(date),
      end: parseEndOfDate(date),
    };
  }

  if (filter.mode === "Date Range" && filter.from && filter.to) {
    const from = clampDateString(filter.from, today);
    const to = clampDateString(filter.to, today);
    const startDate = from <= to ? from : to;
    const endDate = from <= to ? to : from;

    return {
      start: parseStartOfDate(startDate),
      end: parseEndOfDate(endDate),
    };
  }

  return null;
}

function isWithinDateBounds(value: unknown, bounds: { start: Date; end: Date } | null) {
  if (!bounds) {
    return true;
  }

  const date = toDate(value);

  if (!date) {
    return false;
  }

  return date >= bounds.start && date <= bounds.end;
}

function clampDateString(date: string, maxDate: string) {
  if (!isDateString(date)) {
    return maxDate;
  }

  return date > maxDate ? maxDate : date;
}

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseStartOfDate(date: string) {
  return new Date(`${date}T00:00:00.000+08:00`);
}

function parseEndOfDate(date: string) {
  return new Date(`${date}T23:59:59.999+08:00`);
}

function getTodayDateString() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}
