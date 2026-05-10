"use client";

import React, { useState, useEffect } from "react";
import { History, ShieldCheck, AlertCircle, XCircle, Loader2, ChevronLeft, ChevronRight, Download } from "lucide-react";
import Button from "@/components/ui/Button";
import { getSystemLogs } from "@/actions/admin/log-actions";
import { SystemLog } from "@/app/types/log";
import { auth } from "@/lib/firebase/client";

export default function LogsPage() {
  const [query, setQuery] = useState("");
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
        const data = await getSystemLogs(idToken, query);
        setLogs(data);
        setCurrentPage(1);
      } catch (err) {
        console.error("UI Error:", err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [query]);

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

  return (
    <div className="p-8 bg-slate-50 h-full flex flex-col overflow-hidden">
      {/* Header Area */}
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold text-slate-900">System Logs</h1>
          <p className="text-slate-500 mt-2 font-medium italic">Audit trail of all administrative and staff actions</p>
        </div>
        <Button variant="outline" className="flex items-center gap-2 border-slate-200 text-slate-600 bg-white shadow-sm">
          <Download size={18} /> Export CSV
        </Button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 flex-1 flex flex-col min-h-0">
        
        {/* Search Bar */}
        <div className="relative mb-8">
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
