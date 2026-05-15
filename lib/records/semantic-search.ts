import type { OcrExtractionMetadata, ReviewedRecordLabel } from "@/types/clinic-record";
import type { VaccinationRecordDocument } from "@/types/records";
import { getBioBertRankings } from "@/lib/records/biobert-client";
import { getCrfLabelCounts, normalizeCrfLabel } from "@/lib/records/crf-labels";
import { clinicRecordToText } from "@/lib/records/clinic-format";
import { getReviewedLabelCounts } from "@/lib/records/reviewed-labels";

export interface SemanticRecordMatch {
  record: VaccinationRecordDocument;
  score: number;
  matchedLabels: string[];
}

const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "by",
  "for",
  "from",
  "had",
  "has",
  "in",
  "is",
  "of",
  "on",
  "or",
  "patient",
  "record",
  "the",
  "to",
  "with",
]);

const conceptAliases: Record<string, string[]> = {
  PATIENT_INFORMATION: ["child", "childname", "name", "patient", "mother", "father", "address", "birth", "dob"],
  DATE: ["date", "day", "month", "year", "visit", "vaccination", "administered"],
  VACCINE: ["vaccine", "immunization", "immunisation", "bcg", "hepb", "hepa", "hep", "hepatitis", "hepatitisb", "penta", "dpt", "opv", "ipv", "pcv", "mcv", "rota", "flu", "vitamin", "am"],
  FINDINGS: ["finding", "findings", "complaint", "episode", "diarrhea", "ari", "danger", "sign", "management", "fever", "cough", "weight", "height"],
  NUTRITIONAL_STATUS: ["nutrition", "nutritional", "feeding", "breastfeeding", "birthweight", "weight", "epi"],
  HEADER: ["header", "form", "clinic", "underfive", "under", "five"],
};

export function rankVaccinationRecords(
  records: VaccinationRecordDocument[],
  queryText: string,
): SemanticRecordMatch[] {
  const queryVector = buildWeightedVector(expandQuery(queryText), 1);

  if (!queryVector.size) {
    return records.map((record) => ({ record, score: 0, matchedLabels: [] }));
  }

  return records
    .map((record) => {
      const recordVector = buildRecordVector(record);
      const score = cosineSimilarity(queryVector, recordVector);
      const lexicalScore = getLexicalScore(record, queryText);
      const matchedLabels = getMatchedLabels(record, queryVector);

      return {
        record,
        score: Number((score + lexicalScore).toFixed(4)),
        matchedLabels,
      };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || compareDatesDesc(a.record.createdAt, b.record.createdAt));
}

export async function rankVaccinationRecordsWithBioBert(
  records: VaccinationRecordDocument[],
  queryText: string,
): Promise<SemanticRecordMatch[]> {
  const bioBertResults = await getBioBertRankings(
    queryText,
    records.map((record) => ({
      id: record.id,
      text: buildSemanticEmbeddingText(
        record.clinicRecord,
        record.ocrMetadata,
        record.correctedText,
        record.reviewedLabels,
      ),
      embedding: record.semanticVector,
    })),
  );

  if (!bioBertResults) {
    return rankVaccinationRecords(records, queryText);
  }

  const fallbackMatches = rankVaccinationRecords(records, queryText);
  const fallbackById = new Map(fallbackMatches.map((match) => [match.record.id, match]));
  const bioBertScoreById = new Map(bioBertResults.map((result) => [result.id, result.score]));
  const ranked = records
    .map((record) => {
      const semanticScore = bioBertScoreById.get(record.id) || 0;
      const fallbackMatch = fallbackById.get(record.id);
      const lexicalScore = getLexicalScore(record, queryText);
      const score = semanticScore > 0
        ? semanticScore + lexicalScore
        : fallbackMatch?.score || 0;

      return {
        record,
        score: Number(score.toFixed(4)),
        matchedLabels: fallbackMatch?.matchedLabels || [],
      };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || compareDatesDesc(a.record.createdAt, b.record.createdAt));

  return ranked.length ? ranked : fallbackMatches;
}

export function buildSemanticChunks(
  clinicRecord: VaccinationRecordDocument["clinicRecord"] | undefined,
  metadata: OcrExtractionMetadata | undefined,
  correctedText = "",
  reviewedLabels: ReviewedRecordLabel[] = [],
) {
  const chunks: string[] = [];

  if (clinicRecord) {
    const patientName = clinicRecord.patient.name || "Unknown patient";

    chunks.push(`Patient information for ${patientName}.`);
    chunks.push(clinicRecordToText(clinicRecord));

    for (const visit of clinicRecord.visits) {
      const findings = [
        visit.episode && `episode ${visit.episode}`,
        visit.dangerSigns && `danger signs ${visit.dangerSigns}`,
        visit.otherCc,
        visit.management && `management ${visit.management}`,
      ]
        .filter(Boolean)
        .join(", ");
      const date = visit.date || "an unspecified date";
      const weight = visit.wt ? ` Weight: ${visit.wt}.` : "";
      const details = findings ? ` Recorded: ${findings}.` : "";

      chunks.push(`Patient ${patientName} had a clinic visit on ${date}.${weight}${details}`);
    }
  }

  const reviewedGroups = groupReviewedLabels(reviewedLabels);

  for (const [label, values] of reviewedGroups.entries()) {
    if (!values.length) continue;
    chunks.push(`reviewed ${label.toLowerCase().replace(/_/g, " ")}: ${values.slice(0, 80).join(" ")}`);
  }

  const labeledTokens = groupTokensByLabel(metadata);

  for (const [label, tokens] of labeledTokens.entries()) {
    if (!tokens.length) continue;
    chunks.push(`ocr predicted ${label.toLowerCase().replace(/_/g, " ")}: ${tokens.slice(0, 80).join(" ")}`);
  }

  if (!chunks.length && correctedText.trim()) {
    chunks.push(correctedText.trim());
  }

  return Array.from(new Set(chunks.map((chunk) => chunk.trim()).filter(Boolean))).slice(0, 80);
}

export function buildSemanticEmbeddingText(
  clinicRecord: VaccinationRecordDocument["clinicRecord"] | undefined,
  metadata: OcrExtractionMetadata | undefined,
  correctedText = "",
  reviewedLabels: ReviewedRecordLabel[] = [],
) {
  return buildSemanticChunks(clinicRecord, metadata, correctedText, reviewedLabels).join("\n");
}

function buildRecordVector(record: VaccinationRecordDocument) {
  const vector = new Map<string, number>();
  const chunks = [
    record.patientName,
    record.vaccineType,
    record.vaccinationDate,
    record.recordYear,
    record.correctedText,
    ...(record.reviewedLabels || []).flatMap((item) => [item.label, item.displayLabel, item.field, item.value]),
    ...(record.semanticChunks || []),
  ];

  addVector(vector, buildWeightedVector(chunks.join(" "), 1));

  for (const item of record.reviewedLabels || []) {
    const label = normalizeCrfLabel(item.label);
    const labelWeight = getLabelWeight(label) + 1.2;
    addVector(vector, buildWeightedVector(`${label} ${item.displayLabel} ${item.field} ${item.value}`, labelWeight));
  }

  for (const count of getReviewedLabelCounts(record.reviewedLabels)) {
    addVector(vector, buildWeightedVector(`reviewed ${count.label} ${count.displayLabel}`, Math.min(3.2, 1.5 + count.count / 8)));
  }

  for (const token of record.ocrMetadata?.tokens || []) {
    const label = normalizeCrfLabel(token.label);
    const labelWeight = getLabelWeight(label);
    addVector(vector, buildWeightedVector(`${label} ${token.text}`, labelWeight));
  }

  for (const count of getCrfLabelCounts(record.ocrMetadata)) {
    addVector(vector, buildWeightedVector(`${count.label} ${count.displayLabel}`, Math.min(2.5, 1 + count.count / 10)));
  }

  return vector;
}

function expandQuery(queryText: string) {
  const tokens = tokenize(queryText);
  const additions: string[] = [];

  for (const [label, aliases] of Object.entries(conceptAliases)) {
    if (aliases.some((alias) => tokens.includes(alias))) {
      additions.push(label, label.replace(/_/g, " "));
      additions.push(...aliases);
    }
  }

  return `${queryText} ${additions.join(" ")}`;
}

function getLexicalScore(record: VaccinationRecordDocument, queryText: string) {
  const query = queryText.trim().toLowerCase();
  if (!query) return 0;

  const haystack = [
    record.id,
    record.patientName,
    record.vaccineType,
    record.vaccinationDate,
    record.recordYear,
    record.status,
    record.correctedText,
    ...(record.reviewedLabels || []).flatMap((item) => [item.label, item.displayLabel, item.field, item.value]),
    ...(record.searchKeywords || []),
  ].join(" ").toLowerCase();

  return haystack.includes(query) ? 0.45 : 0;
}

function getMatchedLabels(record: VaccinationRecordDocument, queryVector: Map<string, number>) {
  const matches = new Set<string>();

  for (const item of record.reviewedLabels || []) {
    const label = normalizeCrfLabel(item.label);
    const terms = [
      ...tokenize(item.value),
      ...tokenize(item.field),
      ...tokenize(label),
    ];

    if (terms.some((term) => queryVector.has(term))) {
      matches.add(label);
    }
  }

  for (const token of record.ocrMetadata?.tokens || []) {
    const tokenTerms = tokenize(token.text);
    const label = normalizeCrfLabel(token.label);
    const labelTerms = tokenize(label);

    if ([...tokenTerms, ...labelTerms].some((term) => queryVector.has(term))) {
      matches.add(label);
    }
  }

  return Array.from(matches).slice(0, 4);
}

function groupTokensByLabel(metadata?: OcrExtractionMetadata) {
  const groups = new Map<string, string[]>();

  for (const token of metadata?.tokens || []) {
    const label = normalizeCrfLabel(token.label || token.section || "TEXT");
    const bucket = groups.get(label) || [];
    bucket.push(token.text);
    groups.set(label, bucket);
  }

  return groups;
}

function groupReviewedLabels(labels: ReviewedRecordLabel[]) {
  const groups = new Map<string, string[]>();

  for (const item of labels) {
    const label = normalizeCrfLabel(item.label);
    const bucket = groups.get(label) || [];
    bucket.push(item.value);
    groups.set(label, bucket);
  }

  return groups;
}

function buildWeightedVector(text: string, weight: number) {
  const vector = new Map<string, number>();

  for (const token of tokenize(text)) {
    vector.set(token, (vector.get(token) || 0) + weight);
  }

  return vector;
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function addVector(target: Map<string, number>, source: Map<string, number>) {
  for (const [term, weight] of source.entries()) {
    target.set(term, (target.get(term) || 0) + weight);
  }
}

function cosineSimilarity(left: Map<string, number>, right: Map<string, number>) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const weight of left.values()) {
    leftNorm += weight * weight;
  }

  for (const [term, weight] of right.entries()) {
    rightNorm += weight * weight;
    dot += (left.get(term) || 0) * weight;
  }

  if (!leftNorm || !rightNorm) return 0;

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function getLabelWeight(label: string) {
  if (label === "PATIENT_INFORMATION" || label === "DATE" || label === "VACCINE") return 2.4;
  if (label === "FINDINGS" || label === "NUTRITIONAL_STATUS") return 2;
  if (label === "HEADER") return 1.2;
  return 1;
}

function compareDatesDesc(left?: Date, right?: Date) {
  return (right?.getTime() || 0) - (left?.getTime() || 0);
}
