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
  CircleCheck,
  Clock3,
  ClipboardList,
  BarChart3,
  FileArchive,
} from "lucide-react";
import Button from "@/components/ui/Button"; 
import type { VaccinationRecord, VaccinationRecordDocument, VaccinationRecordStatus } from "@/types/records";
import {
  getAllVaccinationRecordDocuments,
  getVaccinationRecord,
  getVaccinationRecords,
  updateVaccinationRecord,
} from "@/lib/firebase/records";
import {
  getVaccinationRecordFilePreview,
  type VaccinationRecordFilePreview,
} from "@/lib/firebase/storage";
import ClinicRecordSummary from "@/components/records/ClinicRecordSummary";
import { clinicRecordFromText, clinicRecordToText, normalizeClinicRecordDraft } from "@/lib/records/clinic-format";
import type { ClinicRecordDraft } from "@/types/clinic-record";
import { getCrfLabelCounts, getCrfPredictionTotal } from "@/lib/records/crf-labels";
import { downloadStructuredRecordsPdf } from "@/lib/records/record-export";

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
  const [compiledRecords, setCompiledRecords] = useState<VaccinationRecordDocument[]>([]);
  const [isCompiledOpen, setIsCompiledOpen] = useState(false);
  const [isCompiledLoading, setIsCompiledLoading] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
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
      setEditedText(record.correctedText || record.rawText);
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

  const downloadRecordExport = (record: VaccinationRecordDocument) => {
    const structuredRecord = withDisplayClinicRecord(record);
    downloadStructuredRecordsPdf(
      [structuredRecord],
      `${record.id}-structured-record.pdf`,
      `DigiVax Structured Record - ${record.patientName}`,
    );
  };

  const loadCompiledRecords = async () => {
    setIsCompiledLoading(true);
    try {
      const results = await getAllVaccinationRecordDocuments();
      setCompiledRecords(results.map(withDisplayClinicRecord));
      setIsCompiledOpen(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to load compiled records.");
    } finally {
      setIsCompiledLoading(false);
    }
  };

  const downloadAllCompiledRecords = async () => {
    setIsExportingAll(true);
    try {
      const recordsToExport = compiledRecords.length
        ? compiledRecords
        : (await getAllVaccinationRecordDocuments()).map(withDisplayClinicRecord);
      downloadStructuredRecordsPdf(
        recordsToExport,
        `digivax-compiled-records-${getTodayDateString()}.pdf`,
        "DigiVax Compiled Digitalized Records",
      );
      if (!compiledRecords.length) {
        setCompiledRecords(recordsToExport);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to export compiled records.");
    } finally {
      setIsExportingAll(false);
    }
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
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-4xl font-bold text-slate-900">Search Record</h1>
        <div className="flex flex-wrap items-center gap-3">
           <Button
             variant="outline"
             className="flex items-center gap-2 border-slate-200 px-4 text-slate-600"
             onClick={loadCompiledRecords}
             disabled={isCompiledLoading}
           >
             {isCompiledLoading ? <Loader2 className="animate-spin" size={16} /> : <ClipboardList size={16} />}
             Compiled Records
           </Button>
           <Button
             className="flex items-center gap-2 px-4"
             onClick={downloadAllCompiledRecords}
             disabled={isExportingAll}
           >
             {isExportingAll ? <Loader2 className="animate-spin" size={16} /> : <FileArchive size={16} />}
             Export All
           </Button>
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
            placeholder="Search by child name, vaccine, date, findings, or CRF label..."
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
                <th className="px-4 pb-4">Review Status</th>
                <th className="px-4 pb-4">Timestamp</th>
                <th className="px-4 pb-4">Semantic Match</th>
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
                  <td className="px-4 py-4 border-t border-slate-50">
                    <RecordStatusBadge status={record.status || "Pending Review"} />
                  </td>
                  <td className="px-4 py-4 border-t border-slate-50 text-slate-500 text-sm">
                    {record.timestamp}
                  </td>
                  <td className="px-4 py-4 border-t border-slate-50">
                    <SemanticMatchBadge record={record} query={query} />
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
                          downloadRecordExport(fullRecord);
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
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold text-slate-900">{selectedRecord.patientName}</h2>
                  <RecordStatusBadge status={selectedRecord.status} />
                </div>
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
                <RecordStatusPanel status={selectedRecord.status} />
                <CrfLabelSummary metadata={selectedRecord.ocrMetadata} compact />
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
                    onClick={() => downloadRecordExport(selectedRecord)}
                  >
                    <FileText size={16} /> Export PDF
                  </Button>
                  <Button
                    className={`flex w-full items-center justify-center gap-2 ${
                      selectedRecord.status === "Completed"
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                    onClick={() => saveRecordChanges("Completed")}
                    disabled={isSaving || selectedRecord.status === "Completed"}
                  >
                    <CheckCircle size={16} />
                    {selectedRecord.status === "Completed" ? "Review Completed" : "Mark Review Completed"}
                  </Button>
                </div>
              </aside>

              <section className="flex min-h-0 min-w-0 flex-col gap-5 overflow-y-auto p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">
                    {editedClinicRecord ? "Under Five Clinic Record Review" : "Corrected OCR Text"}
                  </h3>
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

                {!editedClinicRecord && (
                  <>
                    <div>
                      <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-400">Raw OCR Text</h3>
                      <pre className="max-h-48 overflow-auto rounded-2xl border border-slate-100 bg-white p-5 text-xs leading-relaxed text-slate-500">
                        {selectedRecord.rawText || "No raw OCR text saved."}
                      </pre>
                    </div>

                    <CrfLabelSummary metadata={selectedRecord.ocrMetadata} />
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {isCompiledOpen && (
        <CompiledRecordsModal
          records={compiledRecords}
          isExporting={isExportingAll}
          onClose={() => setIsCompiledOpen(false)}
          onDownload={downloadAllCompiledRecords}
          onOpenRecord={(recordId) => {
            setIsCompiledOpen(false);
            openRecord(recordId);
          }}
        />
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

  const clinicText = [record.correctedText, record.rawText].find(looksLikeClinicRecord);

  if (clinicText) {
    return buildClinicRecordPreview(record, clinicText);
  }

  return null;
}

function hasClinicFormat(value: string) {
  return /clinic\s*format\s*:\s*under\s+five\s+clinic\s+record/i.test(value);
}

function looksLikeClinicRecord(value: string) {
  if (!value.trim()) return false;
  if (hasClinicFormat(value)) return true;
  if (/findings\s*\/\s*chief\s+complaint/i.test(value)) return true;

  const fieldPatterns = [
    /\bname\s*:/i,
    /\bage\s*:/i,
    /\bdate\s+of\s+birth\s*:/i,
    /\baddress\s*:/i,
    /\bmother'?s\s+name\s*:/i,
    /\bfather'?s\s+name\s*:/i,
    /\bnutritional\s+status\s*:/i,
    /\bbirth\s+weight\s*:/i,
    /\bepi\s+status\s*:/i,
    /\bvaccine\s+type\s*:/i,
  ];

  return fieldPatterns.filter((pattern) => pattern.test(value)).length >= 3;
}

function buildClinicRecordPreview(record: VaccinationRecordDocument, text: string) {
  const clinicRecord = normalizeClinicRecordDraft(clinicRecordFromText(text));

  if (!clinicRecord.patient.name && record.patientName !== "Unknown Patient") {
    clinicRecord.patient.name = record.patientName;
  }

  if (!clinicRecord.vaccines.length && record.vaccineType !== "Unspecified Vaccine") {
    clinicRecord.vaccines = record.vaccineType
      .split(/[,;/]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!clinicRecord.visits.some((visit) => visit.date.trim()) && record.vaccinationDate) {
    clinicRecord.visits[0].date = record.vaccinationDate;
  }

  return clinicRecord;
}

function withDisplayClinicRecord(record: VaccinationRecordDocument): VaccinationRecordDocument {
  const clinicRecord = getDisplayClinicRecord(record);

  return {
    ...record,
    clinicRecord: clinicRecord || record.clinicRecord,
  };
}

function getTodayDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function RecordFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function RecordStatusBadge({ status }: { status: VaccinationRecordStatus }) {
  const isCompleted = status === "Completed";

  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
      isCompleted
        ? "border-emerald-100 bg-emerald-50 text-emerald-700"
        : "border-orange-100 bg-orange-50 text-orange-700"
    }`}>
      {isCompleted ? <CircleCheck size={13} /> : <Clock3 size={13} />}
      {status}
    </span>
  );
}

function SemanticMatchBadge({ record, query }: { record: VaccinationRecord; query: string }) {
  if (!query.trim() || !record.searchScore) {
    return <span className="text-xs font-semibold text-slate-300">Latest</span>;
  }

  const score = Math.min(100, Math.round(record.searchScore * 100));
  const labels = record.matchedLabels?.slice(0, 2).join(", ");

  return (
    <div className="min-w-32">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700">
        <BarChart3 size={12} />
        {score}% match
      </div>
      {labels && <p className="mt-1 text-[11px] font-semibold text-slate-400">{labels}</p>}
    </div>
  );
}

function CrfLabelSummary({
  metadata,
  compact = false,
}: {
  metadata?: VaccinationRecordDocument["ocrMetadata"];
  compact?: boolean;
}) {
  const counts = getCrfLabelCounts(metadata);
  const total = getCrfPredictionTotal(metadata);

  if (compact) {
    return (
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">CRF Predictions</p>
        <div className="mt-2 flex items-center gap-2 text-sm font-black text-blue-900">
          <BarChart3 size={18} />
          {total} token{total === 1 ? "" : "s"}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {counts.length ? counts.slice(0, 4).map((item) => (
            <span key={item.label} className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-blue-700">
              {item.displayLabel}: {item.count}
            </span>
          )) : (
            <span className="text-xs font-semibold text-blue-700">No CRF labels saved</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-400">
        CRF Label Prediction Counts
      </h3>
      {counts.length ? (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-3">Label / Category</th>
                <th className="px-4 py-3">Number of Predictions</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((item) => (
                <tr key={item.label} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-bold text-slate-800">{item.displayLabel}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 text-sm font-semibold text-slate-400">
          No CRF token labels were saved for this record.
        </div>
      )}
    </div>
  );
}

function CompiledRecordsModal({
  records,
  isExporting,
  onClose,
  onDownload,
  onOpenRecord,
}: {
  records: VaccinationRecordDocument[];
  isExporting: boolean;
  onClose: () => void;
  onDownload: () => void;
  onOpenRecord: (recordId: string) => void;
}) {
  const totalPredictions = records.reduce((sum, record) => sum + getCrfPredictionTotal(record.ocrMetadata), 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex h-[92vh] w-[min(96vw,1500px)] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Compiled Digitalized Forms</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">All Structured Records</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {records.length} record{records.length === 1 ? "" : "s"} compiled, {totalPredictions} CRF prediction{totalPredictions === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button className="flex items-center gap-2 px-4" onClick={onDownload} disabled={isExporting || !records.length}>
              {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              Download All
            </Button>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-6">
          <div className="mb-6 overflow-hidden rounded-2xl border border-slate-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Vaccine</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">CRF Predictions</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-bold text-slate-800">{record.patientName}</td>
                    <td className="px-4 py-3 text-slate-600">{record.vaccineType}</td>
                    <td className="px-4 py-3 text-slate-600">{record.vaccinationDate || "No date"}</td>
                    <td className="px-4 py-3"><RecordStatusBadge status={record.status} /></td>
                    <td className="px-4 py-3 font-mono text-slate-600">{getCrfPredictionTotal(record.ocrMetadata)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onOpenRecord(record.id)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-6">
            {records.map((record) => (
              <section key={record.id} className="rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div>
                    <p className="font-bold text-slate-900">{record.patientName}</p>
                    <p className="font-mono text-xs text-slate-400">{record.id}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                    <span>{record.vaccineType}</span>
                    <span>{record.vaccinationDate || "No date"}</span>
                    <span>{getCrfPredictionTotal(record.ocrMetadata)} CRF labels</span>
                  </div>
                </div>
                <div className="p-4">
                  {record.clinicRecord ? (
                    <ClinicRecordSummary record={record.clinicRecord} />
                  ) : (
                    <pre className="max-h-72 overflow-auto rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
                      {record.correctedText || "No corrected OCR text saved."}
                    </pre>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordStatusPanel({ status }: { status: VaccinationRecordStatus }) {
  const isCompleted = status === "Completed";

  return (
    <div className={`rounded-2xl border p-4 ${
      isCompleted ? "border-emerald-100 bg-emerald-50" : "border-orange-100 bg-orange-50"
    }`}>
      <p className={`text-[10px] font-black uppercase tracking-widest ${
        isCompleted ? "text-emerald-700" : "text-orange-700"
      }`}>
        Review Status
      </p>
      <div className={`mt-2 flex items-center gap-2 text-sm font-black ${
        isCompleted ? "text-emerald-800" : "text-orange-800"
      }`}>
        {isCompleted ? <CircleCheck size={18} /> : <Clock3 size={18} />}
        {status}
      </div>
      <p className={`mt-2 text-xs font-medium leading-5 ${
        isCompleted ? "text-emerald-700" : "text-orange-700"
      }`}>
        {isCompleted
          ? "This record has been reviewed and removed from pending records."
          : "This record still counts under pending records until review is completed."}
      </p>
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
