import { NextRequest } from "next/server";

import { adminDb } from "@/lib/firebase/admin";
import { assertAdmin } from "@/lib/firebase/admin-access";
import { writeAuditLog } from "@/lib/firebase/audit-log";
import { mapSecureRecordDocument } from "@/lib/firebase/secure-records";

const recordsCollection = "vaccinationRecords";

export async function GET(request: NextRequest) {
  try {
    if (process.env.DIGIVAX_ENABLE_DEV_DECRYPT_VIEW !== "true") {
      return errorResponse("Developer decrypt view is disabled.", 404);
    }

    const uid = await assertAdmin(getBearerToken(request));
    const snapshot = await adminDb
      .collection(recordsCollection)
      .orderBy("createdAt", "desc")
      .get();

    const records = snapshot.docs.map((doc) => {
      const raw = doc.data();
      const decrypted = mapSecureRecordDocument(doc.id, raw);

      return {
        id: doc.id,
        firestore: {
          createdBy: getString(raw.createdBy),
          createdByName: getString(raw.createdByName),
          createdAt: toIsoString(raw.createdAt),
          updatedAt: toIsoString(raw.updatedAt),
          status: getString(raw.status),
          piiProtected: raw.piiProtected === true,
          encryptionVersion: typeof raw.encryptionVersion === "number" ? raw.encryptionVersion : null,
          encryptedRecord: summarizeEncryptedRecord(raw.encryptedRecord),
        },
        decrypted,
      };
    });

    await writeAuditLog({
      userId: uid,
      user: "Admin",
      action: "Developer Decrypt View Opened",
      target: `${records.length} record${records.length === 1 ? "" : "s"}`,
      status: "warning",
    });

    return Response.json({ records });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to load decrypted records.", 403);
  }
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  return scheme.toLowerCase() === "bearer" ? token : "";
}

function summarizeEncryptedRecord(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const encrypted = value as Record<string, unknown>;
  const ciphertext = typeof encrypted.ciphertext === "string" ? encrypted.ciphertext : "";

  return {
    alg: getString(encrypted.alg),
    kid: getString(encrypted.kid),
    encryptedAt: getString(encrypted.encryptedAt),
    ciphertextBytesApprox: ciphertext ? Math.ceil(ciphertext.length * 0.75) : 0,
  };
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function toIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  return "";
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
