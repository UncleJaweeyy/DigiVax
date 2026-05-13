// @/actions/records/scan-actions.ts

"use server";

import { MOCK_EXTRACTED_TEXT } from "@/lib/records/mock-data";
import type {
  ClinicRecordDraft,
  OcrExtractionMetadata,
  OcrTokenMetadata,
  OcrVisualization,
} from "@/types/clinic-record";

export type ScanStatus = "idle" | "processing" | "done" | "error";

export interface ScanResult {
  success: boolean;
  text?: string;
  confidence?: number;
  fields?: Record<string, string>;
  clinicRecord?: ClinicRecordDraft;
  ocrMetadata?: OcrExtractionMetadata;
  markdown?: string;
  visualization?: OcrVisualization;
  error?: string;
}

interface OcrApiResponse {
  text?: string;
  extractedText?: string;
  confidence?: number;
  fields?: Record<string, string>;
  clinicRecord?: ClinicRecordDraft;
  raw?: OcrRawResponse;
  markdown?: string;
  visualization?: OcrVisualization;
  error?: string;
  message?: string;
}

interface OcrRawResponse {
  recognized_text?: Array<{
    field?: string;
    value?: string;
    confidence?: number;
    bbox?: number[];
    crf_label?: string;
    row?: number;
    section?: OcrTokenMetadata["section"];
  }>;
  image_size?: number[];
  processing_time_ms?: number;
  avg_confidence?: number;
  model_info?: Record<string, unknown>;
}

const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
const useMockOcr = process.env.OCR_USE_MOCK === "true";
const ocrApiUrl = process.env.OCR_API_URL;
const ocrApiKey = process.env.OCR_API_KEY;

export async function processScan(formData: FormData): Promise<ScanResult> {
  try {
    const file = formData.get("file") as File;

    if (!file) return { success: false, error: "No file provided." };

    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: "Unsupported file format. Please use JPG, PNG, or PDF." };
    }

    if (!ocrApiUrl) {
      // Mock OCR keeps demos usable while the PaddleOCR/NLP backend is offline or not deployed.
      if (!useMockOcr) {
        return {
          success: false,
          error: "OCR API is not configured. Set OCR_API_URL or enable OCR_USE_MOCK=true for demos.",
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      return { success: true, text: MOCK_EXTRACTED_TEXT };
    }

    const requestBody = new FormData();
    requestBody.append("file", file, file.name);

    // The OCR API owns image preprocessing and model execution; this action normalizes its response.
    const headers = ocrApiKey ? { "X-OCR-API-Key": ocrApiKey } : undefined;
    const endpoint = withOcrReviewParams(ocrApiUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: requestBody,
    });

    const data = (await response.json().catch(() => ({}))) as OcrApiResponse;

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || `OCR API failed with status ${response.status}.`,
      };
    }

    const text = data.text || data.extractedText;

    if (!text) {
      return { success: false, error: "OCR API response did not include extracted text." };
    }

    return {
      success: true,
      text,
      confidence: data.confidence,
      fields: data.fields,
      clinicRecord: data.clinicRecord,
      ocrMetadata: buildOcrMetadata(data.raw),
      markdown: data.markdown,
      visualization: data.visualization,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred.",
    };
  }
}

function buildOcrMetadata(raw?: OcrRawResponse): OcrExtractionMetadata | undefined {
  const imageSize = normalizeImageSize(raw?.image_size);
  const recognizedText = Array.isArray(raw?.recognized_text) ? raw.recognized_text : [];

  const tokens: OcrTokenMetadata[] = [];

  for (const item of recognizedText) {
    const bbox = normalizeBbox(item.bbox);
    const text = typeof item.value === "string" ? item.value.trim() : "";
    if (!bbox || !text) continue;

    const [x1, y1, x2, y2] = bbox;
    const x = roundNumber((x1 + x2) / 2);
    const y = roundNumber((y1 + y2) / 2);
    const token: OcrTokenMetadata = {
      text,
      x,
      y,
      w: roundNumber(x2 - x1),
      h: roundNumber(y2 - y1),
      row: typeof item.row === "number" ? item.row : -1,
      section: normalizeTokenSection(item.section) || inferTokenSection(y, x, imageSize),
      label: getTokenLabel(item),
      bbox,
    };

    if (typeof item.confidence === "number") {
      token.confidence = roundNumber(item.confidence, 4);
    }

    tokens.push(token);
  }

  if (tokens.some((token) => token.row < 0)) {
    assignTokenRows(tokens);
  }

  if (!tokens.length && !imageSize) {
    return undefined;
  }

  return {
    imageSize: imageSize || undefined,
    processingTimeMs: typeof raw?.processing_time_ms === "number"
      ? roundNumber(raw.processing_time_ms)
      : undefined,
    averageConfidence: typeof raw?.avg_confidence === "number"
      ? roundNumber(raw.avg_confidence, 4)
      : undefined,
    modelInfo: normalizeModelInfo(raw?.model_info),
    tokens,
  };
}

function getTokenLabel(item: NonNullable<OcrRawResponse["recognized_text"]>[number]) {
  if (typeof item.crf_label === "string" && item.crf_label.trim()) {
    return item.crf_label.trim();
  }

  if (typeof item.field === "string" && item.field.trim()) {
    return item.field.trim();
  }

  return "TEXT";
}

function normalizeTokenSection(value: unknown): OcrTokenMetadata["section"] | null {
  if (
    value === "HEADER"
    || value === "PATIENT_INFORMATION"
    || value === "NUTRITIONAL_STATUS"
    || value === "TABLE_RECORDS"
    || value === "UNKNOWN"
  ) {
    return value;
  }

  return null;
}

function normalizeImageSize(value?: number[]): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const width = Number(value[0]);
  const height = Number(value[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return [Math.round(width), Math.round(height)];
}

function normalizeBbox(value?: number[]) {
  if (!Array.isArray(value) || value.length < 4) return null;
  const bbox = value.slice(0, 4).map(Number);
  if (bbox.some((item) => !Number.isFinite(item))) return null;
  return bbox.map((item) => roundNumber(item));
}

function assignTokenRows(tokens: OcrTokenMetadata[]) {
  const sorted = [...tokens].sort((a, b) => a.y - b.y || a.x - b.x);
  let currentRow = -1;
  let previousY = Number.NEGATIVE_INFINITY;

  for (const token of sorted) {
    const threshold = Math.max(24, token.h * 1.2);
    if (currentRow < 0 || token.y - previousY > threshold) {
      currentRow += 1;
    }
    token.row = currentRow;
    previousY = token.y;
  }
}

function inferTokenSection(
  y: number,
  x: number,
  imageSize: [number, number] | null,
): OcrTokenMetadata["section"] {
  if (!imageSize) return "UNKNOWN";
  const [width, height] = imageSize;
  const yNorm = y / Math.max(height, 1);
  const xNorm = x / Math.max(width, 1);

  if (yNorm < 0.15) return "HEADER";
  if (yNorm >= 0.36) return "TABLE_RECORDS";
  return xNorm < 0.5 ? "PATIENT_INFORMATION" : "NUTRITIONAL_STATUS";
}

function normalizeModelInfo(value?: Record<string, unknown>) {
  if (!value) return undefined;

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string | number | boolean] => {
      const item = entry[1];
      return ["string", "number", "boolean"].includes(typeof item);
    }),
  );
}

function roundNumber(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function withOcrReviewParams(url: string) {
  try {
    const endpoint = new URL(url);
    endpoint.searchParams.set("include_markdown", "true");
    endpoint.searchParams.set("include_visualization", "true");
    return endpoint.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}include_markdown=true&include_visualization=true`;
  }
}
