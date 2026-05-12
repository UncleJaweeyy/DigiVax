// @/actions/records/scan-actions.ts

"use server";

import { MOCK_EXTRACTED_TEXT } from "@/lib/records/mock-data";

export type ScanStatus = "idle" | "processing" | "done" | "error";

export interface ScanResult {
  success: boolean;
  text?: string;
  confidence?: number;
  fields?: Record<string, string>;
  error?: string;
}

interface OcrApiResponse {
  text?: string;
  extractedText?: string;
  confidence?: number;
  fields?: Record<string, string>;
  error?: string;
  message?: string;
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
    const headers = ocrApiKey ? { Authorization: `Bearer ${ocrApiKey}` } : undefined;
    const response = await fetch(ocrApiUrl, {
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
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred.",
    };
  }
}
