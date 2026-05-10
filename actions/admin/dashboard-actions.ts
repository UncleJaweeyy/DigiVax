// src/actions/admin/dashboard-actions.ts
"use server";

import { ADMIN_STATS as MOCK_STATS, MOCK_LOGS } from "@/lib/dummy-data";
import { SystemLog } from "@/app/types/log";

//Fetch Admin Dashboard Overview (Stats and Logs)
 
export const getAdminDashboardOverview = async () => {
  await new Promise((resolve) => setTimeout(resolve, 800));

  try {
    // Map the Logs to GENERIC keys for the Reusable Table
    const summaryLogs = MOCK_LOGS.slice(0, 5).map((log: SystemLog) => ({
      id: log.id,
      primary: log.user,       
      secondary: log.action,   
      status: log.status,     
      time: log.timestamp,     
    }));

  //  BACKEND INTEGRATION POINT: GET DASHBOARD DATA
  //  Uncomment or Change this if necessary to match backend API response structure
    /*
     const response = await fetch('/api/admin/dashboard-stats');
     if (!response.ok) throw new Error("Failed to fetch admin data");
     const data = await response.json();
     return {
       stats: data.stats,
       logs: data.auditLogs
     };
   */

  return {
      stats: MOCK_STATS,
      logs: summaryLogs,
    };
  } catch (error) {
    console.error("Dashboard Fetch Error:", error);
    throw new Error("Failed to load dashboard summary");
  }
};

// Trigger System Maintenance Actions

export const triggerMaintenanceAction = async (actionType: string) => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    
    // BACKEND INTEGRATION POINT: POST MAINTENANCE
    // Uncomment or Change this if necessary to match backend API response structure
    /*  
       const response = await fetch(`/api/admin/maintenance/${actionType}`, { 
         method: 'POST',
         headers: { 'Content-Type': 'application/json' }
       });
       if (!response.ok) throw new Error("Action failed");
       return await response.json();
    */

    console.log(`Simulated maintenance success: ${actionType}`);
    return { success: true };
};