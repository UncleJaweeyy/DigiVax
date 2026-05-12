"use client";

import { Plus, Save, Trash2, X } from "lucide-react";

import Button from "@/components/ui/Button";
import { emptyVisitRow } from "@/lib/records/clinic-format";
import type { ClinicPatientDetails, ClinicRecordDraft, ClinicVisitRow, OcrVisualization } from "@/types/clinic-record";

interface ClinicRecordReviewModalProps {
  draft: ClinicRecordDraft;
  visualization?: OcrVisualization;
  sourcePreviewUrl?: string;
  markdown?: string;
  isSaving: boolean;
  onChange: (draft: ClinicRecordDraft) => void;
  onClose: () => void;
  onSave: () => void;
}

const patientFields: Array<{ key: keyof ClinicPatientDetails; label: string }> = [
  { key: "name", label: "Name" },
  { key: "age", label: "Age" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "address", label: "Address" },
  { key: "motherName", label: "Mother's Name" },
  { key: "fatherName", label: "Father's Name" },
  { key: "nutritionalStatus", label: "Nutritional Status" },
  { key: "birthWeight", label: "Birth Weight" },
  { key: "epiStatus", label: "EPI Status" },
  { key: "feedingType", label: "Type of Feeding" },
];

const visitFields: Array<{ key: keyof Omit<ClinicVisitRow, "id">; label: string; width: string; multiline?: boolean }> = [
  { key: "date", label: "DATE", width: "min-w-32" },
  { key: "wt", label: "WT", width: "min-w-24" },
  { key: "vs", label: "V/S", width: "min-w-24" },
  { key: "episode", label: "EPISODE", width: "min-w-40", multiline: true },
  { key: "dangerSigns", label: "DANGER SIGNS", width: "min-w-40", multiline: true },
  { key: "otherCc", label: "OTHER CC", width: "min-w-40", multiline: true },
  { key: "management", label: "MANAGEMENT", width: "min-w-48", multiline: true },
];

export default function ClinicRecordReviewModal({
  draft,
  visualization,
  sourcePreviewUrl,
  markdown,
  isSaving,
  onChange,
  onClose,
  onSave,
}: ClinicRecordReviewModalProps) {
  const updatePatient = (key: keyof ClinicPatientDetails, value: string) => {
    onChange({
      ...draft,
      patient: {
        ...draft.patient,
        [key]: value,
      },
    });
  };

  const updateVisit = (rowId: string, key: keyof Omit<ClinicVisitRow, "id">, value: string) => {
    onChange({
      ...draft,
      visits: draft.visits.map((visit) => visit.id === rowId ? { ...visit, [key]: value } : visit),
    });
  };

  const addVisit = () => {
    onChange({
      ...draft,
      visits: [...draft.visits, emptyVisitRow(draft.visits.length + 1)],
    });
  };

  const removeVisit = (rowId: string) => {
    const nextVisits = draft.visits.filter((visit) => visit.id !== rowId);
    onChange({
      ...draft,
      visits: nextVisits.length ? nextVisits : [emptyVisitRow(1)],
    });
  };

  const updateVaccines = (value: string) => {
    onChange({
      ...draft,
      vaccines: value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Under Five Clinic Record Review</h2>
            <p className="text-sm text-slate-500">Review the extracted patient details and clinic visit entries before saving.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close review"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="min-h-0 border-b border-slate-200 bg-slate-100 lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                OCR Overlay
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {visualization?.dataUrl ? (
                  <img
                    src={visualization.dataUrl}
                    alt="OCR overlay with detected text boxes"
                    className="mx-auto max-h-none w-full max-w-3xl rounded-lg border border-slate-200 bg-white object-contain"
                  />
                ) : sourcePreviewUrl ? (
                  <img
                    src={sourcePreviewUrl}
                    alt="Uploaded clinic record"
                    className="mx-auto max-h-none w-full max-w-3xl rounded-lg border border-slate-200 bg-white object-contain"
                  />
                ) : (
                  <pre className="min-h-96 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
                    {markdown || "The OCR response did not include an overlay image."}
                  </pre>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-auto">
            <div className="space-y-6 p-5">
              <section>
                <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-500">Patient Details</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {patientFields.map((field) => (
                    <label key={field.key} className="block">
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                        {field.label}
                      </span>
                      <input
                        value={draft.patient[field.key]}
                        onChange={(event) => updatePatient(field.key, event.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                    EPI / Vaccines
                  </span>
                  <textarea
                    value={draft.vaccines.join(", ")}
                    onChange={(event) => updateVaccines(event.target.value)}
                    className="h-20 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">
                    Findings / Chief Complaint
                  </h3>
                  <Button type="button" variant="outline" className="flex items-center gap-2 px-3" onClick={addVisit}>
                    <Plus size={16} /> Row
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-600">
                      <tr>
                        {visitFields.map((field) => (
                          <th key={field.key} className={`border-b border-slate-200 px-2 py-2 ${field.width}`}>
                            {field.label}
                          </th>
                        ))}
                        <th className="w-12 border-b border-slate-200 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.visits.map((visit) => (
                        <tr key={visit.id} className="align-top">
                          {visitFields.map((field) => (
                            <td key={field.key} className="border-t border-slate-100 p-1">
                              {field.multiline ? (
                                <textarea
                                  value={visit[field.key]}
                                  onChange={(event) => updateVisit(visit.id, field.key, event.target.value)}
                                  className="h-24 w-full resize-none rounded-md border border-transparent bg-slate-50 px-2 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                />
                              ) : (
                                <input
                                  value={visit[field.key]}
                                  onChange={(event) => updateVisit(visit.id, field.key, event.target.value)}
                                  className="h-10 w-full rounded-md border border-transparent bg-slate-50 px-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                />
                              )}
                            </td>
                          ))}
                          <td className="border-t border-slate-100 p-1">
                            <button
                              type="button"
                              onClick={() => removeVisit(visit.id)}
                              className="grid h-10 w-10 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                              aria-label="Remove visit row"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Continue Editing
          </Button>
          <Button type="button" className="flex items-center gap-2" onClick={onSave} disabled={isSaving}>
            <Save size={16} /> {isSaving ? "Saving..." : "Save Record"}
          </Button>
        </div>
      </div>
    </div>
  );
}
