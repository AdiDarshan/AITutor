// Answer a student's question using ONLY the current lesson chunk. If the
// chunk doesn't cover it, the tutor refuses safely (retrieval comes in MVP 12).

export interface QuestionInput {
  explanation: string;
  example?: string;
  question: string;
}

export function questionAnswerPrompt(input: QuestionInput): string {
  const material = input.example
    ? `${input.explanation}\n\nExample:\n${input.example}`
    : input.explanation;

  return `You are a course tutor. A student has paused the lesson to ask a question.

Answer the question using ONLY the lesson material below. If the material does
not contain the answer, say you don't have enough course material to answer that
yet — do not guess or use outside knowledge. Keep the answer short (1-3 sentences)
and do not ask a question back.

LESSON MATERIAL:
${material}

STUDENT QUESTION:
${input.question}`;
}
