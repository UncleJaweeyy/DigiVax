import type { jsPDF } from "jspdf";
import type { Styles, UserOptions } from "jspdf-autotable";
import type { ClinicRecordDraft } from "@/types/clinic-record";
import type { VaccinationRecordDocument } from "@/types/records";


type PdfDocument = jsPDF & {
  lastAutoTable?: {
    finalY?: number;
  };
};

type AutoTable = (doc: jsPDF, options: UserOptions) => void;

const contentStartY = 132;

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
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" }) as PdfDocument;
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

  renderPdfHeader(doc, pageWidth);
  const contentStartY = 132;

  let cursorY = contentStartY;

  records.forEach((record, index) => {
    if (index > 0) {
      doc.addPage();
      renderPdfHeader(doc, pageWidth);
      cursorY = contentStartY;
    }

    cursorY = renderRecord(autoTable, doc, record, cursorY, margin, pageWidth, pageHeight);
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    if (page === 1) {
      doc.text(`Generated ${generatedAt}. Total records: ${records.length}`, margin, pageHeight - 18);
    }
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 18, { align: "right" });
  }

  doc.save(filename);
}

function renderPdfHeader(doc: PdfDocument, pageWidth: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("City Government of Legzpi", pageWidth / 2, 34, { align: "center" });
  doc.setFontSize(12);
  doc.text("CITY HEALTH DEPARTMENT", pageWidth / 2, 50, { align: "center" });
  doc.setFontSize(11);
  doc.text("Legapi City", pageWidth / 2, 66, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Under Five Clinic Record", pageWidth / 2, 88, { align: "center" });
  doc.setFontSize(9);
  doc.text("(Philhealth and Non-Philhealth)", pageWidth / 2, 102, { align: "center" });
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
  addSectionTitle(doc, "Child Details", pageWidth / 2, cursorY);
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
      0: { cellWidth: 80, fontStyle: "bold", fillColor: [241, 245, 249] },
      1: { cellWidth: 220 },
      2: { cellWidth: 100, fontStyle: "bold", fillColor: [241, 245, 249] },
      3: { cellWidth: "auto" },
    },
  });

  cursorY = ensureSpace(doc, getTableEndY(doc) + 22, 130, margin, pageHeight, pageWidth, contentStartY);
  addSectionTitle(doc, "Findings / Chief Complaint", pageWidth / 2, cursorY);
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
      0: { cellWidth: 54 },
      1: { cellWidth: 42 },
      2: { cellWidth: 48 },
      3: { cellWidth: 90 },
      4: { cellWidth: 95 },
      5: { cellWidth: 95 },
      6: { cellWidth: 100 },
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
  const cursorY = ensureSpace(doc, startY, 120, margin, pageHeight, pageWidth, contentStartY);
  addSectionTitle(doc, "Corrected OCR Text", pageWidth / 2, cursorY);
  autoTable(doc, {
    startY: cursorY + 8,
    body: [[record.correctedText || "No corrected OCR text saved."]],
    theme: "grid",
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - margin * 2,
    styles: {
      ...baseCellStyle(),
      font: "courier",
      fontSize: 7,
      cellPadding: 3,
    },
  });

  return getTableEndY(doc) + 16;
}



function addSectionTitle(doc: PdfDocument, title: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(title.toUpperCase(), x, y, { align: "center" });
  doc.setTextColor(15, 23, 42);
}

function baseCellStyle(): Partial<Styles> {
  return {
    font: "helvetica",
    fontSize: 7.5,
    cellPadding: 3,
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
  pageWidth: number,
  contentStartY: number,
) {
  if (cursorY + neededHeight <= pageHeight - margin) {
    return cursorY;
  }

  doc.addPage();
  renderPdfHeader(doc, pageWidth);
  return contentStartY;
}
