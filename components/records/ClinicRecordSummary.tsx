"use client";

import type { ClinicRecordDraft, ClinicVisitRow } from "@/types/clinic-record";

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
}

export default function ClinicRecordSummary({ record }: ClinicRecordSummaryProps) {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">Patient Details</h3>
        </div>

        <div className="grid grid-cols-1 gap-6 p-4 md:grid-cols-2">
          <div className="space-y-3">
            <SummaryField label="Name" value={record.patient.name} />
            <SummaryField label="Age" value={record.patient.age} />
            <SummaryField label="Date of Birth" value={record.patient.dateOfBirth} />
            <SummaryField label="Address" value={record.patient.address} />
            <SummaryField label="Mother's Name" value={record.patient.motherName} />
            <SummaryField label="Father's Name" value={record.patient.fatherName} />
          </div>

          <div className="space-y-3">
            <SummaryField label="Nutritional Status" value={record.patient.nutritionalStatus} />
            <SummaryField label="Birth Weight" value={record.patient.birthWeight} />

            <SummaryCheckGroup
              label="EPI Status"
              options={epiStatusOptions}
              isChecked={(option) => record.patient.epiStatus === option}
            />
            <SummaryCheckGroup
              label="EPI / Vaccines"
              options={vaccineOptions}
              isChecked={(option) => record.vaccines.includes(option)}
              columns
            />
            <SummaryCheckGroup
              label="Type of Feeding"
              options={feedingOptions}
              isChecked={(option) => record.patient.feedingType === option}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">
            Findings / Chief Complaint
          </h3>
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
                      <div className={`${field.multiline ? "min-h-24" : "min-h-10"} whitespace-pre-wrap rounded-md bg-slate-50 px-2 py-2 text-sm text-slate-800`}>
                        {visit[field.key] || ""}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="min-h-9 border-b border-slate-300 px-1 py-2 text-sm text-slate-800">
        {value || ""}
      </span>
    </div>
  );
}

function SummaryCheckGroup({
  label,
  options,
  isChecked,
  columns = false,
}: {
  label: string;
  options: string[];
  isChecked: (option: string) => boolean;
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
              readOnly
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
