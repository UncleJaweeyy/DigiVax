import { auth } from "@/lib/firebase/client";

interface BioBertEmbedResponse {
  embedding?: number[];
  model?: string;
}

interface BioBertRankResponse {
  results?: Array<{
    id?: string;
    score?: number;
  }>;
  model?: string;
}

export interface BioBertEmbeddingResult {
  vector: number[];
  model: string;
}

export interface BioBertRankInput {
  id: string;
  text: string;
  embedding?: number[];
}

export interface BioBertRankResult {
  id: string;
  score: number;
}

export async function getBioBertEmbedding(text: string): Promise<BioBertEmbeddingResult | null> {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return null;
  }

  try {
    const token = await auth.currentUser?.getIdToken();

    if (!token) {
      return null;
    }

    const response = await fetch("/api/semantic-search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task: "embed",
        text: trimmedText,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json().catch(() => null) as BioBertEmbedResponse | null;
    const vector = Array.isArray(payload?.embedding)
      ? payload.embedding.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      : [];

    if (!vector.length) {
      return null;
    }

    return {
      vector,
      model: payload?.model || "BioBERT",
    };
  } catch {
    return null;
  }
}

export async function getBioBertRankings(
  query: string,
  records: BioBertRankInput[],
): Promise<BioBertRankResult[] | null> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery || !records.length) {
    return null;
  }

  try {
    const token = await auth.currentUser?.getIdToken();

    if (!token) {
      return null;
    }

    const response = await fetch("/api/semantic-search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task: "rank",
        query: trimmedQuery,
        records: records.slice(0, 200),
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json().catch(() => null) as BioBertRankResponse | null;
    const results = Array.isArray(payload?.results)
      ? payload.results
          .filter((item): item is { id: string; score: number } => (
            typeof item.id === "string"
            && typeof item.score === "number"
            && Number.isFinite(item.score)
          ))
      : [];

    return results.length ? results : null;
  } catch {
    return null;
  }
}
