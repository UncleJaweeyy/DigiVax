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
import type { ClinicRecordDraft } from "@/types/clinic-record";
import { formatAppDateTime } from "@/lib/utils/date-format";
import { auth, db } from "@/lib/firebase/client";
import { writeClientAuditLog } from "@/lib/firebase/audit-client";
import { getUserProfile } from "@/lib/firebase/users";
import { parseVaccinationText } from "@/lib/records/parser";
import { getBioBertEmbedding } from "@/lib/records/biobert-client";
import {
  buildSemanticChunks,
  buildSemanticEmbeddingText,
  rankVaccinationRecordsWithBioBert,
} from "@/lib/records/semantic-search";
import { buildReviewedLabels } from "@/lib/records/reviewed-labels";

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
  const reviewedLabels = buildReviewedLabels(input.clinicRecord, correctedText);
  const semanticChunks = buildSemanticChunks(input.clinicRecord, input.ocrMetadata, correctedText, reviewedLabels);
  const semanticEmbeddingText = buildSemanticEmbeddingText(input.clinicRecord, input.ocrMetadata, correctedText, reviewedLabels);
  const bioBertEmbedding = await getBioBertEmbedding(semanticEmbeddingText);

  // Store both display fields and normalized/searchable fields for fast list rendering.
  const payload: Record<string, unknown> = {
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
    clinicRecord: input.clinicRecord || null,
    ocrMetadata: input.ocrMetadata || null,
    reviewedLabels,
    semanticChunks,
    searchKeywords: parsed.searchKeywords,
    createdBy: user.uid,
    createdByName: profile.name || profile.email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (bioBertEmbedding) {
    payload.semanticVector = bioBertEmbedding.vector;
    payload.semanticModel = bioBertEmbedding.model;
  }

  const docRef = await addDoc(collection(db, recordsCollection), payload);

  await writeClientAuditLog({
    action: "Digitalized Record",
    target: parsed.patientName,
    targetId: docRef.id,
    status: "success",
  });

  return docRef.id;
}

export async function getVaccinationRecords(queryText = ""): Promise<VaccinationRecord[]> {
  const normalizedQuery = queryText.trim();
  // Keep the initial browse bounded; semantic searches read the collection so matches are not hidden by recency.
  const recordsQuery = query(
    collection(db, recordsCollection),
    orderBy("createdAt", "desc"),
    ...(normalizedQuery ? [] : [limit(100)]),
  );

  const snapshot = await getDocs(recordsQuery);
  const documents = snapshot.docs.map((doc) => mapRecordDocument(doc.id, doc.data()));

  if (!normalizedQuery) {
    return documents.map(mapRecord);
  }

  return (await rankVaccinationRecordsWithBioBert(documents, normalizedQuery))
    .slice(0, 100)
    .map((match) => ({
      ...mapRecord(match.record),
      searchScore: match.score,
      matchedLabels: match.matchedLabels,
    }));
}

export async function getAllVaccinationRecordDocuments(): Promise<VaccinationRecordDocument[]> {
  const recordsQuery = query(
    collection(db, recordsCollection),
    orderBy("createdAt", "desc"),
  );
  const snapshot = await getDocs(recordsQuery);

  return snapshot.docs.map((doc) => mapRecordDocument(doc.id, doc.data()));
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
    clinicRecord?: ClinicRecordDraft;
    status?: VaccinationRecordStatus;
  },
) {
  const correctedText = updates.correctedText.trim();

  if (!correctedText) {
    throw new Error("Corrected text cannot be empty.");
  }

  const parsed = parseVaccinationText(correctedText);
  const reviewedLabels = buildReviewedLabels(updates.clinicRecord, correctedText);
  const semanticChunks = buildSemanticChunks(updates.clinicRecord, undefined, correctedText, reviewedLabels);
  const semanticEmbeddingText = buildSemanticEmbeddingText(updates.clinicRecord, undefined, correctedText, reviewedLabels);
  const bioBertEmbedding = await getBioBertEmbedding(semanticEmbeddingText);

  // Re-parse edited OCR text so corrected values immediately update search and dashboards.
  const payload: Record<string, unknown> = {
    patientName: parsed.patientName,
    patientNameLower: parsed.patientName.toLowerCase(),
    vaccineType: parsed.vaccineType,
    vaccineTypeLower: parsed.vaccineType.toLowerCase(),
    vaccinationDate: parsed.vaccinationDate,
    recordYear: parsed.recordYear,
    correctedText,
    status: updates.status || "Pending Review",
    reviewedLabels,
    searchKeywords: parsed.searchKeywords,
    updatedAt: serverTimestamp(),
  };

  if (updates.clinicRecord) {
    payload.clinicRecord = updates.clinicRecord;
    payload.semanticChunks = semanticChunks;
  }

  if (bioBertEmbedding) {
    payload.semanticVector = bioBertEmbedding.vector;
    payload.semanticModel = bioBertEmbedding.model;
  }

  await updateDoc(doc(db, recordsCollection, recordId), payload);

  await writeClientAuditLog({
    action: updates.status === "Completed" ? "Review Completed" : "Record Updated",
    target: parsed.patientName,
    targetId: recordId,
    status: updates.status === "Completed" ? "success" : "warning",
  });
}

function mapRecord(document: VaccinationRecordDocument): VaccinationRecord {
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
    semanticVector: Array.isArray(data.semanticVector)
      ? data.semanticVector.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      : [],
    semanticModel: getString(data.semanticModel),
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

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatTimestamp(date: Date | null) {
  if (!date) {
    return "No date";
  }

  return formatAppDateTime(date);
}
