import type { jsPDF } from "jspdf";
import type { Styles, UserOptions } from "jspdf-autotable";
import type { ClinicRecordDraft } from "@/types/clinic-record";
import type { VaccinationRecordDocument } from "@/types/records";
//import { getCrfLabelCounts, getCrfPredictionTotal } from "@/lib/records/crf-labels";

type PdfDocument = jsPDF & {
  lastAutoTable?: {
    finalY?: number;
  };
};
type AutoTable = (doc: jsPDF, options: UserOptions) => void;

export async function downloadStructuredRecordsPdf(
  records: VaccinationRecordDocument[],
  filename: string,
  title: string,
) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default as AutoTable;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" }) as PdfDocument;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const generatedAt = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  doc.setProperties({
    title,
    subject: "DigiVax structured digitalized records",
    creator: "DigiVax",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(title, margin, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 99, 115);
  doc.text(`Generated ${generatedAt}. Total records: ${records.length}`, margin, 53);
  doc.setTextColor(15, 23, 42);

  let cursorY = 78;

  records.forEach((record, index) => {
    if (index > 0) {
      doc.addPage();
      cursorY = margin;
    }

    cursorY = renderRecord(autoTable, doc, record, cursorY, margin, pageWidth, pageHeight);
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 18, { align: "right" });
  }

  doc.save(filename);
}

function renderRecord(
  autoTable: AutoTable,
  doc: PdfDocument,
  record: VaccinationRecordDocument,
  startY: number,
  margin: number,
  pageWidth: number,
  pageHeight: number,
) {
  let cursorY = startY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(record.patientName || "Unknown Patient", margin, cursorY);
  cursorY += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(record.id, margin, cursorY);
  doc.setTextColor(15, 23, 42);
  cursorY += 14;

  if (record.clinicRecord) {
    cursorY = renderClinicRecord(autoTable, doc, record.clinicRecord, cursorY, margin, pageWidth, pageHeight);
  } else {
    cursorY = renderCorrectedText(autoTable, doc, record, cursorY, margin, pageWidth, pageHeight);
  }

  return cursorY;
}

function renderClinicRecord(
  autoTable: AutoTable,
  doc: PdfDocument,
  record: ClinicRecordDraft,
  startY: number,
  margin: number,
  pageWidth: number,
  pageHeight: number,
) {
  let cursorY = startY;
  addSectionTitle(doc, "Patient Details", margin, cursorY);
  const patientRows = [
    ["Name", record.patient.name, "Nutritional Status", record.patient.nutritionalStatus],
    ["Age", record.patient.age, "Birth Weight", record.patient.birthWeight],
    ["Date of Birth", record.patient.dateOfBirth, "EPI Status", record.patient.epiStatus],
    ["Address", record.patient.address, "EPI / Vaccines", record.vaccines.join(", ")],
    ["Mother's Name", record.patient.motherName, "Type of Feeding", record.patient.feedingType],
    ["Father's Name", record.patient.fatherName, "", ""],
  ];

  autoTable(doc, {
    startY: cursorY + 8,
    body: patientRows,
    theme: "grid",
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - margin * 2,
    styles: baseCellStyle(),
    columnStyles: {
      0: { cellWidth: 90, fontStyle: "bold", fillColor: [241, 245, 249] },
      1: { cellWidth: 270 },
      2: { cellWidth: 115, fontStyle: "bold", fillColor: [241, 245, 249] },
      3: { cellWidth: "auto" },
    },
  });

  cursorY = ensureSpace(doc, getTableEndY(doc) + 22, 130, margin, pageHeight);
  addSectionTitle(doc, "Findings / Chief Complaint", margin, cursorY);
  autoTable(doc, {
    startY: cursorY + 8,
    head: [["Date", "WT", "V/S", "Episode", "Danger Signs", "Other CC", "Management"]],
    body: record.visits.map((visit) => [
      visit.date,
      visit.wt,
      visit.vs,
      visit.episode,
      visit.dangerSigns,
      visit.otherCc,
      visit.management,
    ]),
    theme: "grid",
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - margin * 2,
    styles: baseCellStyle(),
    headStyles: {
      fillColor: [226, 232, 240],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 68 },
      1: { cellWidth: 45 },
      2: { cellWidth: 55 },
      3: { cellWidth: 105 },
      4: { cellWidth: 105 },
      5: { cellWidth: 105 },
      6: { cellWidth: "auto" },
    },
  });

  return getTableEndY(doc) + 16;
}

function renderCorrectedText(
  autoTable: AutoTable,
  doc: PdfDocument,
  record: VaccinationRecordDocument,
  startY: number,
  margin: number,
  pageWidth: number,
  pageHeight: number,
) {
  const cursorY = ensureSpace(doc, startY, 120, margin, pageHeight);
  addSectionTitle(doc, "Corrected OCR Text", margin, cursorY);
  autoTable(doc, {
    startY: cursorY + 8,
    body: [[record.correctedText || "No corrected OCR text saved."]],
    theme: "grid",
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - margin * 2,
    styles: { ...baseCellStyle(), font: "courier", fontSize: 7.5 },
  });

  return getTableEndY(doc) + 16;
}



function addSectionTitle(doc: PdfDocument, title: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(title.toUpperCase(), x, y);
  doc.setTextColor(15, 23, 42);
}

function baseCellStyle(): Partial<Styles> {
  return {
    font: "helvetica",
    fontSize: 8,
    cellPadding: 4,
    lineColor: [203, 213, 225] as [number, number, number],
    lineWidth: 0.5,
    textColor: [15, 23, 42] as [number, number, number],
    overflow: "linebreak" as const,
    valign: "top" as const,
  };
}

function getTableEndY(doc: PdfDocument) {
  return doc.lastAutoTable?.finalY || 72;
}

function ensureSpace(
  doc: PdfDocument,
  cursorY: number,
  neededHeight: number,
  margin: number,
  pageHeight: number,
) {
  if (cursorY + neededHeight <= pageHeight - margin) {
    return cursorY;
  }

  doc.addPage();
  return margin;
}
