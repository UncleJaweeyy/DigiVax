// @/actions/records/scan-actions.ts

"use server";

import { MOCK_EXTRACTED_TEXT } from "@/lib/dummy-data";

export type ScanStatus = "idle" | "processing" | "done" | "error";

export interface ScanResult {
  success: boolean;
  text?: string;
  error?: string;
}

const USE_MOCK = true;

/**
 * Main OCR processing function
 */
export async function processScan(formData: FormData): Promise<ScanResult> {
  try {
    const file = formData.get("file") as File;
    
    if (!file) return { success: false, error: "No file provided." };

    // SERVER-SIDE VALIDATION: Enforce file types for security
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: "Unsupported file format. Please use JPG or PNG." };
    }

    if (USE_MOCK) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return { success: true, text: MOCK_EXTRACTED_TEXT };
    }

    // REAL BACKEND INTEGRATION
    /*
    const response = await fetch("YOUR_OCR_API_ENDPOINT", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    return { success: true, text: data.text };
    */

    return { success: false, error: "Backend not configured." };
  } catch (error: any) {
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}

/**
 * Saves the finalized text to the database
 */
export async function saveDigitalRecord(text: string) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("Saving to DB:", text);
    return { success: true };
  } catch (error) {
    return { success: false, error: "Database save failed." };
  }
}