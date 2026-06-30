// Lightweight grounding guard — a cheap interim check before the full LLM
// verifier in MVP 13. Returns cleaned output, or null if it looks ungrounded
// (the caller then falls back to the approved text).

const META_FLAGS = [
  "lesson material",
  "explained in simple",
  "here is the lesson",
  "here is the",
  "as a tutor",
  "as an ai",
  "i cannot",
  "i'm sorry",
  "i am sorry",
  "sure!",
  "sure,",
];

export function groundOrNull(approved: string, raw: string): string | null {
  let out = raw.trim();

  // Strip wrapping quotes the model sometimes adds.
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }

  if (!out) return null;

  const lower = out.toLowerCase();
  if (META_FLAGS.some((flag) => lower.includes(flag))) return null;

  // Much longer than the source usually means rambling or invented content.
  const maxLen = Math.max(400, approved.length * 4);
  if (out.length > maxLen) return null;

  return out;
}
