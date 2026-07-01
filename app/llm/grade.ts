// LLM grading: build a JSON-only grading prompt and safely parse the result.
// The app (reducer) decides advancement — the model only judges.

export interface GradeInput {
  question: string;
  correctAnswer: string;
  acceptedAnswers: string[];
  knownWrong: string[];
  studentAnswer: string;
}

export interface GradeResult {
  grade: "correct" | "partial" | "wrong";
  confidence: number; // 0..1
  misconception: string | null;
}

export function gradingPrompt(input: GradeInput): string {
  const accepted = input.acceptedAnswers.join(", ") || input.correctAnswer;
  const wrong = input.knownWrong.length ? input.knownWrong.join(", ") : "(none listed)";
  return `You are grading a student's short answer for a course tutor. Judge only whether the answer is right, using the rubric. Return JSON only — no other text.

Quiz question: ${input.question}
Correct answer: ${input.correctAnswer}
Also acceptable: ${accepted}
Common wrong answers: ${wrong}
Student answer: ${input.studentAnswer}

Grade "correct" only if the answer clearly means the correct answer (wording may differ).
Use "partial" if it is on the right track but incomplete. Use "wrong" otherwise.
confidence is your certainty from 0 to 1.

Return ONLY this JSON object:
{"grade":"correct|partial|wrong","confidence":0.0,"misconception":null}`;
}

/** Extract and validate the grade JSON; returns null if unparseable/invalid. */
export function parseGrade(raw: string): GradeResult | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return null;
  }

  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const grade = o.grade;
  if (grade !== "correct" && grade !== "partial" && grade !== "wrong") return null;

  let confidence = typeof o.confidence === "number" ? o.confidence : 0;
  if (Number.isNaN(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));

  const misconception = typeof o.misconception === "string" ? o.misconception : null;

  return { grade, confidence, misconception };
}
