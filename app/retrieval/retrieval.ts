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
