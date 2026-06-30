// The tutor teaching flow as an explicit state machine.
// Normal code controls the flow; the model (added later) only handles language.

export type TutorState =
  | "START_PROGRAM"
  | "INTRODUCE_MODULE"
  | "INTRODUCE_LESSON"
  | "EXPLAIN_CHUNK"
  | "ASK_UNDERSTANDING"
  | "ASK_MICRO_QUIZ"
  | "EVALUATE_ANSWER"
  | "GIVE_HINT"
  | "REMEDIATE"
  | "ADVANCE_CHUNK"
  | "ADVANCE_LESSON"
  | "ADVANCE_MODULE"
  | "END_PROGRAM";

/** Allowed transitions. Any move not listed here is illegal and throws. */
export const TRANSITIONS: Record<TutorState, TutorState[]> = {
  START_PROGRAM: ["INTRODUCE_MODULE"],
  INTRODUCE_MODULE: ["INTRODUCE_LESSON"],
  INTRODUCE_LESSON: ["EXPLAIN_CHUNK"],
  EXPLAIN_CHUNK: ["ASK_UNDERSTANDING"],
  ASK_UNDERSTANDING: ["ASK_MICRO_QUIZ"],
  ASK_MICRO_QUIZ: ["EVALUATE_ANSWER"],
  EVALUATE_ANSWER: ["ADVANCE_CHUNK", "GIVE_HINT", "REMEDIATE"],
  GIVE_HINT: ["ASK_MICRO_QUIZ"],
  REMEDIATE: ["ASK_MICRO_QUIZ"],
  ADVANCE_CHUNK: ["EXPLAIN_CHUNK", "ADVANCE_LESSON"],
  ADVANCE_LESSON: ["INTRODUCE_LESSON", "ADVANCE_MODULE"],
  ADVANCE_MODULE: ["INTRODUCE_MODULE", "END_PROGRAM"],
  END_PROGRAM: [],
};

export function isValidTransition(from: TutorState, to: TutorState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Move from -> to, or throw if the transition is not allowed. */
export function assertTransition(from: TutorState, to: TutorState): TutorState {
  if (!isValidTransition(from, to)) {
    throw new Error(`Illegal tutor transition: ${from} -> ${to}`);
  }
  return to;
}
