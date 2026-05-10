// src/actions/bhw/dashboard-actions.ts
import { DASHBOARD_STATS, RECENT_RECORDS } from "@/lib/dummy-data";

export const getBHWDashboardOverview = async () => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  // BACKEND INTEGRATION POINT: GET DASHBOARD OVERVIEW
  // Uncomment or change the logic below to integrate with backend API.
  /*
     const response = await fetch('/api/dashboard/bhw-overview');
     if (!response.ok) throw new Error("Failed to fetch BHW data");
     const data = await response.json();
     return {
       stats: data.stats,
       records: data.recentRecords
     };
    */

  // SIMULATED DATA (CURRENT)
  return {
    stats: DASHBOARD_STATS,
    records: RECENT_RECORDS,
  };
};