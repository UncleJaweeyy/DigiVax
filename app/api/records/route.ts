import { NextRequest } from "next/server";

import type { NewVaccinationRecordInput, VaccinationRecordStatus } from "@/types/records";
import type { ClinicRecordDraft } from "@/types/clinic-record";
import { assertActiveStaffProfile } from "@/lib/firebase/admin-access";
import {
  createSecureVaccinationRecord,
  getAllSecureVaccinationRecordDocuments,
  getSecureVaccinationRecord,
  getSecureVaccinationRecords,
  updateSecureVaccinationRecord,
} from "@/lib/firebase/secure-records";

interface UpdateRecordBody {
  recordId?: string;
  correctedText?: string;
  clinicRecord?: ClinicRecordDraft;
  status?: VaccinationRecordStatus;
}

export async function GET(request: NextRequest) {
  try {
    await assertActiveStaffProfile(getBearerToken(request));

    const mode = request.nextUrl.searchParams.get("mode") || "list";
    const recordId = request.nextUrl.searchParams.get("recordId") || "";
    const query = request.nextUrl.searchParams.get("query") || "";

    if (mode === "detail") {
      if (!recordId) {
        return errorResponse("Missing record ID.", 400);
      }

      return Response.json({ record: await getSecureVaccinationRecord(recordId) });
    }

    if (mode === "all") {
      return Response.json({ records: await getAllSecureVaccinationRecordDocuments() });
    }

    return Response.json({ records: await getSecureVaccinationRecords(query) });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to load records.", 403);
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await assertActiveStaffProfile(getBearerToken(request));
    const body = await request.json().catch(() => ({})) as NewVaccinationRecordInput;
    const recordId = await createSecureVaccinationRecord(body, staff);

    return Response.json({ recordId });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to save record.", 400);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const staff = await assertActiveStaffProfile(getBearerToken(request));
    const body = await request.json().catch(() => ({})) as UpdateRecordBody;

    if (!body.recordId) {
      return errorResponse("Missing record ID.", 400);
    }

    await updateSecureVaccinationRecord(
      body.recordId,
      {
        correctedText: body.correctedText || "",
        clinicRecord: body.clinicRecord,
        status: body.status,
      },
      staff,
    );

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to update record.", 400);
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
