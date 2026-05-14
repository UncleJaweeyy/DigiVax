import { NextRequest } from "next/server";

import { adminAuth } from "@/lib/firebase/admin";

const bioBertApiUrl = process.env.BIOBERT_API_URL;
const bioBertApiKey = process.env.BIOBERT_API_KEY;

interface EmbedRequestBody {
  task?: string;
  text?: string;
  query?: string;
  records?: Array<{
    id?: string;
    text?: string;
    embedding?: unknown;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    await assertSignedIn(request);

    if (!bioBertApiUrl) {
      return errorResponse("BioBERT API is not configured.", 503);
    }

    const body = await request.json().catch(() => ({})) as EmbedRequestBody;

    if (body.task === "embed") {
      const text = typeof body.text === "string" ? body.text.trim() : "";

      if (!text) {
        return errorResponse("Text is required for BioBERT embedding.", 400);
      }

      const payload = await postBioBert("/embed", { text });
      return Response.json(payload);
    }

    if (body.task === "rank") {
      const query = typeof body.query === "string" ? body.query.trim() : "";
      const records = Array.isArray(body.records)
        ? body.records.slice(0, 200).map((record) => ({
            id: typeof record.id === "string" ? record.id : "",
            text: typeof record.text === "string" ? record.text : "",
            embedding: Array.isArray(record.embedding) ? record.embedding : undefined,
          })).filter((record) => record.id && (record.text || record.embedding))
        : [];

      if (!query) {
        return errorResponse("Query is required for BioBERT ranking.", 400);
      }

      const payload = await postBioBert("/rank", { query, records });
      return Response.json(payload);
    }

    return errorResponse("Unsupported semantic-search task.", 400);
  } catch (error) {
    console.error("BioBERT semantic-search proxy error:", error);
    return errorResponse(error instanceof Error ? error.message : "BioBERT embedding failed.", 403);
  }
}

async function postBioBert(path: "/embed" | "/rank", payload: unknown) {
  if (!bioBertApiUrl) {
    throw new Error("BioBERT API is not configured.");
  }

  const response = await fetch(withPath(bioBertApiUrl, path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bioBertApiKey ? { "X-BioBERT-API-Key": bioBertApiKey } : {}),
    },
    body: JSON.stringify(payload),
  });

  const responsePayload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = isRecord(responsePayload) && typeof responsePayload.error === "string"
      ? responsePayload.error
      : `BioBERT API failed with status ${response.status}.`;
    throw new Error(message);
  }

  return responsePayload;
}

async function assertSignedIn(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    throw new Error("Please sign in again before using BioBERT search.");
  }

  await adminAuth.verifyIdToken(token);
}

function withPath(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");

  if (normalizedBase.endsWith(path)) {
    return normalizedBase;
  }

  return `${normalizedBase}${path}`;
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  return scheme.toLowerCase() === "bearer" ? token : "";
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
