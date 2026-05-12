import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

import type {
  NewVaccinationRecordInput,
  VaccinationRecord,
  VaccinationRecordDocument,
  VaccinationRecordStatus,
} from "@/types/records";
import { formatAppDateTime } from "@/lib/utils/date-format";
import { auth, db } from "@/lib/firebase/client";
import { writeClientAuditLog } from "@/lib/firebase/audit-client";
import { getUserProfile } from "@/lib/firebase/users";
import { parseVaccinationText } from "@/lib/records/parser";

const recordsCollection = "vaccinationRecords";

export async function createVaccinationRecord(input: NewVaccinationRecordInput) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("You must be signed in to save a record.");
  }

  const profile = await getUserProfile(user.uid);

  if (!profile || profile.status !== "Active") {
    throw new Error("Your account is not allowed to save records.");
  }

  const correctedText = input.correctedText?.trim() || input.rawText.trim();
  const parsed = parseVaccinationText(correctedText);

  // Store both display fields and normalized/searchable fields for fast list rendering.
  const docRef = await addDoc(collection(db, recordsCollection), {
    patientName: parsed.patientName,
    patientNameLower: parsed.patientName.toLowerCase(),
    vaccineType: parsed.vaccineType,
    vaccineTypeLower: parsed.vaccineType.toLowerCase(),
    vaccinationDate: parsed.vaccinationDate,
    recordYear: parsed.recordYear,
    rawText: input.rawText,
    correctedText,
    status: "Pending Review",
    sourceFileName: input.sourceFileName || "",
    sourceFileType: input.sourceFileType || "",
    sourceStoragePath: input.sourceStoragePath || "",
    searchKeywords: parsed.searchKeywords,
    createdBy: user.uid,
    createdByName: profile.name || profile.email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await writeClientAuditLog({
    action: "Digitalized Record",
    target: parsed.patientName,
    targetId: docRef.id,
    status: "success",
  });

  return docRef.id;
}

export async function getVaccinationRecords(queryText = ""): Promise<VaccinationRecord[]> {
  // Keep the initial read bounded; full exports are handled by admin server actions.
  const recordsQuery = query(
    collection(db, recordsCollection),
    orderBy("createdAt", "desc"),
    limit(100),
  );

  const snapshot = await getDocs(recordsQuery);
  const records = snapshot.docs.map((doc) => mapRecord(doc.id, doc.data()));
  const normalizedQuery = queryText.trim().toLowerCase();

  if (!normalizedQuery) {
    return records;
  }

  return records.filter((record) => {
    const haystack = [
      record.id,
      record.patientName,
      record.vaccineType,
      record.timestamp,
      record.status || "",
    ].join(" ").toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export async function getVaccinationRecord(recordId: string): Promise<VaccinationRecordDocument> {
  const snapshot = await getDoc(doc(db, recordsCollection, recordId));

  if (!snapshot.exists()) {
    throw new Error("Record not found.");
  }

  return mapRecordDocument(snapshot.id, snapshot.data());
}

export async function updateVaccinationRecord(
  recordId: string,
  updates: {
    correctedText: string;
    status?: VaccinationRecordStatus;
  },
) {
  const correctedText = updates.correctedText.trim();

  if (!correctedText) {
    throw new Error("Corrected text cannot be empty.");
  }

  const parsed = parseVaccinationText(correctedText);

  // Re-parse edited OCR text so corrected values immediately update search and dashboards.
  await updateDoc(doc(db, recordsCollection, recordId), {
    patientName: parsed.patientName,
    patientNameLower: parsed.patientName.toLowerCase(),
    vaccineType: parsed.vaccineType,
    vaccineTypeLower: parsed.vaccineType.toLowerCase(),
    vaccinationDate: parsed.vaccinationDate,
    recordYear: parsed.recordYear,
    correctedText,
    status: updates.status || "Pending Review",
    searchKeywords: parsed.searchKeywords,
    updatedAt: serverTimestamp(),
  });

  await writeClientAuditLog({
    action: updates.status === "Completed" ? "Review Completed" : "Record Updated",
    target: parsed.patientName,
    targetId: recordId,
    status: updates.status === "Completed" ? "success" : "warning",
  });
}

function mapRecord(id: string, data: Record<string, unknown>): VaccinationRecord {
  const document = mapRecordDocument(id, data);

  return {
    id: document.id,
    patientName: document.patientName,
    vaccineType: document.vaccineType,
    timestamp: formatTimestamp(document.createdAt || null),
    status: document.status,
  };
}

function mapRecordDocument(id: string, data: Record<string, unknown>): VaccinationRecordDocument {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
  const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null;
  const status = data.status === "Completed" ? "Completed" : "Pending Review";

  // Firestore documents may be partially backfilled, so mapping provides UI-safe defaults.
  return {
    id,
    patientName: getString(data.patientName, "Unknown Patient"),
    patientNameLower: getString(data.patientNameLower),
    vaccineType: getString(data.vaccineType, "Unspecified Vaccine"),
    vaccineTypeLower: getString(data.vaccineTypeLower),
    vaccinationDate: getString(data.vaccinationDate),
    recordYear: getString(data.recordYear),
    rawText: getString(data.rawText),
    correctedText: getString(data.correctedText),
    status,
    sourceFileName: getString(data.sourceFileName),
    sourceFileType: getString(data.sourceFileType),
    sourceStoragePath: getString(data.sourceStoragePath),
    searchKeywords: Array.isArray(data.searchKeywords)
      ? data.searchKeywords.filter((value): value is string => typeof value === "string")
      : [],
    createdBy: getString(data.createdBy),
    createdByName: getString(data.createdByName),
    createdAt: createdAt || undefined,
    updatedAt: updatedAt || undefined,
  };
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatTimestamp(date: Date | null) {
  if (!date) {
    return "No date";
  }

  return formatAppDateTime(date);
}
