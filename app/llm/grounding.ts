// Light cleanup of raw model output. Quality gating (too long / wrong /
// too many questions) is handled by the verifier (see verify.ts).

export function cleanOutput(raw: string): string | null {
  let out = raw.trim();

  // Strip wrapping quotes the model sometimes adds.
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }

  return out || null;
}
