import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import type {
  NewVaccinationRecordInput,
  VaccinationRecord,
} from "@/app/types/records";
import { auth, db } from "@/lib/firebase/client";
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
    sourceStoragePath: "",
    searchKeywords: parsed.searchKeywords,
    createdBy: user.uid,
    createdByName: profile.name || profile.email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function getVaccinationRecords(queryText = ""): Promise<VaccinationRecord[]> {
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

function mapRecord(id: string, data: Record<string, unknown>): VaccinationRecord {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;

  return {
    id,
    patientName: getString(data.patientName, "Unknown Patient"),
    vaccineType: getString(data.vaccineType, "Unspecified Vaccine"),
    timestamp: getString(data.vaccinationDate) || formatTimestamp(createdAt),
    status: data.status === "Completed" ? "Completed" : "Pending Review",
  };
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatTimestamp(date: Date | null) {
  if (!date) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
