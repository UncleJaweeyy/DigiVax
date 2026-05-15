"use client";

import { Plus, Save, Trash2, X } from "lucide-react";

import Button from "@/components/ui/Button";
import { emptyVisitRow } from "@/lib/records/clinic-format";
import {
  getCustomVaccineText,
  knownVaccineOptions,
  mergeCustomVaccines,
  mergeKnownVaccineSelection,
} from "@/lib/records/vaccines";
import type { ClinicPatientDetails, ClinicRecordDraft, ClinicVisitRow, OcrVisualization } from "@/types/clinic-record";

interface ClinicRecordReviewModalProps {
  draft: ClinicRecordDraft;
  visualization?: OcrVisualization;
  sourcePreviewUrl?: string;
  markdown?: string;
  isSaving: boolean;
  onChange: (draft: ClinicRecordDraft) => void;
  onClose: () => void;
  onReset: () => void;
  onSave: () => void;
}

const visitFields: Array<{ key: keyof Omit<ClinicVisitRow, "id">; label: string; sublabel?: string; width: string; multiline?: boolean }> = [
  { key: "date", label: "DATE", width: "min-w-32" },
  { key: "wt", label: "WT", width: "min-w-24" },
  { key: "vs", label: "V/S", width: "min-w-24" },
  { key: "episode", label: "EPISODE", sublabel: "(DIARRHEA)", width: "min-w-40", multiline: true },
  { key: "dangerSigns", label: "DANGER SIGNS", sublabel: "(ARI)", width: "min-w-40", multiline: true },
  { key: "otherCc", label: "OTHER CC", width: "min-w-40", multiline: true },
  { key: "management", label: "MANAGEMENT", width: "min-w-48", multiline: true },
];

const epiStatusOptions = ["Complete", "Incomplete"];
const feedingOptions = ["BF", "Mixed", "Bot"];

interface ClinicFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ClinicField({ label, value, onChange }: ClinicFieldProps) {
  return (
    <label className="grid grid-cols-[8.5rem_1fr] items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full border-0 border-b border-slate-300 bg-transparent px-1 text-sm text-slate-800 outline-none focus:border-blue-600 focus:ring-0"
      />
    </label>
  );
}

interface CheckOptionProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function CheckOption({ label, checked, onChange }: CheckOptionProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <span>{label}</span>
    </label>
  );
}

export default function ClinicRecordReviewModal({
  draft,
  visualization,
  sourcePreviewUrl,
  markdown,
  isSaving,
  onChange,
  onClose,
  onReset,
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

  const toggleVaccine = (value: string, checked: boolean) => {
    onChange({
      ...draft,
      vaccines: mergeKnownVaccineSelection(draft.vaccines, value, checked),
    });
  };

  const updateCustomVaccines = (value: string) => {
    onChange({
      ...draft,
      vaccines: mergeCustomVaccines(draft.vaccines, value),
    });
  };

  const updateEpiStatus = (value: string, checked: boolean) => {
    updatePatient("epiStatus", checked ? value : "");
  };

  const updateFeedingType = (value: string, checked: boolean) => {
    updatePatient("feedingType", checked ? value : "");
  };

  const imageUrl = sourcePreviewUrl || visualization?.dataUrl;

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
            onClick={onReset}
            className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close and reset"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="min-h-0 border-b border-slate-200 bg-slate-100 lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                OCR Overlay
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {imageUrl ? (
                  <div className="relative mx-auto w-full max-w-3xl">
                    <img
                      src={imageUrl}
                      alt="Uploaded clinic record"
                      className="block w-full rounded-lg border border-slate-200 bg-white object-contain"
                    />
                  </div>
                ) : (
                  <pre className="min-h-96 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
                    {markdown || "The OCR response did not include an overlay image."}
                  </pre>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-auto">
            <div className="space-y-5 p-5">
              <section className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">Patient Details</h3>
                </div>
                <div className="grid grid-cols-1 gap-6 p-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <ClinicField label="Name" value={draft.patient.name} onChange={(value) => updatePatient("name", value)} />
                    <ClinicField label="Age" value={draft.patient.age} onChange={(value) => updatePatient("age", value)} />
                    <ClinicField label="Date of Birth" value={draft.patient.dateOfBirth} onChange={(value) => updatePatient("dateOfBirth", value)} />
                    <ClinicField label="Address" value={draft.patient.address} onChange={(value) => updatePatient("address", value)} />
                    <ClinicField label="Mother's Name" value={draft.patient.motherName} onChange={(value) => updatePatient("motherName", value)} />
                    <ClinicField label="Father's Name" value={draft.patient.fatherName} onChange={(value) => updatePatient("fatherName", value)} />
                  </div>

                  <div className="space-y-3">
                    <ClinicField label="Nutritional Status" value={draft.patient.nutritionalStatus} onChange={(value) => updatePatient("nutritionalStatus", value)} />
                    <ClinicField label="Birth Weight" value={draft.patient.birthWeight} onChange={(value) => updatePatient("birthWeight", value)} />

                    <div className="grid grid-cols-[8.5rem_1fr] gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">EPI Status</span>
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {epiStatusOptions.map((option) => (
                          <CheckOption
                            key={option}
                            label={option}
                            checked={draft.patient.epiStatus === option}
                            onChange={(checked) => updateEpiStatus(option, checked)}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-[8.5rem_1fr] gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">EPI / Vaccines</span>
                      <div className="grid grid-cols-3 gap-x-5 gap-y-2">
                        {knownVaccineOptions.map((option) => (
                          <CheckOption
                            key={option}
                            label={option}
                            checked={draft.vaccines.includes(option)}
                            onChange={(checked) => toggleVaccine(option, checked)}
                          />
                        ))}
                      </div>
                    </div>

                    <ClinicField
                      label="Other Vaccines"
                      value={getCustomVaccineText(draft.vaccines)}
                      onChange={updateCustomVaccines}
                    />

                    <div className="grid grid-cols-[8.5rem_1fr] gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Type of Feeding</span>
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {feedingOptions.map((option) => (
                          <CheckOption
                            key={option}
                            label={option}
                            checked={draft.patient.feedingType === option}
                            onChange={(checked) => updateFeedingType(option, checked)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">
                    Findings / Chief Complaint
                  </h3>
                  <Button type="button" variant="outline" className="flex items-center gap-2 px-3" onClick={addVisit}>
                    <Plus size={16} /> Row
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-100 text-center text-xs font-black uppercase tracking-wide text-slate-700">
                      <tr>
                        {visitFields.slice(0, 3).map((field) => (
                          <th key={field.key} rowSpan={2} className={`border border-slate-300 px-2 py-3 align-middle ${field.width}`}>
                            {field.label}
                          </th>
                        ))}
                        <th colSpan={2} className="border border-slate-300 px-2 py-1.5">
                          Findings / Chief Complaint
                        </th>
                        {visitFields.slice(5).map((field) => (
                          <th key={field.key} rowSpan={2} className={`border border-slate-300 px-2 py-3 align-middle ${field.width}`}>
                            {field.label}
                          </th>
                        ))}
                        <th rowSpan={2} className="w-12 border border-slate-300 px-2 py-2" />
                      </tr>
                      <tr>
                        {visitFields.slice(3, 5).map((field) => (
                          <th key={field.key} className={`border border-slate-300 px-2 py-1.5 ${field.width}`}>
                            <span className="block">{field.label}</span>
                            {field.sublabel && <span className="block">{field.sublabel}</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.visits.map((visit) => (
                        <tr key={visit.id} className="align-top">
                          {visitFields.map((field) => (
                            <td key={field.key} className="border-t border-slate-100 p-1.5">
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
            Cancel
          </Button>
          <Button type="button" className="flex items-center gap-2" onClick={onSave} disabled={isSaving}>
            <Save size={16} /> {isSaving ? "Saving..." : "Save Record"}
          </Button>
        </div>
      </div>
    </div>
  );
}
