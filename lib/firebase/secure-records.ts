import "server-only";

import type { DocumentData, Timestamp } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

import type {
  EncryptedRecordPayload,
  NewVaccinationRecordInput,
  VaccinationRecord,
  VaccinationRecordDocument,
  VaccinationRecordStatus,
} from "@/types/records";
import type { ClinicRecordDraft } from "@/types/clinic-record";
import { adminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/firebase/audit-log";
import { parseVaccinationText } from "@/lib/records/parser";
import { buildReviewedLabels } from "@/lib/records/reviewed-labels";
import { buildSemanticChunks, rankVaccinationRecords } from "@/lib/records/semantic-search";
import { encryptRecordPayload, decryptRecordPayload } from "@/lib/security/record-crypto";
import { formatAppDateTime } from "@/lib/utils/date-format";

const recordsCollection = "vaccinationRecords";

export async function createSecureVaccinationRecord(
  input: NewVaccinationRecordInput,
  user: { uid: string; name: string },
) {
  const correctedText = input.correctedText?.trim() || input.rawText.trim();
  const parsed = parseVaccinationText(correctedText);
  const reviewedLabels = buildReviewedLabels(input.clinicRecord, correctedText);
  const semanticChunks = buildSemanticChunks(input.clinicRecord, input.ocrMetadata, correctedText, reviewedLabels);
  const encryptedPayload: EncryptedRecordPayload = {
    rawText: input.rawText,
    correctedText,
    sourceFileName: input.sourceFileName || "",
    sourceFileType: input.sourceFileType || "",
    sourceStoragePath: input.sourceStoragePath || "",
    clinicRecord: input.clinicRecord || undefined,
    ocrMetadata: input.ocrMetadata,
    reviewedLabels,
    semanticChunks,
  };

  const payload: Record<string, unknown> = {
    patientName: "Protected Record",
    patientNameLower: "protected record",
    vaccineType: "Protected Vaccine",
    vaccineTypeLower: "protected vaccine",
    vaccinationDate: "",
    recordYear: parsed.recordYear,
    rawText: "Encrypted",
    correctedText: "Encrypted",
    status: "Pending Review",
    sourceFileName: "",
    sourceFileType: "",
    sourceStoragePath: "",
    clinicRecord: null,
    ocrMetadata: null,
    reviewedLabels: [],
    semanticChunks: [],
    searchKeywords: buildSafeSearchKeywords(parsed),
    piiProtected: true,
    encryptionVersion: 1,
    encryptedRecord: encryptRecordPayload(encryptedPayload),
    createdBy: user.uid,
    createdByName: user.name,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const docRef = await adminDb.collection(recordsCollection).add(payload);

  await writeAuditLog({
    userId: user.uid,
    user: user.name,
    action: "Digitalized Record",
    target: `Record ${docRef.id}`,
    targetId: docRef.id,
    status: "success",
  });

  return docRef.id;
}

export async function getSecureVaccinationRecords(queryText = ""): Promise<VaccinationRecord[]> {
  const normalizedQuery = queryText.trim();
  const snapshot = await adminDb
    .collection(recordsCollection)
    .orderBy("createdAt", "desc")
    .limit(normalizedQuery ? 500 : 100)
    .get();

  const documents = snapshot.docs.map((doc) => mapSecureRecordDocument(doc.id, doc.data()));

  if (!normalizedQuery) {
    return documents.map(mapRecordListItem);
  }

  return rankVaccinationRecords(documents, normalizedQuery)
    .slice(0, 100)
    .map((match) => ({
      ...mapRecordListItem(match.record),
      searchScore: match.score,
      matchedLabels: match.matchedLabels,
    }));
}

export async function getAllSecureVaccinationRecordDocuments() {
  const snapshot = await adminDb
    .collection(recordsCollection)
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => mapSecureRecordDocument(doc.id, doc.data()));
}

export async function getSecureVaccinationRecord(recordId: string) {
  const snapshot = await adminDb.collection(recordsCollection).doc(recordId).get();

  if (!snapshot.exists) {
    throw new Error("Record not found.");
  }

  return mapSecureRecordDocument(snapshot.id, snapshot.data() || {});
}

export async function updateSecureVaccinationRecord(
  recordId: string,
  updates: {
    correctedText: string;
    clinicRecord?: ClinicRecordDraft;
    status?: VaccinationRecordStatus;
  },
  user: { uid: string; name: string },
) {
  const correctedText = updates.correctedText.trim();

  if (!correctedText) {
    throw new Error("Corrected text cannot be empty.");
  }

  const docRef = adminDb.collection(recordsCollection).doc(recordId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new Error("Record not found.");
  }

  const current = mapSecureRecordDocument(snapshot.id, snapshot.data() || {});
  const parsed = parseVaccinationText(correctedText);
  const reviewedLabels = buildReviewedLabels(updates.clinicRecord, correctedText);
  const semanticChunks = buildSemanticChunks(updates.clinicRecord, current.ocrMetadata, correctedText, reviewedLabels);
  const encryptedPayload: EncryptedRecordPayload = {
    rawText: current.rawText,
    correctedText,
    sourceFileName: current.sourceFileName || "",
    sourceFileType: current.sourceFileType || "",
    sourceStoragePath: current.sourceStoragePath || "",
    clinicRecord: updates.clinicRecord,
    ocrMetadata: current.ocrMetadata,
    reviewedLabels,
    semanticChunks,
    semanticVector: current.semanticVector,
    semanticModel: current.semanticModel,
  };

  await docRef.update({
    patientName: "Protected Record",
    patientNameLower: "protected record",
    vaccineType: "Protected Vaccine",
    vaccineTypeLower: "protected vaccine",
    vaccinationDate: "",
    recordYear: parsed.recordYear,
    rawText: "Encrypted",
    correctedText: "Encrypted",
    clinicRecord: null,
    ocrMetadata: null,
    reviewedLabels: [],
    semanticChunks: [],
    searchKeywords: buildSafeSearchKeywords(parsed),
    status: updates.status || current.status,
    piiProtected: true,
    encryptionVersion: 1,
    encryptedRecord: encryptRecordPayload(encryptedPayload),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    userId: user.uid,
    user: user.name,
    action: updates.status === "Completed" ? "Review Completed" : "Record Updated",
    target: `Record ${recordId}`,
    targetId: recordId,
    status: updates.status === "Completed" ? "success" : "warning",
  });
}

export function mapSecureRecordDocument(id: string, data: DocumentData): VaccinationRecordDocument {
  const encrypted = decryptRecordPayload<EncryptedRecordPayload>(data.encryptedRecord);
  const fallback = encrypted || {
    rawText: getString(data.rawText),
    correctedText: getString(data.correctedText),
    sourceFileName: getString(data.sourceFileName),
    sourceFileType: getString(data.sourceFileType),
    sourceStoragePath: getString(data.sourceStoragePath),
    clinicRecord: isRecordObject(data.clinicRecord)
      ? data.clinicRecord as unknown as VaccinationRecordDocument["clinicRecord"]
      : undefined,
    ocrMetadata: isRecordObject(data.ocrMetadata)
      ? data.ocrMetadata as unknown as VaccinationRecordDocument["ocrMetadata"]
      : undefined,
    reviewedLabels: Array.isArray(data.reviewedLabels)
      ? data.reviewedLabels.filter(isRecordObject) as unknown as VaccinationRecordDocument["reviewedLabels"]
      : [],
    semanticChunks: Array.isArray(data.semanticChunks)
      ? data.semanticChunks.filter((value): value is string => typeof value === "string")
      : [],
  } satisfies EncryptedRecordPayload;
  const parsed = parseVaccinationText(fallback.correctedText || fallback.rawText || "");
  const createdAt = toDate(data.createdAt);
  const updatedAt = toDate(data.updatedAt);
  const status = data.status === "Completed" ? "Completed" : "Pending Review";

  return {
    id,
    patientName: parsed.patientName,
    patientNameLower: parsed.patientName.toLowerCase(),
    vaccineType: parsed.vaccineType,
    vaccineTypeLower: parsed.vaccineType.toLowerCase(),
    vaccinationDate: parsed.vaccinationDate,
    recordYear: parsed.recordYear || getString(data.recordYear),
    rawText: fallback.rawText || "",
    correctedText: fallback.correctedText || "",
    status,
    sourceFileName: fallback.sourceFileName || "",
    sourceFileType: fallback.sourceFileType || "",
    sourceStoragePath: fallback.sourceStoragePath || "",
    clinicRecord: fallback.clinicRecord,
    ocrMetadata: fallback.ocrMetadata,
    reviewedLabels: fallback.reviewedLabels || [],
    semanticChunks: fallback.semanticChunks || [],
    semanticVector: fallback.semanticVector || [],
    semanticModel: fallback.semanticModel || "",
    searchKeywords: Array.isArray(data.searchKeywords)
      ? data.searchKeywords.filter((value): value is string => typeof value === "string")
      : [],
    createdBy: getString(data.createdBy),
    createdByName: getString(data.createdByName),
    createdAt: createdAt || undefined,
    updatedAt: updatedAt || undefined,
  };
}

function mapRecordListItem(document: VaccinationRecordDocument): VaccinationRecord {
  return {
    id: document.id,
    patientName: document.patientName,
    vaccineType: document.vaccineType,
    timestamp: formatTimestamp(document.createdAt || null),
    status: document.status,
  };
}

function buildSafeSearchKeywords(parsed: ReturnType<typeof parseVaccinationText>) {
  return Array.from(new Set([
    parsed.recordYear,
    parsed.vaccineType === "Unspecified Vaccine" ? "" : parsed.vaccineType.toLowerCase(),
  ].filter(Boolean))).slice(0, 50);
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toDate(value: unknown) {
  if (value && typeof (value as Timestamp).toDate === "function") {
    return (value as Timestamp).toDate();
  }

  return null;
}

function formatTimestamp(date: Date | null) {
  if (!date) {
    return "No date";
  }

  return formatAppDateTime(date);
}
