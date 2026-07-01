// Agentic hint: the model sees the lesson content + the student's wrong answer
// and crafts a guiding hint WITHOUT revealing the answer.

export interface HintInput {
  explanation: string;
  example?: string;
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  /** Authored guidance for a known misconception, if any. */
  misconceptionHint?: string;
  /** How many times the student has now missed this question. */
  attempt: number;
}

export function hintPrompt(input: HintInput): string {
  const material = input.example
    ? `${input.explanation}\n\nExample:\n${input.example}`
    : input.explanation;
  const misconception = input.misconceptionHint
    ? `\nLikely misunderstanding: ${input.misconceptionHint}`
    : "";
  const escalate =
    input.attempt >= 2
      ? "\nThe student has missed this more than once — first restate the key idea in one very simple sentence, then give the nudge."
      : "";

  return `You are a patient, encouraging tutor. The student answered a check question incorrectly. Give a SHORT hint that nudges them toward the right idea.

Rules:
- Use ONLY the lesson content below. Do not add new facts.
- Do NOT reveal or state the correct answer — guide them to reach it themselves.
- 1-3 short sentences. Do not ask a question. Plain text only.${escalate}

LESSON CONTENT:
${material}

QUESTION: ${input.question}
CORRECT ANSWER (never reveal this): ${input.correctAnswer}
STUDENT'S ANSWER: ${input.studentAnswer}${misconception}`;
}
