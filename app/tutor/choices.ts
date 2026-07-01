import type { LessonChunk } from "../content/types";

// Decide whether a check question is answered by multiple-choice buttons or a
// text box, and derive the choices from existing content (no new authoring).

export type QuestionMode = { kind: "choice"; options: string[] } | { kind: "open" };

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function deriveQuestionMode(chunk: LessonChunk): QuestionMode {
  // Code-writing answers ("print(...)", "count = 5") stay as free text.
  if (/[()=]/.test(chunk.expectedAnswer)) return { kind: "open" };

  const accepted = new Set(chunk.accepted.map(normalize));
  const isYesNo =
    accepted.has("yes") ||
    accepted.has("no") ||
    /\(\s*yes\s*\/\s*no\s*\)/i.test(chunk.checkQuestion);
  if (isYesNo) return { kind: "choice", options: ["Yes", "No"] };

  // Build choices from the correct answer + one distractor per known-wrong group.
  if (chunk.commonWrongAnswers.length > 0) {
    const seen = new Set<string>();
    const options: string[] = [];
    for (const raw of [chunk.expectedAnswer, ...chunk.commonWrongAnswers.map((w) => w.answers[0])]) {
      const n = normalize(raw ?? "");
      if (n && !seen.has(n)) {
        seen.add(n);
        options.push(raw);
      }
    }
    if (options.length >= 2) return { kind: "choice", options: shuffle(options).slice(0, 4) };
  }

  return { kind: "open" };
}
