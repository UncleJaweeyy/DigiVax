import { NextRequest } from "next/server";
import type { DocumentData } from "firebase-admin/firestore";

import type { LogStatus } from "@/types/log";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/firebase/audit-log";

const usersCollection = "users";

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);

    if (!token) {
      return errorResponse("Please sign in again before writing audit logs.", 401);
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const profileSnapshot = await adminDb.collection(usersCollection).doc(decodedToken.uid).get();

    if (!profileSnapshot.exists) {
      return errorResponse("Your account does not have a DigiVax profile.", 403);
    }

    const profile = profileSnapshot.data();
    const status = String(profile?.status || "");

    if (status !== "Active") {
      return errorResponse("Your account is not allowed to write audit logs.", 403);
    }

    const body = await request.json() as {
      action?: string;
      target?: string;
      status?: LogStatus;
      targetId?: string;
    };

    if (!body.action || !body.target || !isLogStatus(body.status)) {
      return errorResponse("Invalid audit log payload.", 400);
    }

    await writeAuditLog({
      userId: decodedToken.uid,
      user: getActorName(profile),
      action: body.action,
      target: body.target,
      targetId: body.targetId,
      status: body.status,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Audit log write failed:", error);
    return errorResponse("Failed to write audit log.", 500);
  }
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  return scheme.toLowerCase() === "bearer" ? token : "";
}

function getActorName(profile: DocumentData | undefined) {
  return String(profile?.name || profile?.email || "Staff");
}

function isLogStatus(value: unknown): value is LogStatus {
  return value === "success" || value === "warning" || value === "error";
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
