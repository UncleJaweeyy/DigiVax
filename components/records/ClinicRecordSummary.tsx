"use client";

import { Plus, Trash2 } from "lucide-react";

import { emptyVisitRow } from "@/lib/records/clinic-format";
import type { ClinicPatientDetails, ClinicRecordDraft, ClinicVisitRow } from "@/types/clinic-record";

const visitFields: Array<{
  key: keyof Omit<ClinicVisitRow, "id">;
  label: string;
  sublabel?: string;
  width: string;
  multiline?: boolean;
}> = [
  { key: "date", label: "DATE", width: "min-w-32" },
  { key: "wt", label: "WT", width: "min-w-24" },
  { key: "vs", label: "V/S", width: "min-w-24" },
  { key: "episode", label: "EPISODE", sublabel: "(DIARRHEA)", width: "min-w-40", multiline: true },
  { key: "dangerSigns", label: "DANGER SIGNS", sublabel: "(ARI)", width: "min-w-40", multiline: true },
  { key: "otherCc", label: "OTHER CC", width: "min-w-40", multiline: true },
  { key: "management", label: "MANAGEMENT", width: "min-w-48", multiline: true },
];

const epiStatusOptions = ["Complete", "Incomplete"];
const vaccineOptions = ["BCG", "DPT", "OPV", "Hepa B", "AM"];
const feedingOptions = ["BF", "Mixed", "Bot"];

interface ClinicRecordSummaryProps {
  record: ClinicRecordDraft;
  isEditing?: boolean;
  onChange?: (record: ClinicRecordDraft) => void;
}

export default function ClinicRecordSummary({ record, isEditing = false, onChange }: ClinicRecordSummaryProps) {
  const updatePatient = (key: keyof ClinicPatientDetails, value: string) => {
    onChange?.({
      ...record,
      patient: {
        ...record.patient,
        [key]: value,
      },
    });
  };

  const updateVisit = (rowId: string, key: keyof Omit<ClinicVisitRow, "id">, value: string) => {
    onChange?.({
      ...record,
      visits: record.visits.map((visit) => visit.id === rowId ? { ...visit, [key]: value } : visit),
    });
  };

  const addVisit = () => {
    onChange?.({
      ...record,
      visits: [...record.visits, emptyVisitRow(record.visits.length + 1)],
    });
  };

  const removeVisit = (rowId: string) => {
    const nextVisits = record.visits.filter((visit) => visit.id !== rowId);
    onChange?.({
      ...record,
      visits: nextVisits.length ? nextVisits : [emptyVisitRow(1)],
    });
  };

  const toggleVaccine = (value: string, checked: boolean) => {
    onChange?.({
      ...record,
      vaccines: checked
        ? Array.from(new Set([...record.vaccines, value]))
        : record.vaccines.filter((item) => item !== value),
    });
  };

  const updateEpiStatus = (value: string, checked: boolean) => {
    updatePatient("epiStatus", checked ? value : "");
  };

  const updateFeedingType = (value: string, checked: boolean) => {
    updatePatient("feedingType", checked ? value : "");
  };

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">Patient Details</h3>
        </div>

        <div className="grid grid-cols-1 gap-6 p-4 md:grid-cols-2">
          <div className="space-y-3">
            <SummaryField label="Name" value={record.patient.name} isEditing={isEditing} onChange={(value) => updatePatient("name", value)} />
            <SummaryField label="Age" value={record.patient.age} isEditing={isEditing} onChange={(value) => updatePatient("age", value)} />
            <SummaryField label="Date of Birth" value={record.patient.dateOfBirth} isEditing={isEditing} onChange={(value) => updatePatient("dateOfBirth", value)} />
            <SummaryField label="Address" value={record.patient.address} isEditing={isEditing} onChange={(value) => updatePatient("address", value)} />
            <SummaryField label="Mother's Name" value={record.patient.motherName} isEditing={isEditing} onChange={(value) => updatePatient("motherName", value)} />
            <SummaryField label="Father's Name" value={record.patient.fatherName} isEditing={isEditing} onChange={(value) => updatePatient("fatherName", value)} />
          </div>

          <div className="space-y-3">
            <SummaryField label="Nutritional Status" value={record.patient.nutritionalStatus} isEditing={isEditing} onChange={(value) => updatePatient("nutritionalStatus", value)} />
            <SummaryField label="Birth Weight" value={record.patient.birthWeight} isEditing={isEditing} onChange={(value) => updatePatient("birthWeight", value)} />

            <SummaryCheckGroup
              label="EPI Status"
              options={epiStatusOptions}
              isChecked={(option) => record.patient.epiStatus === option}
              isEditing={isEditing}
              onChange={updateEpiStatus}
            />
            <SummaryCheckGroup
              label="EPI / Vaccines"
              options={vaccineOptions}
              isChecked={(option) => record.vaccines.includes(option)}
              isEditing={isEditing}
              onChange={toggleVaccine}
              columns
            />
            <SummaryCheckGroup
              label="Type of Feeding"
              options={feedingOptions}
              isChecked={(option) => record.patient.feedingType === option}
              isEditing={isEditing}
              onChange={updateFeedingType}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">
            Findings / Chief Complaint
          </h3>
          {isEditing && (
            <button
              type="button"
              onClick={addVisit}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
            >
              <Plus size={16} /> Row
            </button>
          )}
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
                {isEditing && <th rowSpan={2} className="w-12 border border-slate-300 px-2 py-2" />}
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
              {record.visits.map((visit) => (
                <tr key={visit.id} className="align-top">
                  {visitFields.map((field) => (
                    <td key={field.key} className="border-t border-slate-100 p-1.5">
                      {isEditing ? (
                        field.multiline ? (
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
                        )
                      ) : (
                        <div className={`${field.multiline ? "min-h-24" : "min-h-10"} whitespace-pre-wrap rounded-md bg-slate-50 px-2 py-2 text-sm text-slate-800`}>
                          {visit[field.key] || ""}
                        </div>
                      )}
                    </td>
                  ))}
                  {isEditing && (
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
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryField({
  label,
  value,
  isEditing,
  onChange,
}: {
  label: string;
  value: string;
  isEditing: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {isEditing ? (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full border-0 border-b border-slate-300 bg-transparent px-1 text-sm text-slate-800 outline-none focus:border-blue-600 focus:ring-0"
        />
      ) : (
        <span className="min-h-9 border-b border-slate-300 px-1 py-2 text-sm text-slate-800">
          {value || ""}
        </span>
      )}
    </div>
  );
}

function SummaryCheckGroup({
  label,
  options,
  isChecked,
  isEditing,
  onChange,
  columns = false,
}: {
  label: string;
  options: string[];
  isChecked: (option: string) => boolean;
  isEditing: boolean;
  onChange: (option: string, checked: boolean) => void;
  columns?: boolean;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <div className={columns ? "grid grid-cols-3 gap-x-5 gap-y-2" : "flex flex-wrap gap-x-5 gap-y-2"}>
        {options.map((option) => (
          <label key={option} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={isChecked(option)}
              disabled={!isEditing}
              onChange={(event) => onChange(option, event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-100"
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
