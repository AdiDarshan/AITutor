import type { CoursePack } from "../content/types";
import { assertTransition, type TutorState } from "./stateMachine";

export interface ChatMessage {
  id: string;
  role: "tutor" | "student";
  text: string;
  example?: string;
}

export interface TutorRuntimeState {
  machineState: TutorState;
  moduleIndex: number;
  lessonIndex: number;
  chunkIndex: number;
  messages: ChatMessage[];
  /** True while waiting for the student to answer the current check question. */
  awaitingAnswer: boolean;
  finished: boolean;
  /** Ordered log of states entered, for the debug view. */
  history: TutorState[];
}

export type TutorAction = { type: "SUBMIT_ANSWER"; text: string };

/** Deterministic answer matching — no AI in MVP 3. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isCorrect(accepted: string[], raw: string): boolean {
  const got = normalize(raw);
  return accepted.some((a) => normalize(a) === got);
}

function currentChunk(course: CoursePack, s: TutorRuntimeState) {
  return course.modules[s.moduleIndex].lessons[s.lessonIndex].chunks[s.chunkIndex];
}

// --- small state-building helpers (all pure) ---

function tx(s: TutorRuntimeState, to: TutorState): TutorRuntimeState {
  const next = assertTransition(s.machineState, to);
  return { ...s, machineState: next, history: [...s.history, next] };
}

function emitTutor(s: TutorRuntimeState, text: string, example?: string): TutorRuntimeState {
  return {
    ...s,
    messages: [...s.messages, { id: `m${s.messages.length}`, role: "tutor", text, example }],
  };
}

function emitStudent(s: TutorRuntimeState, text: string): TutorRuntimeState {
  return {
    ...s,
    messages: [...s.messages, { id: `m${s.messages.length}`, role: "student", text }],
  };
}

/** Walk EXPLAIN_CHUNK -> ASK_UNDERSTANDING -> ASK_MICRO_QUIZ, ending awaiting an answer. */
function presentChunk(s: TutorRuntimeState, course: CoursePack): TutorRuntimeState {
  const chunk = currentChunk(course, s);
  s = tx(s, "EXPLAIN_CHUNK");
  s = emitTutor(s, chunk.explanation, chunk.example);
  s = tx(s, "ASK_UNDERSTANDING");
  s = tx(s, "ASK_MICRO_QUIZ");
  s = emitTutor(s, chunk.checkQuestion);
  return { ...s, awaitingAnswer: true };
}

export function buildInitialState(course: CoursePack): TutorRuntimeState {
  let s: TutorRuntimeState = {
    machineState: "START_PROGRAM",
    moduleIndex: 0,
    lessonIndex: 0,
    chunkIndex: 0,
    messages: [],
    awaitingAnswer: false,
    finished: false,
    history: ["START_PROGRAM"],
  };
  s = tx(s, "INTRODUCE_MODULE");
  s = tx(s, "INTRODUCE_LESSON");
  return presentChunk(s, course);
}

/** From ADVANCE_CHUNK after a correct answer, move to the next chunk/lesson/module or end. */
function advance(s: TutorRuntimeState, course: CoursePack): TutorRuntimeState {
  const lesson = course.modules[s.moduleIndex].lessons[s.lessonIndex];
  if (s.chunkIndex + 1 < lesson.chunks.length) {
    s = { ...s, chunkIndex: s.chunkIndex + 1 };
    return presentChunk(s, course);
  }

  s = tx(s, "ADVANCE_LESSON");
  const mod = course.modules[s.moduleIndex];
  if (s.lessonIndex + 1 < mod.lessons.length) {
    s = { ...s, lessonIndex: s.lessonIndex + 1, chunkIndex: 0 };
    s = tx(s, "INTRODUCE_LESSON");
    return presentChunk(s, course);
  }

  s = tx(s, "ADVANCE_MODULE");
  if (s.moduleIndex + 1 < course.modules.length) {
    s = { ...s, moduleIndex: s.moduleIndex + 1, lessonIndex: 0, chunkIndex: 0 };
    s = tx(s, "INTRODUCE_MODULE");
    s = tx(s, "INTRODUCE_LESSON");
    return presentChunk(s, course);
  }

  s = tx(s, "END_PROGRAM");
  s = emitTutor(
    s,
    "Nice work — you wrote and reasoned about your first Python program. That's the end of this lesson. 🎉",
  );
  return { ...s, finished: true };
}

function reduce(
  s: TutorRuntimeState,
  action: TutorAction,
  course: CoursePack,
): TutorRuntimeState {
  switch (action.type) {
    case "SUBMIT_ANSWER": {
      if (!s.awaitingAnswer || s.finished) return s;
      const chunk = currentChunk(course, s);

      let st = emitStudent(s, action.text);
      st = { ...st, awaitingAnswer: false };
      st = tx(st, "EVALUATE_ANSWER");

      if (isCorrect(chunk.accepted, action.text)) {
        st = tx(st, "ADVANCE_CHUNK");
        st = emitTutor(st, chunk.correctFeedback);
        return advance(st, course);
      }

      // Wrong: hint and re-ask (no model yet; remediation loop comes in MVP 10).
      st = tx(st, "GIVE_HINT");
      st = emitTutor(st, chunk.hint);
      st = tx(st, "ASK_MICRO_QUIZ");
      return { ...st, awaitingAnswer: true };
    }
    default:
      return s;
  }
}

/** Bind a course pack to the reducer for use with useReducer. */
export function makeTutorReducer(course: CoursePack) {
  return (s: TutorRuntimeState, action: TutorAction) => reduce(s, action, course);
}
