import { NextRequest } from "next/server";

import { adminStorage } from "@/lib/firebase/admin";
import { assertActiveStaffProfile } from "@/lib/firebase/admin-access";
import { writeAuditLog } from "@/lib/firebase/audit-log";
import { getSecureVaccinationRecord } from "@/lib/firebase/secure-records";
import { decryptBytes } from "@/lib/security/record-crypto";

export async function GET(request: NextRequest) {
  try {
    const staff = await assertActiveStaffProfile(getBearerToken(request));

    const recordId = request.nextUrl.searchParams.get("recordId");

    if (!recordId) {
      return errorResponse("Missing record ID.", 400);
    }

    const record = await getSecureVaccinationRecord(recordId);
    const storagePath = record.sourceStoragePath || "";

    if (!storagePath) {
      return errorResponse("This record does not have an uploaded source file.", 404);
    }

    const file = adminStorage.bucket().file(storagePath);
    const [exists] = await file.exists();

    if (!exists) {
      return errorResponse("Source file was not found in Firebase Storage.", 404);
    }

    const [[metadata], [buffer]] = await Promise.all([file.getMetadata(), file.download()]);
    const customMetadata = normalizeMetadata(metadata.metadata);
    const decryptedBuffer = decryptBytes(buffer, customMetadata);
    const contentType = String(customMetadata.originalContentType || record.sourceFileType || metadata.contentType || "application/octet-stream");
    const fileName = sanitizeFileName(
      record.sourceFileName
        ? record.sourceFileName
        : storagePath.split("/").pop() || "source-file",
    );

    await writeAuditLog({
      userId: staff.uid,
      user: staff.name,
      action: "Source File Viewed",
      target: `Record ${recordId}`,
      targetId: recordId,
      status: "success",
    });

    return new Response(new Uint8Array(decryptedBuffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("Source file proxy error");
    return errorResponse(error instanceof Error ? error.message : "Unable to open source file.", 403);
  }
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  return scheme.toLowerCase() === "bearer" ? token : "";
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizeMetadata(metadata: Record<string, string | number | boolean | null> | undefined) {
  const normalized: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(metadata || {})) {
    normalized[key] = typeof value === "string" ? value : undefined;
  }

  return normalized;
}
