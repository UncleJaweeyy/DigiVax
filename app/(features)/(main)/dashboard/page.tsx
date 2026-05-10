"use client";

import React, { useState, useEffect } from "react";
import { Users, FileCheck, AlertCircle, Loader2 } from "lucide-react";
// 1. IMPORT reusable components
import { StatCard } from "@/components/dashboard/StatCard";
import { ActivityTable } from "@/components/dashboard/RecentTable"; 
// 2. IMPORT action logic
import { getBHWDashboardOverview } from "@/actions/bhw/dashboard-actions";
import type { DashboardStat } from "@/app/types/dashboard";
import type { VaccinationRecord } from "@/app/types/records";
import { auth } from "@/lib/firebase/client";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [records, setRecords] = useState<VaccinationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        const idToken = await getIdToken();
        const data = await getBHWDashboardOverview(idToken);
        setStats(data.stats);
        setRecords(data.records);
      } catch (error) {
        console.error("Dashboard Fetch Error:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  // Helper to map dummy data types to Lucide Icons and Colors
  const getStatConfig = (type: string) => {
    switch (type) {
      case "total": return { icon: FileCheck, color: "text-blue-600", bg: "bg-blue-50" };
      case "patients": return { icon: Users, color: "text-purple-600", bg: "bg-purple-50" };
      case "pending": return { icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-50" };
      default: return { icon: FileCheck, color: "text-slate-600", bg: "bg-slate-50" };
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="!text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">
          Synchronizing Records...
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen flex flex-col gap-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-4xl font-bold !text-slate-900 tracking-tight">Dashboard</h1>
        <p className="!text-slate-500 mt-1 italic">Vaccination Record Management Overview</p>
      </header>

      {/* 3. USING THE REUSABLE STATCARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, index) => {
          const config = getStatConfig(stat.type);
          return (
            <StatCard
              key={index}
              label={stat.label}
              value={stat.value}
              icon={config.icon}
              color={config.color}
              bg={config.bg}
              description={stat.description} // Optional: BHW might want to see trend info
            />
          );
        })}
      </div>

      {/* 4. USING THE REUSABLE ACTIVITYTABLE */}
      <ActivityTable 
        title="Recently Scanned Records"
        data={records}
        viewAllLink="/search"
        isAdmin={false} 
      />
    </div>
  );
}

async function getIdToken() {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Please sign in again.");
  }

  return currentUser.getIdToken();
}
