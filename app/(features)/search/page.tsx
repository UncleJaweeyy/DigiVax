"use client";

import React, { useState, useEffect } from "react";
import { Search, Eye, Edit, Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button"; 
import { getVaccinationRecords, RecordType } from "@/actions/records/search-actions";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<RecordType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await getVaccinationRecords(query);
        setRecords(results);
        setCurrentPage(1);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const totalPages = Math.ceil(records.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = records.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div className="p-8 bg-slate-50 h-full flex flex-col overflow-hidden">
      <div className="mb-8 flex justify-between items-center">
        <h1 className="text-4xl font-bold text-slate-900">Search Record</h1>
        <div className="flex items-center gap-3">
           {isLoading && <Loader2 className="animate-spin text-blue-600" size={20} />}
           <span className="text-slate-400 text-sm font-medium">
             Total Records: {records.length}
           </span>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 flex-1 flex flex-col min-h-0">
        
        {/* Search Bar */}
        <div className="relative mb-8">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="text-slate-400" size={20} />
          </div>
          <input
            type="text"
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            placeholder="Search by vaccine name, ID, or patient name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Table Area */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left border-separate border-spacing-y-3">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-slate-400 uppercase text-[11px] tracking-widest font-black">
                <th className="px-4 pb-4">Patient Name</th>
                <th className="px-4 pb-4">Record ID</th>
                <th className="px-4 pb-4">Vaccine Type</th>
                <th className="px-4 pb-4">Timestamp</th>
                <th className="px-4 pb-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className={isLoading ? "opacity-40" : ""}>
              {currentItems.map((record) => (
                <tr key={record.id} className="group hover:bg-slate-50/80 transition-all">
                  <td className="px-4 py-4 border-t border-slate-50 first:rounded-l-2xl font-bold text-slate-800 italic">
                    {record.patientName}
                  </td>
                  <td className="px-4 py-4 border-t border-slate-50 font-mono text-xs text-slate-500">
                    {record.id}
                  </td>
                  <td className="px-4 py-4 border-t border-slate-50 text-slate-600 font-medium">
                    {record.vaccineType}
                  </td>
                  <td className="px-4 py-4 border-t border-slate-50 text-slate-500 text-sm">
                    {record.timestamp}
                  </td>
                  <td className="px-4 py-4 border-t border-slate-50 last:rounded-r-2xl">
                    <div className="flex justify-center gap-2">
                      {/* Using your Button with variant="outline" for table actions */}
                      <Button variant="outline" className="p-2 px-2 border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                        <Eye size={18} />
                      </Button>
                      <Button variant="outline" className="p-2 px-2 border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                        <Edit size={18} />
                      </Button>
                      <Button variant="outline" className="p-2 px-2 border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                        <Download size={18} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Section */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
          <p className="text-sm text-slate-400 font-medium">
            Showing <span className="text-slate-800">{records.length > 0 ? indexOfFirstItem + 1 : 0}</span> to{" "}
            <span className="text-slate-800">{Math.min(indexOfLastItem, records.length)}</span> of {records.length}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1 || isLoading}
              className="px-3"
            >
              <ChevronLeft size={20} />
            </Button>
            
            <div className="flex gap-1">
              {[...Array(totalPages)].map((_, i) => (
                <Button
                  key={i + 1}
                  variant={currentPage === i + 1 ? "primary" : "outline"}
                  className={`min-w-[40px] px-0 ${currentPage !== i + 1 ? 'border-transparent text-slate-400' : ''}`}
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </Button>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0 || isLoading}
              className="px-3"
            >
              <ChevronRight size={20} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}