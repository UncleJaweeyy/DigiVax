"use server";

import type { DashboardStat } from "@/app/types/dashboard";
import { formatAppDateTime } from "@/lib/date-format";
import { adminDb } from "@/lib/firebase/admin";
import { assertAdmin } from "@/lib/firebase/admin-access";
import { mapAuditLog } from "@/lib/firebase/audit-log";

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

export const getAdminDashboardOverview = async (
  idToken: string,
): Promise<{ stats: DashboardStat[]; logs: AdminSummaryLog[] }> => {
  await assertAdmin(idToken);

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

export const triggerMaintenanceAction = async (idToken: string, actionType: string) => {
  await assertAdmin(idToken);

  console.log(`Maintenance action requested: ${actionType}`);
  return { success: true };
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

function toDate(value: unknown) {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }

  return null;
}
