"use client";

import React, { useState, useEffect } from "react";
import {
  History,
  ShieldCheck,
  AlertCircle,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Download,
  ChevronDown,
  ListFilter,
  CalendarDays,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { getSystemLogs } from "@/actions/admin/log-actions";
import type { LogDateMode, LogType, SystemLog } from "@/types/log";
import { writeClientAuditLog } from "@/lib/firebase/audit-client";
import { auth } from "@/lib/firebase/client";

const logTypes: LogType[] = [
  "All",
  "User Login",
  "Password Change",
  "Create User",
  "User Status Update",
  "Password Reset",
  "Digitalized Record",
  "Record Updated",
  "Review Completed",
  "Export CSV",
  "Export All Records",
  "Export Session Logs",
  "Flush Session Logs",
];

const dateModes: LogDateMode[] = ["All Dates", "Specific Date", "Date Range"];

export default function LogsPage() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<LogType>("All");
  const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);
  const [dateMode, setDateMode] = useState<LogDateMode>("All Dates");
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [specificDate, setSpecificDate] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Debounced data fetching
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      setIsLoading(true);
      try {
        const idToken = await getIdToken();
        const data = await getSystemLogs(idToken, query, typeFilter, {
          mode: dateMode,
          date: specificDate,
          from: rangeFrom,
          to: rangeTo,
        });
        setLogs(data);
        setCurrentPage(1);
      } catch (err) {
        console.error("UI Error:", err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [dateMode, query, rangeFrom, rangeTo, specificDate, typeFilter]);

  const today = getTodayDateString();

  // Pagination Logic
  const totalPages = Math.ceil(logs.length / itemsPerPage);
  const currentItems = logs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success": return <ShieldCheck className="text-emerald-500" size={16} />;
      case "warning": return <AlertCircle className="text-amber-500" size={16} />;
      case "error": return <XCircle className="text-red-500" size={16} />;
      default: return null;
    }
  };

  const handleExportCsv = async () => {
    if (logs.length === 0) {
      return;
    }

    const csvRows = [
      ["Status", "User", "Action", "Target", "Timestamp"],
      ...logs.map((log) => [log.status, log.user, log.action, log.target, log.timestamp]),
    ];
    const csv = csvRows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `digivax-system-logs-${getTodayDateString()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    await writeClientAuditLog({
      action: "Export CSV",
      target: `${logs.length} system log${logs.length === 1 ? "" : "s"}`,
      status: "success",
    });
  };

  return (
    <div className="p-8 bg-slate-50 h-full flex flex-col overflow-hidden">
      {/* Header Area */}
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold text-slate-900">System Logs</h1>
          <p className="text-slate-500 mt-2 font-medium italic">Audit trail of all administrative and staff actions</p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportCsv}
          disabled={isLoading || logs.length === 0}
          className="flex items-center gap-2 border-slate-200 bg-white text-slate-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={18} /> Export CSV
        </Button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 flex-1 flex flex-col min-h-0">
        
        <div className="mb-8 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_260px_320px]">
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              {isLoading ? <Loader2 className="animate-spin text-blue-500" size={20} /> : <History className="text-slate-400" size={20} />}
            </div>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              placeholder="Search logs by user, action, or target..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsTypeMenuOpen((value) => !value)}
              className="flex h-full min-h-[58px] w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 text-left font-bold text-slate-700 shadow-sm outline-none transition-all hover:bg-slate-50 focus:ring-2 focus:ring-blue-500/20"
            >
              <span className="flex min-w-0 items-center gap-3">
                <ListFilter size={18} className="shrink-0 text-blue-600" />
                <span className="truncate">{typeFilter}</span>
              </span>
              <ChevronDown
                size={18}
                className={`shrink-0 text-slate-400 transition-transform ${isTypeMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isTypeMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-full overflow-hidden rounded-2xl border border-slate-100 bg-white p-2 shadow-xl shadow-slate-200/70">
                {logTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setTypeFilter(type);
                      setIsTypeMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition-all ${
                      typeFilter === type
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <ListFilter size={15} className={typeFilter === type ? "text-blue-600" : "text-slate-400"} />
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDateMenuOpen((value) => !value)}
              className="flex h-full min-h-[58px] w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 text-left font-bold text-slate-700 shadow-sm outline-none transition-all hover:bg-slate-50 focus:ring-2 focus:ring-blue-500/20"
            >
              <span className="flex min-w-0 items-center gap-3">
                <CalendarDays size={18} className="shrink-0 text-blue-600" />
                <span className="truncate">{getDateFilterLabel(dateMode, specificDate, rangeFrom, rangeTo)}</span>
              </span>
              <ChevronDown
                size={18}
                className={`shrink-0 text-slate-400 transition-transform ${isDateMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isDateMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-full rounded-2xl border border-slate-100 bg-white p-3 shadow-xl shadow-slate-200/70">
                <div className="space-y-2">
                  {dateModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setDateMode(mode);
                        if (mode === "All Dates") {
                          setSpecificDate("");
                          setRangeFrom("");
                          setRangeTo("");
                          setIsDateMenuOpen(false);
                        }
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition-all ${
                        dateMode === mode
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <CalendarDays size={15} className={dateMode === mode ? "text-blue-600" : "text-slate-400"} />
                      {mode}
                    </button>
                  ))}
                </div>

                {dateMode === "Specific Date" && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Date
                    </label>
                    <input
                      type="date"
                      max={today}
                      value={specificDate}
                      onChange={(event) => setSpecificDate(clampDate(event.target.value, today))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                )}

                {dateMode === "Date Range" && (
                  <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                        From
                      </label>
                      <input
                        type="date"
                        max={today}
                        value={rangeFrom}
                        onChange={(event) => setRangeFrom(clampDate(event.target.value, today))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                        To
                      </label>
                      <input
                        type="date"
                        max={today}
                        min={rangeFrom || undefined}
                        value={rangeTo}
                        onChange={(event) => setRangeTo(clampDate(event.target.value, today))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Table Area */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left border-separate border-spacing-y-2">
            <thead>
              <tr className="text-slate-400 uppercase text-[10px] tracking-[0.2em] font-black">
                <th className="px-4 pb-4">Status</th>
                <th className="px-4 pb-4">User</th>
                <th className="px-4 pb-4">Action</th>
                <th className="px-4 pb-4">Target</th>
                <th className="px-4 pb-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className={isLoading ? "opacity-40 transition-opacity" : "transition-opacity"}>
              {currentItems.map((log) => (
                <tr key={log.id} className="group hover:bg-slate-50 transition-all">
                  <td className="px-4 py-3 border-t border-slate-50 first:rounded-l-xl">
                    {getStatusIcon(log.status)}
                  </td>
                  <td className="px-4 py-3 border-t border-slate-50 font-bold text-slate-700 text-sm">
                    {log.user}
                  </td>
                  <td className="px-4 py-3 border-t border-slate-50">
                    <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 border-t border-slate-50 font-mono text-[11px] text-slate-500">
                    {log.target}
                  </td>
                  <td className="px-4 py-3 border-t border-slate-50 text-slate-400 text-xs last:rounded-r-xl">
                    {log.timestamp}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!isLoading && logs.length === 0 && (
            <div className="py-20 text-center text-slate-400 font-medium italic">No activity logs found.</div>
          )}
        </div>

        {/* Pagination Section */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            Page {currentPage} of {totalPages || 1}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1 || isLoading}
              className="px-3 border-slate-200 bg-white"
            >
              <ChevronLeft size={20} className="text-slate-400" />
            </Button>
            
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0 || isLoading}
              className="px-3 border-slate-200 bg-white"
            >
              <ChevronRight size={20} className="text-slate-400" />
            </Button>
          </div>
        </div>
      </div>
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

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function clampDate(date: string, maxDate: string) {
  if (!date) {
    return "";
  }

  return date > maxDate ? maxDate : date;
}

function getDateFilterLabel(
  mode: LogDateMode,
  specificDate: string,
  rangeFrom: string,
  rangeTo: string,
) {
  if (mode === "Specific Date") {
    return specificDate ? formatDateLabel(specificDate) : "Specific Date";
  }

  if (mode === "Date Range") {
    if (rangeFrom && rangeTo) {
      return `${formatDateLabel(rangeFrom)} - ${formatDateLabel(rangeTo)}`;
    }

    return "Date Range";
  }

  return "All Dates";
}

function formatDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsedDate);
}

function escapeCsvValue(value: string) {
  const escapedValue = value.replace(/"/g, "\"\"");

  if (/[",\r\n]/.test(escapedValue)) {
    return `"${escapedValue}"`;
  }

  return escapedValue;
}
