import type {
  NewVaccinationRecordInput,
  VaccinationRecord,
  VaccinationRecordDocument,
  VaccinationRecordStatus,
} from "@/types/records";
import type { ClinicRecordDraft } from "@/types/clinic-record";
import { auth } from "@/lib/firebase/client";

export async function createVaccinationRecord(input: NewVaccinationRecordInput) {
  const payload = await recordsRequest<{ recordId: string }>({
    method: "POST",
    body: input,
  });

  return payload.recordId;
}

export async function getVaccinationRecords(queryText = ""): Promise<VaccinationRecord[]> {
  const params = new URLSearchParams({ mode: "list" });

  if (queryText.trim()) {
    params.set("query", queryText.trim());
  }

  const payload = await recordsRequest<{ records?: VaccinationRecord[] }>({
    method: "GET",
    search: params,
  });

  return payload.records || [];
}

export async function getAllVaccinationRecordDocuments(): Promise<VaccinationRecordDocument[]> {
  const payload = await recordsRequest<{ records?: VaccinationRecordDocument[] }>({
    method: "GET",
    search: new URLSearchParams({ mode: "all" }),
  });

  return normalizeRecordDates(payload.records || []);
}

export async function getVaccinationRecord(recordId: string): Promise<VaccinationRecordDocument> {
  const payload = await recordsRequest<{ record?: VaccinationRecordDocument }>({
    method: "GET",
    search: new URLSearchParams({ mode: "detail", recordId }),
  });

  if (!payload.record) {
    throw new Error("Record not found.");
  }

  return normalizeRecordDate(payload.record);
}

export async function updateVaccinationRecord(
  recordId: string,
  updates: {
    correctedText: string;
    clinicRecord?: ClinicRecordDraft;
    status?: VaccinationRecordStatus;
  },
) {
  await recordsRequest<{ success: boolean }>({
    method: "PATCH",
    body: {
      recordId,
      ...updates,
    },
  });
}

async function recordsRequest<T>({
  method,
  body,
  search,
}: {
  method: "GET" | "POST" | "PATCH";
  body?: unknown;
  search?: URLSearchParams;
}): Promise<T> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in again before working with records.");
  }

  const token = await user.getIdToken();
  const response = await fetch(`/api/records${search ? `?${search}` : ""}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const payload = await response.json().catch(() => ({})) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Record request failed.");
  }

  return payload;
}

function normalizeRecordDates(records: VaccinationRecordDocument[]) {
  return records.map(normalizeRecordDate);
}

function normalizeRecordDate(record: VaccinationRecordDocument) {
  return {
    ...record,
    createdAt: record.createdAt ? new Date(record.createdAt) : undefined,
    updatedAt: record.updatedAt ? new Date(record.updatedAt) : undefined,
  };
}
