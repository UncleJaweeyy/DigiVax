"use server";

import type { DashboardStat } from "@/types/dashboard";
import type { DocumentData } from "firebase-admin/firestore";
import { formatAppDateTime } from "@/lib/utils/date-format";
import { adminDb } from "@/lib/firebase/admin";
import { assertAdmin } from "@/lib/firebase/admin-access";
import { mapAuditLog, writeAuditLog } from "@/lib/firebase/audit-log";

interface AdminSummaryLog {
  id: string;
  primary: string;
  secondary: string;
  status: string;
  time: string;
}

const usersCollection = "users";
const recordsCollection = "vaccinationRecords";
const auditLogsCollection = "auditLogs";
const exportColumns = [
  "Record ID",
  "Patient Name",
  "Vaccine Type",
  "Vaccination Date",
  "Record Year",
  "Status",
  "Created By",
  "Created At",
  "Updated At",
  "Source File Name",
  "Source Storage Path",
  "Raw Text",
  "Corrected Text",
];
const sessionLogExportColumns = ["Log ID", "Status", "User", "Action", "Target", "Timestamp"];

export const getAdminDashboardOverview = async (
  idToken: string,
): Promise<{ stats: DashboardStat[]; logs: AdminSummaryLog[] }> => {
  await assertAdmin(idToken);

  // Load dashboard cards and recent activity together to keep the page responsive.
  const [usersSnapshot, recordsSnapshot, auditSnapshot] = await Promise.all([
    adminDb.collection(usersCollection).get(),
    adminDb.collection(recordsCollection).orderBy("createdAt", "desc").limit(100).get(),
    adminDb.collection(auditLogsCollection).orderBy("createdAt", "desc").limit(5).get(),
  ]);

  const users = usersSnapshot.docs.map((doc) => doc.data());
  const records = recordsSnapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data(),
  }));
  const pendingUsers = users.filter((user) => user.status === "Pending").length;
  const sourceFiles = records.filter(
    (record) => typeof record.data.sourceStoragePath === "string" && record.data.sourceStoragePath,
  ).length;

  return {
    stats: [
      {
        label: "Total Staff",
        value: String(users.length),
        type: "staff",
        desc: "Firestore staff profiles",
      },
      {
        label: "Pending Access",
        value: String(pendingUsers),
        type: "access",
        desc: "Waiting activation",
      },
      {
        label: "Source Files",
        value: String(sourceFiles),
        type: "storage",
        desc: "Uploaded scan files",
      },
    ],
    // Older deployments may not have auditLogs yet, so recent records act as a readable fallback.
    logs: auditSnapshot.docs.length > 0
      ? auditSnapshot.docs.map((doc) => {
          const log = mapAuditLog(doc.id, doc.data());

          return {
            id: log.id,
            primary: log.user,
            secondary: log.action,
            status: log.status,
            time: log.timestamp,
          };
        })
      : records.slice(0, 5).map((record) => ({
          id: record.id,
          primary: getString(record.data.createdByName, "Staff"),
          secondary: `Digitized ${getString(record.data.patientName, "record")}`,
          status: record.data.status === "Completed" ? "success" : "warning",
          time: formatDateTime(record.data.createdAt),
        })),
  };
};

export const exportAllRecords = async (idToken: string) => {
  const uid = await assertAdmin(idToken);

  // Admin exports intentionally read the full collection instead of the dashboard's 100-row preview.
  const [recordsSnapshot, profileSnapshot] = await Promise.all([
    adminDb.collection(recordsCollection).orderBy("createdAt", "desc").get(),
    adminDb.collection(usersCollection).doc(uid).get(),
  ]);
  const rows = recordsSnapshot.docs.map((doc) => {
    const data = doc.data();

    return [
      doc.id,
      getString(data.patientName),
      getString(data.vaccineType),
      getString(data.vaccinationDate),
      getString(data.recordYear),
      getString(data.status),
      getString(data.createdByName, "Staff"),
      formatDateTime(data.createdAt),
      formatDateTime(data.updatedAt),
      getString(data.sourceFileName),
      getString(data.sourceStoragePath),
      getString(data.rawText),
      getString(data.correctedText),
    ];
  });
  const csv = [exportColumns, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
  const rowCount = rows.length;

  await writeAuditLog({
    userId: uid,
    user: getActorName(profileSnapshot.data()),
    action: "Export All Records",
    target: `${rowCount} vaccination record${rowCount === 1 ? "" : "s"}`,
    status: "success",
  });

  return {
    csv,
    filename: `digivax-vaccination-records-${getTodayDateString()}.csv`,
    rowCount,
  };
};

export const exportSessionLogs = async (idToken: string) => {
  const uid = await assertAdmin(idToken);

  const [logsSnapshot, profileSnapshot] = await Promise.all([
    adminDb.collection(auditLogsCollection).orderBy("createdAt", "desc").get(),
    adminDb.collection(usersCollection).doc(uid).get(),
  ]);
  const rows = logsSnapshot.docs.map((doc) => {
    const log = mapAuditLog(doc.id, doc.data());

    return [log.id, log.status, log.user, log.action, log.target, log.timestamp];
  });
  const csv = [sessionLogExportColumns, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\r\n");
  const rowCount = rows.length;

  await writeAuditLog({
    userId: uid,
    user: getActorName(profileSnapshot.data()),
    action: "Export Session Logs",
    target: `${rowCount} audit log${rowCount === 1 ? "" : "s"}`,
    status: "success",
  });

  return {
    csv,
    filename: `digivax-session-logs-${getTodayDateString()}.csv`,
    rowCount,
  };
};

export const flushSessionLogs = async (idToken: string) => {
  const uid = await assertAdmin(idToken);
  const profileSnapshot = await adminDb.collection(usersCollection).doc(uid).get();
  let deletedCount = 0;

  // Firestore batch writes are capped, so logs are deleted in bounded chunks.
  while (true) {
    const snapshot = await adminDb.collection(auditLogsCollection).limit(450).get();

    if (snapshot.empty) {
      break;
    }

    const batch = adminDb.batch();

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    deletedCount += snapshot.size;

    if (snapshot.size < 450) {
      break;
    }
  }

  await writeAuditLog({
    userId: uid,
    user: getActorName(profileSnapshot.data()),
    action: "Flush Session Logs",
    target: `${deletedCount} audit log${deletedCount === 1 ? "" : "s"} removed`,
    status: "warning",
  });

  return { success: true, deletedCount };
};

function getString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatDateTime(value: unknown) {
  const date = toDate(value);

  if (!date) {
    return "No date";
  }

  return formatAppDateTime(date);
}

function getActorName(profile: DocumentData | undefined) {
  return getString(profile?.name, getString(profile?.email, "Admin"));
}

function toDate(value: unknown) {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }

  return null;
}

function escapeCsvValue(value: string) {
  const escapedValue = value.replace(/"/g, "\"\"");

  if (/[",\r\n]/.test(escapedValue)) {
    return `"${escapedValue}"`;
  }

  return escapedValue;
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
