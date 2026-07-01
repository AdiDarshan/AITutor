// MVP 13 verifier — quality & safety only (no grounding rejection, so the
// tutor may add helpful explanation). Returns whether the draft is okay to show.

export interface Verdict {
  okay: boolean;
  reason: string | null;
}

export function verifierPrompt(approved: string, draft: string): string {
  return `You are a strict reviewer checking a tutor's message before it is shown to a student.

APPROVED LESSON CONTENT (for reference):
${approved}

DRAFT TUTOR MESSAGE:
${draft}

Check ONLY for these problems:
- wrong_or_misleading: the draft says something factually wrong, or contradicts the approved content.
- too_long: the draft is much longer than a short teaching message (more than about 6 sentences).
- too_many_questions: the draft asks more than one question.

Adding helpful extra explanation or examples is ALLOWED — do not flag that.

Return ONLY this JSON:
{"wrong_or_misleading": false, "too_long": false, "too_many_questions": false, "reason": null}`;
}

/** Parse the verifier JSON. Fails OPEN (okay:true) if unparseable — a flaky
 *  verifier should not block teaching. */
export function parseVerdict(raw: string): Verdict {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { okay: true, reason: null };

  let obj: unknown;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return { okay: true, reason: null };
  }

  const o = obj as Record<string, unknown>;
  const bad =
    Boolean(o.wrong_or_misleading) ||
    Boolean(o.too_long) ||
    Boolean(o.too_many_questions);
  const reason = typeof o.reason === "string" ? o.reason : null;
  return { okay: !bad, reason };
}
