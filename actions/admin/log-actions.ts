"use server";

import { MOCK_LOGS } from "@/lib/dummy-data";
import { SystemLog } from "@/app/types/log";

export async function getSystemLogs(query: string): Promise<SystemLog[]> {
  // Simulate network delay for backend-readiness
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    // If no query, return the full list from dummy-data.ts
    if (!query) return MOCK_LOGS;

    const lowerQuery = query.toLowerCase();
    
    // Filter logic structured for future Database migration
    return MOCK_LOGS.filter((log) => 
      log.user.toLowerCase().includes(lowerQuery) || 
      log.action.toLowerCase().includes(lowerQuery) ||
      log.target.toLowerCase().includes(lowerQuery)
    );
  } catch (error) {
    console.error("Log Fetch Error:", error);
    throw new Error("Failed to fetch system logs.");
  }
}