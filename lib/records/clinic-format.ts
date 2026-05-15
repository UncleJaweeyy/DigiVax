import type { ClinicRecordDraft, ClinicVisitRow } from "@/types/clinic-record";
import { isLikelyVaccineTerm, splitVaccineText } from "@/lib/records/vaccines";

export function emptyClinicRecordDraft(): ClinicRecordDraft {
  return {
    patient: {
      name: "",
      age: "",
      dateOfBirth: "",
      address: "",
      motherName: "",
      fatherName: "",
      nutritionalStatus: "",
      birthWeight: "",
      epiStatus: "",
      feedingType: "",
    },
    vaccines: [],
    visits: [emptyVisitRow()],
  };
}

export function normalizeClinicRecordDraft(input?: Partial<ClinicRecordDraft>): ClinicRecordDraft {
  const base = emptyClinicRecordDraft();
  const visits = input?.visits?.length
    ? input.visits.map((visit, index) => ({
        ...emptyVisitRow(index + 1),
        ...visit,
        id: visit.id || `row-${index + 1}`,
      }))
    : base.visits;

  return {
    patient: {
      ...base.patient,
      ...input?.patient,
    },
    vaccines: Array.isArray(input?.vaccines) ? input.vaccines : [],
    visits,
  };
}

export function clinicRecordToText(record: ClinicRecordDraft) {
  const patient = record.patient;
  const vaccineType = record.vaccines.join(", ") || collectVisitVaccines(record.visits);
  const firstDate = record.visits.find((visit) => visit.date.trim())?.date || "";

  const lines = [
    "Clinic Format: Under Five Clinic Record",
    `Name: ${patient.name}`,
    `Age: ${patient.age}`,
    `Date of Birth: ${patient.dateOfBirth}`,
    `Address: ${patient.address}`,
    `Mother's Name: ${patient.motherName}`,
    `Father's Name: ${patient.fatherName}`,
    `Nutritional Status: ${patient.nutritionalStatus}`,
    `Birth Weight: ${patient.birthWeight}`,
    `EPI Status: ${patient.epiStatus}`,
    `Type of Feeding: ${patient.feedingType}`,
    `Vaccine Type: ${vaccineType}`,
    `Date: ${firstDate}`,
    "",
    "Findings / Chief Complaint",
    "DATE | WT | V/S | EPISODE | DANGER SIGNS | OTHER CC | MANAGEMENT",
    ...record.visits.map((visit) => [
      visit.date,
      visit.wt,
      visit.vs,
      visit.episode,
      visit.dangerSigns,
      visit.otherCc,
      visit.management,
    ].map(normalizeCell).join(" | ")),
  ];

  return lines.join("\n").trim();
}

export function clinicRecordFromText(text: string): ClinicRecordDraft {
  const draft = emptyClinicRecordDraft();
  draft.patient.name = findLineValue(text, "Name");
  draft.patient.age = findLineValue(text, "Age");
  draft.patient.dateOfBirth = findLineValue(text, "Date of Birth");
  draft.patient.address = findLineValue(text, "Address");
  draft.patient.motherName = findLineValue(text, "Mother's Name");
  draft.patient.fatherName = findLineValue(text, "Father's Name");
  draft.patient.nutritionalStatus = findLineValue(text, "Nutritional Status");
  draft.patient.birthWeight = findLineValue(text, "Birth Weight");
  draft.patient.epiStatus = findLineValue(text, "EPI Status");
  draft.patient.feedingType = findLineValue(text, "Type of Feeding");
  draft.vaccines = splitVaccineText(findLineValue(text, "Vaccine Type"));
  draft.visits = parseVisitRows(text);
  return draft;
}

export function emptyVisitRow(index = Date.now()): ClinicVisitRow {
  return {
    id: `row-${index}`,
    date: "",
    wt: "",
    vs: "",
    episode: "",
    dangerSigns: "",
    otherCc: "",
    management: "",
  };
}

function findLineValue(text: string, label: string) {
  const pattern = new RegExp(`^${escapeRegExp(label)}\\s*:\\s*(.+)$`, "im");
  return text.match(pattern)?.[1]?.trim() || "";
}

function parseVisitRows(text: string) {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /date\s*\|\s*wt\s*\|\s*v\/s/i.test(line));

  if (headerIndex < 0) {
    return [emptyVisitRow(1)];
  }

  const visits = lines
    .slice(headerIndex + 1)
    .map((line, index) => {
      const cells = line.split("|").map((cell) => cell.trim());
      if (cells.length < 7 || cells.every((cell) => !cell)) {
        return null;
      }

      return {
        ...emptyVisitRow(index + 1),
        date: cells[0] || "",
        wt: cells[1] || "",
        vs: cells[2] || "",
        episode: cells[3] || "",
        dangerSigns: cells[4] || "",
        otherCc: cells[5] || "",
        management: cells.slice(6).join(" | ") || "",
      };
    })
    .filter((visit): visit is ClinicVisitRow => Boolean(visit));

  return visits.length ? visits : [emptyVisitRow(1)];
}

function collectVisitVaccines(visits: ClinicVisitRow[]) {
  return Array.from(
    new Set(
      visits
        .flatMap((visit) => splitVaccineText(visit.otherCc))
        .filter(isLikelyVaccineTerm)
        .filter(Boolean),
    ),
  ).join(", ");
}

function normalizeCell(value: string) {
  return value.replace(/\s*\n+\s*/g, " / ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
