import { NextRequest } from "next/server";

import { adminAuth, adminDb, adminStorage } from "@/lib/firebase/admin";

const recordsCollection = "vaccinationRecords";
const usersCollection = "users";

export async function GET(request: NextRequest) {
  try {
    await assertActiveStaff(request);

    const recordId = request.nextUrl.searchParams.get("recordId");

    if (!recordId) {
      return errorResponse("Missing record ID.", 400);
    }

    const recordSnapshot = await adminDb.collection(recordsCollection).doc(recordId).get();

    if (!recordSnapshot.exists) {
      return errorResponse("Record not found.", 404);
    }

    const record = recordSnapshot.data();
    const storagePath = typeof record?.sourceStoragePath === "string" ? record.sourceStoragePath : "";

    if (!storagePath) {
      return errorResponse("This record does not have an uploaded source file.", 404);
    }

    const file = adminStorage.bucket().file(storagePath);
    const [exists] = await file.exists();

    if (!exists) {
      return errorResponse("Source file was not found in Firebase Storage.", 404);
    }

    const [[metadata], [buffer]] = await Promise.all([file.getMetadata(), file.download()]);
    const contentType = metadata.contentType || "application/octet-stream";
    const fileName = sanitizeFileName(
      typeof record?.sourceFileName === "string" && record.sourceFileName
        ? record.sourceFileName
        : storagePath.split("/").pop() || "source-file",
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("Source file proxy error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unable to open source file.", 403);
  }
}

async function assertActiveStaff(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    throw new Error("Please sign in again before opening this file.");
  }

  const decodedToken = await adminAuth.verifyIdToken(token);
  const profileSnapshot = await adminDb.collection(usersCollection).doc(decodedToken.uid).get();

  if (!profileSnapshot.exists) {
    throw new Error("Your account does not have a DigiVax profile.");
  }

  const profile = profileSnapshot.data();
  const role = String(profile?.role || "").toLowerCase();
  const status = String(profile?.status || "").toLowerCase();

  if (status !== "active" || !["admin", "bhw"].includes(role)) {
    throw new Error("Your account is not allowed to open source files.");
  }

  return decodedToken.uid;
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
