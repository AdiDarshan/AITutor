// Structured student events. Quick-action buttons dispatch these instead of
// raw text, so the engine controls the main path (no AI text classification).

export type StudentEvent =
  | { type: "UNDERSTANDS" }
  | { type: "CONFUSED" }
  | { type: "REQUEST_EXAMPLE" }
  | { type: "REQUEST_QUIZ" }
  | { type: "ASK_QUESTION"; text: string }
  | { type: "SUBMIT_ANSWER"; text: string };
