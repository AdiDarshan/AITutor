import type { CoursePack } from "../content/types";
import type { SavedProgress } from "../storage/progressStore";
import type { StudentEvent } from "./events";
import { assertTransition, type TutorState } from "./stateMachine";
import { updateMastery } from "./mastery";

export interface ChatMessage {
  id: string;
  role: "tutor" | "student";
  text: string;
  example?: string;
  /** True for approved-explanation messages the speaker may rephrase. */
  speakable?: boolean;
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
  /** Mastery score (0..1) per lessonId. */
  mastery: Record<string, number>;
  /** Count of wrong answers per lessonId. */
  mistakes: Record<string, number>;
  /** Ordered log of states entered, for the debug view. */
  history: TutorState[];
}

export type TutorAction =
  | StudentEvent
  | { type: "RESTORE"; saved: SavedProgress }
  | { type: "RESET" };

/** Deterministic answer matching — no AI in MVP 4. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isCorrect(accepted: string[], raw: string): boolean {
  const got = normalize(raw);
  return accepted.some((a) => normalize(a) === got);
}

function currentLesson(course: CoursePack, s: TutorRuntimeState) {
  return course.modules[s.moduleIndex].lessons[s.lessonIndex];
}

function currentChunk(course: CoursePack, s: TutorRuntimeState) {
  return currentLesson(course, s).chunks[s.chunkIndex];
}

// --- small state-building helpers (all pure) ---

function tx(s: TutorRuntimeState, to: TutorState): TutorRuntimeState {
  const next = assertTransition(s.machineState, to);
  return { ...s, machineState: next, history: [...s.history, next] };
}

function emitTutor(
  s: TutorRuntimeState,
  text: string,
  example?: string,
  speakable?: boolean,
): TutorRuntimeState {
  return {
    ...s,
    messages: [
      ...s.messages,
      { id: `m${s.messages.length}`, role: "tutor", text, example, speakable },
    ],
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
  s = emitTutor(s, chunk.explanation, chunk.example, true);
  s = tx(s, "ASK_UNDERSTANDING");
  s = tx(s, "ASK_MICRO_QUIZ");
  s = emitTutor(s, chunk.checkQuestion);
  return { ...s, awaitingAnswer: true };
}

function freshState(
  moduleIndex: number,
  lessonIndex: number,
  chunkIndex: number,
  mastery: Record<string, number>,
  mistakes: Record<string, number>,
): TutorRuntimeState {
  return {
    machineState: "START_PROGRAM",
    moduleIndex,
    lessonIndex,
    chunkIndex,
    messages: [],
    awaitingAnswer: false,
    finished: false,
    mastery,
    mistakes,
    history: ["START_PROGRAM"],
  };
}

export function buildInitialState(course: CoursePack): TutorRuntimeState {
  let s = freshState(0, 0, 0, {}, {});
  s = tx(s, "INTRODUCE_MODULE");
  s = tx(s, "INTRODUCE_LESSON");
  return presentChunk(s, course);
}

/** Resume at a saved position with restored mastery/mistakes; re-presents the current chunk. */
function buildRestoredState(course: CoursePack, saved: SavedProgress): TutorRuntimeState {
  const mod = course.modules[saved.moduleIndex];
  const lesson = mod?.lessons[saved.lessonIndex];
  const chunk = lesson?.chunks[saved.chunkIndex];
  if (!mod || !lesson || !chunk) {
    // Saved position no longer valid (e.g. content changed) — start fresh.
    return buildInitialState(course);
  }

  let s = freshState(
    saved.moduleIndex,
    saved.lessonIndex,
    saved.chunkIndex,
    saved.mastery ?? {},
    saved.mistakes ?? {},
  );
  s = tx(s, "INTRODUCE_MODULE");
  s = tx(s, "INTRODUCE_LESSON");
  return presentChunk(s, course);
}

/** From ADVANCE_CHUNK after a correct answer, move to the next chunk/lesson/module or end. */
function advance(s: TutorRuntimeState, course: CoursePack): TutorRuntimeState {
  const lesson = currentLesson(course, s);
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
    case "RESET":
      return buildInitialState(course);

    case "RESTORE":
      return buildRestoredState(course, action.saved);

    // Quick-action helpers: only while awaiting an answer; they surface approved
    // content and stay at ASK_MICRO_QUIZ (no state transition, no model yet).
    case "UNDERSTANDS": {
      if (!s.awaitingAnswer || s.finished) return s;
      return emitTutor(s, "Great — go ahead and answer the check question below.");
    }

    case "CONFUSED": {
      if (!s.awaitingAnswer || s.finished) return s;
      const chunk = currentChunk(course, s);
      let st = emitTutor(s, "No problem — here's that idea again:");
      return emitTutor(st, chunk.explanation, chunk.example, true);
    }

    case "REQUEST_EXAMPLE": {
      if (!s.awaitingAnswer || s.finished) return s;
      const chunk = currentChunk(course, s);
      return chunk.example
        ? emitTutor(s, "Here's an example:", chunk.example)
        : emitTutor(s, "I don't have a separate example for this step — give the question a try and I'll help if needed.");
    }

    case "REQUEST_QUIZ": {
      if (!s.awaitingAnswer || s.finished) return s;
      return emitTutor(s, currentChunk(course, s).checkQuestion);
    }

    case "ASK_QUESTION": {
      if (!s.awaitingAnswer || s.finished) return s;
      let st = emitStudent(s, action.text);
      return emitTutor(
        st,
        "I'll be able to answer questions from the course material in a later step. For now, let's keep going — try the check question above.",
      );
    }

    case "SUBMIT_ANSWER": {
      if (!s.awaitingAnswer || s.finished) return s;
      const lessonId = currentLesson(course, s).lessonId;
      const chunk = currentChunk(course, s);

      let st = emitStudent(s, action.text);
      st = { ...st, awaitingAnswer: false };
      st = tx(st, "EVALUATE_ANSWER");

      if (isCorrect(chunk.accepted, action.text)) {
        st = {
          ...st,
          mastery: {
            ...st.mastery,
            [lessonId]: updateMastery(st.mastery[lessonId] ?? 0, "correct"),
          },
        };
        st = tx(st, "ADVANCE_CHUNK");
        st = emitTutor(st, chunk.correctFeedback);
        return advance(st, course);
      }

      // Wrong: lower mastery, count the mistake, hint and re-ask.
      st = {
        ...st,
        mastery: {
          ...st.mastery,
          [lessonId]: updateMastery(st.mastery[lessonId] ?? 0, "wrong"),
        },
        mistakes: { ...st.mistakes, [lessonId]: (st.mistakes[lessonId] ?? 0) + 1 },
      };
      st = tx(st, "GIVE_HINT");
      st = emitTutor(st, chunk.hint);
      st = tx(st, "ASK_MICRO_QUIZ");
      return { ...st, awaitingAnswer: true };
    }

    default:
      return s;
  }
}

/** Extract the persistable progress from runtime state. */
export function toSavedProgress(course: CoursePack, s: TutorRuntimeState): SavedProgress {
  return {
    programId: course.programId,
    moduleIndex: s.moduleIndex,
    lessonIndex: s.lessonIndex,
    chunkIndex: s.chunkIndex,
    mastery: s.mastery,
    mistakes: s.mistakes,
  };
}

/** Bind a course pack to the reducer for use with useReducer. */
export function makeTutorReducer(course: CoursePack) {
  return (s: TutorRuntimeState, action: TutorAction) => reduce(s, action, course);
}
