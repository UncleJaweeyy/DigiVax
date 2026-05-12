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

  const updateVisitAt = (index: number, key: keyof Omit<ClinicVisitRow, "id">, value: string) => {
    const visit = draft.visits[index];
    if (!visit) return;
    updateVisit(visit.id, key, value);
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
                {imageUrl ? (
                  <div className="relative mx-auto w-full max-w-3xl">
                    <img
                      src={imageUrl}
                      alt="Uploaded clinic record"
                      className="block w-full rounded-lg border border-slate-200 bg-white object-contain"
                    />
                    <DocumentEditOverlay
                      draft={draft}
                      onPatientChange={updatePatient}
                      onVisitChange={updateVisitAt}
                      onVaccinesChange={updateVaccines}
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

interface DocumentEditOverlayProps {
  draft: ClinicRecordDraft;
  onPatientChange: (key: keyof ClinicPatientDetails, value: string) => void;
  onVisitChange: (index: number, key: keyof Omit<ClinicVisitRow, "id">, value: string) => void;
  onVaccinesChange: (value: string) => void;
}

function DocumentEditOverlay({
  draft,
  onPatientChange,
  onVisitChange,
  onVaccinesChange,
}: DocumentEditOverlayProps) {
  return (
    <div className="absolute inset-0 text-[10px] sm:text-xs">
      <OverlayInput left="22%" top="16.5%" width="25%" value={draft.patient.name} onChange={(value) => onPatientChange("name", value)} />
      <OverlayInput left="24%" top="18.6%" width="16%" value={draft.patient.age} onChange={(value) => onPatientChange("age", value)} />
      <OverlayInput left="26%" top="20.7%" width="18%" value={draft.patient.dateOfBirth} onChange={(value) => onPatientChange("dateOfBirth", value)} />
      <OverlayInput left="24%" top="22.8%" width="27%" value={draft.patient.address} onChange={(value) => onPatientChange("address", value)} />
      <OverlayInput left="29%" top="24.9%" width="24%" value={draft.patient.motherName} onChange={(value) => onPatientChange("motherName", value)} />
      <OverlayInput left="29%" top="27%" width="24%" value={draft.patient.fatherName} onChange={(value) => onPatientChange("fatherName", value)} />

      <OverlayInput left="67%" top="16.7%" width="17%" value={draft.patient.nutritionalStatus} onChange={(value) => onPatientChange("nutritionalStatus", value)} />
      <OverlayInput left="67%" top="18.8%" width="17%" value={draft.patient.birthWeight} onChange={(value) => onPatientChange("birthWeight", value)} />
      <OverlayInput left="67%" top="20.9%" width="21%" value={draft.patient.epiStatus} onChange={(value) => onPatientChange("epiStatus", value)} />
      <OverlayInput left="62%" top="30%" width="28%" value={draft.patient.feedingType} onChange={(value) => onPatientChange("feedingType", value)} />
      <OverlayTextarea left="69%" top="36.8%" width="14%" height="27%" value={draft.vaccines.join("\n")} onChange={onVaccinesChange} />

      {draft.visits.slice(0, 5).map((visit, index) => {
        const top = `${38 + index * 7.3}%`;
        return (
          <div key={visit.id}>
            <OverlayInput left="11%" top={top} width="11%" value={visit.date} onChange={(value) => onVisitChange(index, "date", value)} />
            <OverlayInput left="23%" top={top} width="8%" value={visit.wt} onChange={(value) => onVisitChange(index, "wt", value)} />
            <OverlayInput left="31%" top={top} width="7%" value={visit.vs} onChange={(value) => onVisitChange(index, "vs", value)} />
            <OverlayTextarea left="39%" top={top} width="15%" height="5.8%" value={visit.episode} onChange={(value) => onVisitChange(index, "episode", value)} />
            <OverlayTextarea left="55%" top={top} width="15%" height="5.8%" value={visit.dangerSigns} onChange={(value) => onVisitChange(index, "dangerSigns", value)} />
            <OverlayTextarea left="70%" top={top} width="13%" height="6.8%" value={visit.otherCc} onChange={(value) => onVisitChange(index, "otherCc", value)} />
            <OverlayTextarea left="84%" top={top} width="12%" height="6.8%" value={visit.management} onChange={(value) => onVisitChange(index, "management", value)} />
          </div>
        );
      })}
    </div>
  );
}

interface OverlayControlProps {
  left: string;
  top: string;
  width: string;
  height?: string;
  value: string;
  onChange: (value: string) => void;
}

function OverlayInput({ left, top, width, height = "2.1%", value, onChange }: OverlayControlProps) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{ left, top, width, height }}
      className="absolute rounded-sm border border-blue-400/40 bg-white/80 px-1 leading-none text-slate-950 shadow-sm outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-200"
    />
  );
}

function OverlayTextarea({ left, top, width, height = "5%", value, onChange }: OverlayControlProps) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{ left, top, width, height }}
      className="absolute resize-none rounded-sm border border-blue-400/40 bg-white/80 px-1 py-0.5 leading-tight text-slate-950 shadow-sm outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-200"
    />
  );
}
