import "server-only";

import { FieldValue, type DocumentData } from "firebase-admin/firestore";

import type { LogStatus, SystemLog } from "@/types/log";
import { formatAppDateTime } from "@/lib/utils/date-format";
import { adminDb } from "@/lib/firebase/admin";

export interface AuditLogInput {
  userId: string;
  user: string;
  action: string;
  target: string;
  status: LogStatus;
  targetId?: string;
}

const auditLogsCollection = "auditLogs";

export async function writeAuditLog(input: AuditLogInput) {
  await adminDb.collection(auditLogsCollection).add({
    userId: input.userId,
    user: input.user,
    action: input.action,
    target: input.target,
    targetId: input.targetId || "",
    status: input.status,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export function mapAuditLog(id: string, data: DocumentData): SystemLog {
  return {
    id,
    user: getString(data.user, "System"),
    action: getString(data.action, "System Event"),
    target: getString(data.target, "DigiVax"),
    timestamp: formatDateTime(data.createdAt),
    status: isLogStatus(data.status) ? data.status : "success",
  };
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function isLogStatus(value: unknown): value is LogStatus {
  return value === "success" || value === "warning" || value === "error";
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
