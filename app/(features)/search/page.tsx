"use client";

import React, { useCallback, useState, useEffect } from "react";
import {
  Search,
  Eye,
  Edit,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  FileText,
  ExternalLink,
  CheckCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import Button from "@/components/ui/Button"; 
import type { VaccinationRecord, VaccinationRecordDocument, VaccinationRecordStatus } from "@/types/records";
import { getVaccinationRecord, getVaccinationRecords, updateVaccinationRecord } from "@/lib/firebase/records";
import {
  getVaccinationRecordFilePreview,
  type VaccinationRecordFilePreview,
} from "@/lib/firebase/storage";
import ClinicRecordSummary from "@/components/records/ClinicRecordSummary";
import { clinicRecordFromText, clinicRecordToText, normalizeClinicRecordDraft } from "@/lib/records/clinic-format";
import type { ClinicRecordDraft } from "@/types/clinic-record";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<VaccinationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<VaccinationRecordDocument | null>(null);
  const [isRecordLoading, setIsRecordLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [editedClinicRecord, setEditedClinicRecord] = useState<ClinicRecordDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<VaccinationRecordFilePreview | null>(null);
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const [isPreviewRendering, setIsPreviewRendering] = useState(false);
  const [sourceZoom, setSourceZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const loadRecords = useCallback(async (searchQuery: string) => {
    setIsLoading(true);
    try {
      const results = await getVaccinationRecords(searchQuery);
      setRecords(results);
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      await loadRecords(query);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query, loadRecords]);

  const totalPages = Math.ceil(records.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = records.slice(indexOfFirstItem, indexOfLastItem);

  const openRecord = async (recordId: string, mode: "view" | "edit" = "view") => {
    setIsRecordLoading(true);
    try {
      const record = await getVaccinationRecord(recordId);
      const clinicRecord = getDisplayClinicRecord(record);
      setSelectedRecord(record);
      setEditedText(record.correctedText);
      setEditedClinicRecord(clinicRecord);
      setIsEditing(mode === "edit");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to load record.");
    } finally {
      setIsRecordLoading(false);
    }
  };

  const openSourceFile = async (record: VaccinationRecordDocument) => {
    setIsSourceLoading(true);
    setIsPreviewRendering(true);
    try {
      const preview = await getVaccinationRecordFilePreview(record.id);
      setSourcePreview(preview);
      setSourceZoom(1);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to open source file.");
    } finally {
      setIsSourceLoading(false);
    }
  };

  const closeSourcePreview = () => {
    if (sourcePreview) {
      URL.revokeObjectURL(sourcePreview.url);
    }

    setSourcePreview(null);
    setSourceZoom(1);
    setIsPreviewRendering(false);
  };

  const downloadSourcePreview = () => {
    if (!sourcePreview) {
      return;
    }

    const link = document.createElement("a");
    link.href = sourcePreview.url;
    link.download = sourcePreview.fileName;
    link.click();
  };

  const downloadTextExport = (record: VaccinationRecordDocument) => {
    const exportText = [
      `Record ID: ${record.id}`,
      `Patient Name: ${record.patientName}`,
      `Vaccine Type: ${record.vaccineType}`,
      `Vaccination Date: ${record.vaccinationDate || "No date"}`,
      `Status: ${record.status}`,
      "",
      "Corrected OCR Text:",
      record.correctedText,
      "",
      "Raw OCR Text:",
      record.rawText,
    ].join("\n");

    const blob = new Blob([exportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${record.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveRecordChanges = async (status?: VaccinationRecordStatus) => {
    if (!selectedRecord) {
      return;
    }

    const correctedText = editedClinicRecord
      ? clinicRecordToText(editedClinicRecord)
      : editedText;

    setIsSaving(true);
    try {
      await updateVaccinationRecord(selectedRecord.id, {
        correctedText,
        clinicRecord: editedClinicRecord || undefined,
        status: status || selectedRecord.status,
      });
      const refreshed = await getVaccinationRecord(selectedRecord.id);
      const refreshedClinicRecord = getDisplayClinicRecord(refreshed);
      setSelectedRecord(refreshed);
      setEditedText(refreshed.correctedText);
      setEditedClinicRecord(refreshedClinicRecord);
      setIsEditing(false);
      await loadRecords(query);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update record.");
    } finally {
      setIsSaving(false);
    }
  };

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
                      <Button
                        variant="outline"
                        className="p-2 px-2 border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                        onClick={() => openRecord(record.id)}
                        disabled={isRecordLoading}
                      >
                        <Eye size={18} />
                      </Button>
                      <Button
                        variant="outline"
                        className="p-2 px-2 border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                        onClick={() => openRecord(record.id, "edit")}
                        disabled={isRecordLoading}
                      >
                        <Edit size={18} />
                      </Button>
                      <Button
                        variant="outline"
                        className="p-2 px-2 border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                        onClick={async () => {
                          const fullRecord = await getVaccinationRecord(record.id);
                          downloadTextExport(fullRecord);
                        }}
                        disabled={isRecordLoading}
                      >
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

      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex h-[94vh] w-[min(96vw,1500px)] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Vaccination Record</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">{selectedRecord.patientName}</h2>
                <p className="mt-1 font-mono text-xs text-slate-400">{selectedRecord.id}</p>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={22} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="min-h-0 space-y-5 overflow-auto border-r border-slate-100 bg-slate-50 p-6">
                <RecordFact label="Vaccine Type" value={selectedRecord.vaccineType} />
                <RecordFact label="Vaccination Date" value={selectedRecord.vaccinationDate || "No date"} />
                <RecordFact label="Record Year" value={selectedRecord.recordYear || "Unsorted"} />
                <RecordFact label="Status" value={selectedRecord.status} />
                <RecordFact label="Uploaded By" value={selectedRecord.createdByName} />
                <RecordFact label="Source File" value={selectedRecord.sourceFileName || "No file"} />

                <div className="space-y-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex w-full items-center justify-center gap-2"
                    onClick={() => openSourceFile(selectedRecord)}
                    disabled={!selectedRecord.sourceStoragePath || isSourceLoading}
                  >
                    {isSourceLoading ? <Loader2 className="animate-spin" size={16} /> : <ExternalLink size={16} />}
                    View Source File
                  </Button>
                  <Button
                    variant="outline"
                    className="flex w-full items-center justify-center gap-2"
                    onClick={() => downloadTextExport(selectedRecord)}
                  >
                    <FileText size={16} /> Export Text
                  </Button>
                  <Button
                    className="flex w-full items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => saveRecordChanges("Completed")}
                    disabled={isSaving || selectedRecord.status === "Completed"}
                  >
                    <CheckCircle size={16} /> Mark Completed
                  </Button>
                </div>
              </aside>

              <section className="flex min-h-0 min-w-0 flex-col gap-5 overflow-hidden p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">Corrected OCR Text</h3>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (isEditing && selectedRecord) {
                          setEditedText(selectedRecord.correctedText);
                          setEditedClinicRecord(getDisplayClinicRecord(selectedRecord));
                        }
                        setIsEditing((value) => !value);
                      }}
                    >
                      {isEditing ? "Cancel" : "Edit"}
                    </Button>
                    {isEditing && (
                      <Button onClick={() => saveRecordChanges()} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save Changes"}
                      </Button>
                    )}
                  </div>
                </div>

                {editedClinicRecord ? (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <ClinicRecordSummary
                      record={editedClinicRecord}
                      isEditing={isEditing}
                      onChange={setEditedClinicRecord}
                    />
                  </div>
                ) : (
                  <textarea
                    className="min-h-[220px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 p-5 font-mono text-sm leading-relaxed text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-white"
                    value={editedText}
                    onChange={(event) => setEditedText(event.target.value)}
                    disabled={!isEditing}
                  />
                )}

                <div>
                  <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-400">Raw OCR Text</h3>
                  <pre className="max-h-48 overflow-auto rounded-2xl border border-slate-100 bg-white p-5 text-xs leading-relaxed text-slate-500">
                    {selectedRecord.rawText || "No raw OCR text saved."}
                  </pre>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {sourcePreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/65 p-4 backdrop-blur-sm">
          <div className="flex h-[min(86vh,820px)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{sourcePreview.fileName}</p>
                <p className="text-xs font-medium text-slate-400">{Math.round(sourceZoom * 100)}%</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSourceZoom((value) => Math.max(0.5, value - 0.25))}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-blue-600"
                  title="Zoom out"
                >
                  <ZoomOut size={18} />
                </button>
                <button
                  onClick={() => setSourceZoom(1)}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-blue-600"
                  title="Reset zoom"
                >
                  <RotateCcw size={18} />
                </button>
                <button
                  onClick={() => setSourceZoom((value) => Math.min(3, value + 0.25))}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-blue-600"
                  title="Zoom in"
                >
                  <ZoomIn size={18} />
                </button>
                <button
                  onClick={downloadSourcePreview}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-blue-600"
                  title="Download"
                >
                  <Download size={18} />
                </button>
                <button
                  onClick={closeSourcePreview}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="relative flex-1 overflow-auto bg-slate-900 p-5">
              {isPreviewRendering && <SourcePreviewSkeleton />}

              <div className="flex min-h-full items-center justify-center">
                {sourcePreview.contentType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sourcePreview.url}
                    alt={sourcePreview.fileName}
                    onLoad={() => setIsPreviewRendering(false)}
                    onError={() => setIsPreviewRendering(false)}
                    className={`rounded-lg bg-white object-contain shadow-xl transition-opacity ${
                      isPreviewRendering ? "opacity-0" : "opacity-100"
                    }`}
                    style={{
                      maxHeight: sourceZoom === 1 ? "calc(86vh - 150px)" : undefined,
                      maxWidth: sourceZoom === 1 ? "100%" : undefined,
                      width: sourceZoom === 1 ? "auto" : `${sourceZoom * 100}%`,
                      transformOrigin: "center center",
                    }}
                  />
                ) : sourcePreview.contentType === "application/pdf" ? (
                  <iframe
                    src={sourcePreview.url}
                    title={sourcePreview.fileName}
                    onLoad={() => setIsPreviewRendering(false)}
                    className={`h-full min-h-[560px] w-full origin-center rounded-lg border-0 bg-white shadow-xl transition-opacity ${
                      isPreviewRendering ? "opacity-0" : "opacity-100"
                    }`}
                    style={{
                      transform: `scale(${sourceZoom})`,
                    }}
                  />
                ) : (
                  <div className="rounded-2xl bg-white p-8 text-center text-slate-700 shadow-xl">
                    <FileText className="mx-auto mb-4 text-blue-600" size={42} />
                    <p className="font-bold">Preview is not available for this file type.</p>
                    <button
                      onClick={downloadSourcePreview}
                      className="mt-5 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700"
                    >
                      Download File
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getDisplayClinicRecord(record: VaccinationRecordDocument) {
  if (record.clinicRecord) {
    return normalizeClinicRecordDraft(record.clinicRecord);
  }

  if (!record.correctedText.includes("Clinic Format: Under Five Clinic Record")) {
    return null;
  }

  return normalizeClinicRecordDraft(clinicRecordFromText(record.correctedText));
}

function RecordFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function SourcePreviewSkeleton() {
  return (
    <div className="absolute inset-5 z-10 flex items-center justify-center rounded-2xl border border-white/10 bg-slate-950">
      <div className="w-full max-w-2xl space-y-4 p-8">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
        <div className="mx-auto h-4 w-44 animate-pulse rounded-full bg-slate-700" />
        <div className="mx-auto aspect-[4/3] w-full max-w-lg animate-pulse rounded-2xl bg-slate-800" />
        <div className="mx-auto h-3 w-64 animate-pulse rounded-full bg-slate-800" />
      </div>
    </div>
  );
}
