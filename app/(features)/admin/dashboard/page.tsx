"use client";

import React, { useState, useEffect } from "react";
import { Users, UserPlus, HardDrive, ShieldCheck, Loader2, AlertTriangle, Download } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActivityTable } from "@/components/dashboard/RecentTable";
import { exportAllRecords, exportSessionLogs, flushSessionLogs, getAdminDashboardOverview } from "@/actions/admin/dashboard-actions";
import type { DashboardStat } from "@/types/dashboard";
import { auth } from "@/lib/firebase/client";

interface AdminSummaryLog {
  id: string;
  primary: string;
  secondary: string;
  status: string;
  time: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [logs, setLogs] = useState<AdminSummaryLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingLogs, setIsSavingLogs] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [isFlushModalOpen, setIsFlushModalOpen] = useState(false);

  useEffect(() => {
    const fetchAdminData = async () => {
      setIsLoading(true);
      try {
        const idToken = await getIdToken();
        const data = await getAdminDashboardOverview(idToken);
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

  const handleExportRecords = async () => {
    setIsExporting(true);

    try {
      const idToken = await getIdToken();
      const result = await exportAllRecords(idToken);
      downloadCsv(result.csv, result.filename);
      alert(`Exported ${result.rowCount} vaccination record${result.rowCount === 1 ? "" : "s"}.`);
    } catch {
      alert("Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleFlushSessionLogs = async () => {
    setIsFlushing(true);

    try {
      const idToken = await getIdToken();
      const result = await flushSessionLogs(idToken);
      setLogs([{
        id: "flush-session-logs",
        primary: "Maintenance",
        secondary: "Flush Session Logs",
        status: "warning",
        time: "Just now",
      }]);
      setIsFlushModalOpen(false);
      alert(`Flushed ${result.deletedCount} audit log${result.deletedCount === 1 ? "" : "s"}.`);
    } catch {
      alert("Flush failed.");
    } finally {
      setIsFlushing(false);
    }
  };

  const handleExportLogsBeforeFlush = async () => {
    setIsSavingLogs(true);

    try {
      const idToken = await getIdToken();
      const result = await exportSessionLogs(idToken);
      downloadCsv(result.csv, result.filename);
      alert(`Saved ${result.rowCount} audit log${result.rowCount === 1 ? "" : "s"} locally.`);
    } catch {
      alert("Log export failed.");
    } finally {
      setIsSavingLogs(false);
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
            <button
              onClick={handleExportRecords}
              disabled={isExporting}
              className="group w-full rounded-2xl bg-slate-50 p-4 text-left transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 group-hover:text-blue-100">Database</p>
              <p className="font-bold text-slate-900 group-hover:text-white">
                {isExporting ? "Exporting Records..." : "Export All Records"}
              </p>
            </button>
            <button
              onClick={() => setIsFlushModalOpen(true)}
              disabled={isFlushing}
              className="group w-full rounded-2xl bg-slate-50 p-4 text-left transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 group-hover:text-blue-100">Security</p>
              <p className="font-bold text-slate-900 group-hover:text-white">
                {isFlushing ? "Flushing Logs..." : "Flush Session Logs"}
              </p>
            </button>
          </div>
        </div>
      </div>

      {isFlushModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl shadow-slate-900/20">
            <div className="mb-5 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">Flush Session Logs?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  This will permanently remove the current System Audit Logs from Firestore. Save a local CSV copy first if you need a handover, compliance, or troubleshooting record.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              The flush itself will leave one new warning log showing who cleared the logs and how many entries were removed.
            </div>

            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setIsFlushModalOpen(false)}
                disabled={isFlushing}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExportLogsBeforeFlush}
                disabled={isFlushing || isSavingLogs}
                className="flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingLogs ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                {isSavingLogs ? "Saving..." : "Save First"}
              </button>
              <button
                type="button"
                onClick={handleFlushSessionLogs}
                disabled={isFlushing}
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isFlushing ? "Flushing..." : "Proceed"}
              </button>
            </div>
          </div>
        </div>
      )}
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

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
