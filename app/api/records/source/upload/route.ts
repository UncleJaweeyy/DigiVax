import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

import { adminStorage } from "@/lib/firebase/admin";
import { assertActiveStaffProfile } from "@/lib/firebase/admin-access";
import { encryptBytes } from "@/lib/security/record-crypto";

const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
const maxUploadBytes = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const staff = await assertActiveStaffProfile(getBearerToken(request));
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return errorResponse("No file provided.", 400);
    }

    if (!allowedTypes.includes(file.type)) {
      return errorResponse("Unsupported file format. Please use JPG, PNG, or PDF.", 400);
    }

    if (file.size > maxUploadBytes) {
      return errorResponse("File is too large. Please upload a file up to 10MB.", 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const encrypted = encryptBytes(buffer);
    const extension = getSafeExtension(file.name, file.type);
    const storagePath = `vaccination-records/${staff.uid}/${randomUUID()}${extension}.enc`;
    const storageFile = adminStorage.bucket().file(storagePath);

    await storageFile.save(encrypted.ciphertext, {
      contentType: "application/octet-stream",
      metadata: {
        metadata: {
          ...encrypted.metadata,
          uploadedBy: staff.uid,
          originalContentType: file.type,
          originalSize: String(file.size),
          encryptedSize: String(encrypted.ciphertext.length),
        },
      },
      resumable: false,
    });

    return Response.json({
      storagePath,
      fileName: file.name,
      contentType: file.type,
      originalSize: file.size,
      storedSize: encrypted.ciphertext.length,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to upload source file.", 400);
  }
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  return scheme.toLowerCase() === "bearer" ? token : "";
}

function getSafeExtension(fileName: string, contentType: string) {
  const fromName = fileName.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();

  if (fromName && [".jpg", ".jpeg", ".png", ".pdf"].includes(fromName)) {
    return fromName;
  }

  if (contentType === "application/pdf") return ".pdf";
  if (contentType === "image/png") return ".png";
  return ".jpg";
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
