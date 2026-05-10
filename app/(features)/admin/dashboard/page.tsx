"use client";

import React, { useState, useEffect } from "react";
import { Users, UserPlus, HardDrive, ShieldCheck, Loader2 } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActivityTable } from "@/components/dashboard/RecentTable";
import { getAdminDashboardOverview, triggerMaintenanceAction } from "@/actions/admin/dashboard-actions";

export default function AdminDashboard() {
  const [stats, setStats] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAdminData = async () => {
      setIsLoading(true);
      try {
        const data = await getAdminDashboardOverview();
        setStats(data.stats);
        setLogs(data.logs);
      } catch (error) {
        console.error("Dashboard Fetch Error:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAdminData();
  }, []);

  const getStatConfig = (type: string) => {
    switch (type) {
      case "staff": return { icon: Users, color: "text-blue-600", bg: "bg-blue-50" };
      case "access": return { icon: UserPlus, color: "text-orange-600", bg: "bg-orange-50" };
      case "storage": return { icon: HardDrive, color: "text-purple-600", bg: "bg-purple-50" };
      default: return { icon: ShieldCheck, color: "text-slate-600", bg: "bg-slate-50" };
    }
  };

  const handleAction = async (actionType: string) => {
    try {
      await triggerMaintenanceAction(actionType);
      alert(`${actionType} initiated successfully.`);
    } catch (error) {
      alert("Action failed.");
    }
  };

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
      <Loader2 className="animate-spin text-blue-600" size={40} />
      <p className="text-slate-400 font-bold italic">Syncing Admin Records...</p>
    </div>
  );

  return (
    <div className="p-8 bg-slate-50 min-h-screen flex flex-col gap-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Admin Dashboard</h1>
        <p className="text-slate-500 mt-1 italic font-medium">Infrastructure & User Access Management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => {
          const config = getStatConfig(stat.type);
          return (
            <StatCard 
              key={i} 
              label={stat.label} 
              value={stat.value} 
              description={stat.desc}
              icon={config.icon}
              color={config.color}
              bg={config.bg}
            />
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 min-w-0">
          <ActivityTable title="System Audit Logs" data={logs} viewAllLink="/admin/logs" isAdmin={true} />
        </div>

        <div className="lg:w-80 bg-white p-8 rounded-3xl shadow-sm border border-slate-100 h-fit">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <ShieldCheck size={20} className="text-blue-600" /> Maintenance
          </h3>
          <div className="space-y-4">
            <button onClick={() => handleAction('export')} className="w-full text-left p-4 rounded-2xl bg-slate-50 hover:bg-blue-600 transition-all group">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 group-hover:text-blue-100">Database</p>
              <p className="font-bold text-slate-900 group-hover:text-white">Export All Records</p>
            </button>
            <button onClick={() => handleAction('flush')} className="w-full text-left p-4 rounded-2xl bg-slate-50 hover:bg-blue-600 transition-all group">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 group-hover:text-blue-100">Security</p>
              <p className="font-bold text-slate-900 group-hover:text-white">Flush Session Logs</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}