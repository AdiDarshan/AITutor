import type { CoursePack } from "../content/types";

// MVP 12: simple keyword retrieval over the course's chunks. No embeddings /
// vector DB / server search yet (that's MVP 15).

export interface SourceChunk {
  id: string;
  label: string;
  text: string;
}

const STOP = new Set([
  "the", "a", "an", "is", "are", "do", "does", "of", "to", "in", "on", "and", "or",
  "it", "that", "this", "what", "how", "why", "when", "which", "for", "with", "you",
  "your", "we", "i", "can", "be", "as", "at", "by", "from", "if", "so", "not",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** Flatten every lesson chunk into a searchable source chunk with a label. */
export function buildCorpus(course: CoursePack): SourceChunk[] {
  const out: SourceChunk[] = [];
  course.modules.forEach((m) =>
    m.lessons.forEach((l) =>
      l.chunks.forEach((c, i) => {
        const text = c.example ? `${c.explanation} ${c.example}` : c.explanation;
        out.push({ id: c.chunkId, label: `${l.title} · step ${i + 1}`, text });
      }),
    ),
  );
  return out;
}

/** Score chunks by keyword overlap with the query; return the top matches. */
export function keywordSearch(
  corpus: SourceChunk[],
  query: string,
  topK = 3,
): SourceChunk[] {
  const q = new Set(tokenize(query));
  if (q.size === 0) return [];

  const scored = corpus.map((c) => {
    const terms = new Set(tokenize(c.text));
    let score = 0;
    q.forEach((t) => {
      if (terms.has(t)) score += 1;
    });
    return { chunk: c, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}

// --- Hybrid retrieval (keyword + precomputed embeddings) -----------------

export interface CourseEmbeddings {
  model: string;
  dim: number;
  vectors: Record<string, number[]>;
}

/** Dot product of two normalized vectors (= cosine similarity). */
export function cosineSim(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

/** Combine embedding similarity with keyword overlap. Falls back to pure
 *  keyword search when the query vector or embeddings are unavailable. */
export function hybridSearch(
  corpus: SourceChunk[],
  query: string,
  queryVec: number[] | null,
  embeddings: CourseEmbeddings | null,
  topK = 3,
): SourceChunk[] {
  if (!queryVec || !embeddings) return keywordSearch(corpus, query, topK);

  const q = new Set(tokenize(query));
  const scored = corpus.map((c) => {
    const vec = embeddings.vectors[c.id];
    const emb = vec ? cosineSim(queryVec, vec) : 0;
    const terms = new Set(tokenize(c.text));
    let overlap = 0;
    q.forEach((t) => {
      if (terms.has(t)) overlap += 1;
    });
    const kw = q.size ? overlap / q.size : 0;
    return { chunk: c, emb, overlap, score: emb + 0.3 * kw };
  });

  return scored
    .filter((s) => s.emb >= 0.25 || s.overlap > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}

// Fetch + cache precomputed embeddings (client-side).
const embeddingsCache = new Map<string, CourseEmbeddings | null>();

export async function loadEmbeddings(programId: string): Promise<CourseEmbeddings | null> {
  if (embeddingsCache.has(programId)) return embeddingsCache.get(programId) ?? null;
  try {
    const res = await fetch(`/embeddings/${programId}.json`);
    const data = res.ok ? ((await res.json()) as CourseEmbeddings) : null;
    embeddingsCache.set(programId, data);
    return data;
  } catch {
    embeddingsCache.set(programId, null);
    return null;
  }
}
