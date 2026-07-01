import type { CoursePack, LessonChunk } from "../content/types";
import type { StudentEvent } from "./events";
import type { GradeResult } from "../llm/grade";
import { assertTransition, type TutorState } from "./stateMachine";
import { updateMastery } from "./mastery";

// The lesson renders as a stack of items. A question item mutates in place
// (active -> done) so it reads as a single slide with inline actions, not a chat.
export type LessonItem =
  | { id: string; kind: "content"; text: string; example?: string; speakable?: boolean }
  | { id: string; kind: "ai"; text: string; example?: string; speakable?: boolean; sources?: string[] }
  | { id: string; kind: "note"; text: string }
  | {
      id: string;
      kind: "question";
      moduleIndex: number;
      lessonIndex: number;
      chunkIndex: number;
      prompt: string;
      status: "active" | "done";
      answer?: string;
      correct?: string;
      hint?: string;
      wrong?: string;
    }
  | { id: string; kind: "done" };

export interface TutorRuntimeState {
  machineState: TutorState;
  moduleIndex: number;
  lessonIndex: number;
  chunkIndex: number;
  items: LessonItem[];
  awaitingAnswer: boolean;
  grading: boolean;
  pendingAnswer: string | null;
  chunkAttempts: number;
  hinting: boolean;
  lastWrongAnswer: string | null;
  answeringQuestion: boolean;
  pendingQuestion: string | null;
  finished: boolean;
  mastery: Record<string, number>;
  mistakes: Record<string, number>;
  history: TutorState[];
  /** Monotonic counter for stable item ids. */
  seq: number;
}

export type TutorAction =
  | StudentEvent
  | { type: "APPLY_GRADE"; modelGrade: GradeResult | null }
  | { type: "APPLY_HINT"; text: string }
  | { type: "ANSWER_QUESTION"; text: string; sources: string[] }
  | { type: "RESET" };

export interface ReducerOptions {
  singleLesson?: boolean;
  startModule?: number;
  startLesson?: number;
}

// --- pure helpers ---

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isCorrect(accepted: string[], raw: string): boolean {
  const got = normalize(raw);
  return accepted.some((a) => normalize(a) === got);
}

function matchWrongHint(
  wrongs: { answers: string[]; hint: string }[],
  raw: string,
): string | null {
  const got = normalize(raw);
  const hit = wrongs.find((w) => w.answers.some((a) => normalize(a) === got));
  return hit ? hit.hint : null;
}

export function knownWrongHint(chunk: LessonChunk, answer: string): string | null {
  return matchWrongHint(chunk.commonWrongAnswers, answer);
}

export function staticHint(chunk: LessonChunk, answer: string): string {
  return matchWrongHint(chunk.commonWrongAnswers, answer) ?? chunk.hint;
}

function currentLesson(course: CoursePack, s: TutorRuntimeState) {
  return course.modules[s.moduleIndex].lessons[s.lessonIndex];
}

function currentChunk(course: CoursePack, s: TutorRuntimeState) {
  return currentLesson(course, s).chunks[s.chunkIndex];
}

function tx(s: TutorRuntimeState, to: TutorState): TutorRuntimeState {
  const next = assertTransition(s.machineState, to);
  return { ...s, machineState: next, history: [...s.history, next] };
}

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

function push(s: TutorRuntimeState, item: WithoutId<LessonItem>): TutorRuntimeState {
  const id = `i${s.seq}`;
  return { ...s, seq: s.seq + 1, items: [...s.items, { ...item, id } as LessonItem] };
}

/** Update the last still-active question item. */
function updateActiveQuestion(
  s: TutorRuntimeState,
  patch: Partial<Extract<LessonItem, { kind: "question" }>>,
): TutorRuntimeState {
  let done = false;
  const items = [...s.items];
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!done && it.kind === "question" && it.status === "active") {
      items[i] = { ...it, ...patch };
      done = true;
    }
  }
  return { ...s, items };
}

/** Walk EXPLAIN_CHUNK -> ASK_UNDERSTANDING -> ASK_MICRO_QUIZ; push a content + active question. */
function presentChunk(s: TutorRuntimeState, course: CoursePack): TutorRuntimeState {
  const chunk = currentChunk(course, s);
  s = tx(s, "EXPLAIN_CHUNK");
  s = push(s, { kind: "content", text: chunk.explanation, example: chunk.example, speakable: true });
  s = tx(s, "ASK_UNDERSTANDING");
  s = tx(s, "ASK_MICRO_QUIZ");
  s = push(s, {
    kind: "question",
    moduleIndex: s.moduleIndex,
    lessonIndex: s.lessonIndex,
    chunkIndex: s.chunkIndex,
    prompt: chunk.checkQuestion,
    status: "active",
  });
  return { ...s, awaitingAnswer: true, chunkAttempts: 0 };
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
    items: [],
    awaitingAnswer: false,
    grading: false,
    pendingAnswer: null,
    chunkAttempts: 0,
    hinting: false,
    lastWrongAnswer: null,
    answeringQuestion: false,
    pendingQuestion: null,
    finished: false,
    mastery,
    mistakes,
    history: ["START_PROGRAM"],
    seq: 0,
  };
}

export function buildInitialState(
  course: CoursePack,
  moduleIndex = 0,
  lessonIndex = 0,
): TutorRuntimeState {
  let s = freshState(moduleIndex, lessonIndex, 0, {}, {});
  s = tx(s, "INTRODUCE_MODULE");
  s = tx(s, "INTRODUCE_LESSON");
  return presentChunk(s, course);
}

/** From ADVANCE_CHUNK after a correct answer, move on or end. */
function advance(s: TutorRuntimeState, course: CoursePack, singleLesson = false): TutorRuntimeState {
  const lesson = currentLesson(course, s);
  if (s.chunkIndex + 1 < lesson.chunks.length) {
    s = { ...s, chunkIndex: s.chunkIndex + 1 };
    return presentChunk(s, course);
  }

  if (singleLesson) {
    s = tx(s, "ADVANCE_LESSON");
    s = tx(s, "ADVANCE_MODULE");
    s = tx(s, "END_PROGRAM");
    s = push(s, { kind: "done" });
    return { ...s, finished: true };
  }

  s = tx(s, "ADVANCE_LESSON");
  const mod = course.modules[s.moduleIndex];
  if (s.lessonIndex + 1 < mod.lessons.length) {
    s = { ...s, lessonIndex: s.lessonIndex + 1, chunkIndex: 0 };
    s = tx(s, "INTRODUCE_LESSON");
    s = push(s, { kind: "note", text: `Next up: ${currentLesson(course, s).title}` });
    return presentChunk(s, course);
  }

  s = tx(s, "ADVANCE_MODULE");
  if (s.moduleIndex + 1 < course.modules.length) {
    s = { ...s, moduleIndex: s.moduleIndex + 1, lessonIndex: 0, chunkIndex: 0 };
    s = tx(s, "INTRODUCE_MODULE");
    s = tx(s, "INTRODUCE_LESSON");
    s = push(s, { kind: "note", text: `Next up: ${currentLesson(course, s).title}` });
    return presentChunk(s, course);
  }

  s = tx(s, "END_PROGRAM");
  s = push(s, { kind: "done" });
  return { ...s, finished: true };
}

function reduce(
  s: TutorRuntimeState,
  action: TutorAction,
  course: CoursePack,
  opts: Required<ReducerOptions>,
): TutorRuntimeState {
  switch (action.type) {
    case "RESET":
      return buildInitialState(course, opts.startModule, opts.startLesson);

    case "UNDERSTANDS": {
      if (!s.awaitingAnswer || s.finished) return s;
      return push(s, { kind: "ai", text: "Great — go ahead and answer the check question below." });
    }

    case "CONFUSED": {
      if (!s.awaitingAnswer || s.finished) return s;
      const chunk = currentChunk(course, s);
      return push(s, { kind: "ai", text: chunk.explanation, example: chunk.example, speakable: true });
    }

    case "REQUEST_EXAMPLE": {
      if (!s.awaitingAnswer || s.finished) return s;
      const chunk = currentChunk(course, s);
      return chunk.example
        ? push(s, { kind: "ai", text: "Here's an example:", example: chunk.example })
        : push(s, {
            kind: "ai",
            text: "I don't have a separate example for this step — give the question a try and I'll help if needed.",
          });
    }

    case "REQUEST_QUIZ":
      return s; // question is already visible in the stack

    case "ASK_QUESTION": {
      if (!s.awaitingAnswer || s.finished || s.grading || s.answeringQuestion) return s;
      return { ...s, answeringQuestion: true, pendingQuestion: action.text };
    }

    case "ANSWER_QUESTION": {
      if (!s.answeringQuestion) return s;
      const st = push(s, {
        kind: "ai",
        text: action.text,
        sources: action.sources.length ? action.sources : undefined,
      });
      return { ...st, answeringQuestion: false, pendingQuestion: null };
    }

    case "SUBMIT_ANSWER": {
      if (!s.awaitingAnswer || s.finished) return s;
      return tx({ ...s, awaitingAnswer: false, grading: true, pendingAnswer: action.text }, "EVALUATE_ANSWER");
    }

    case "APPLY_GRADE": {
      if (s.machineState !== "EVALUATE_ANSWER" || s.pendingAnswer == null) return s;
      const answer = s.pendingAnswer;
      const lessonId = currentLesson(course, s).lessonId;
      const chunk = currentChunk(course, s);

      const known = matchWrongHint(chunk.commonWrongAnswers, answer);
      let outcome: "correct" | "partial" | "wrong";
      if (isCorrect(chunk.accepted, answer)) outcome = "correct";
      else if (known !== null) outcome = "wrong";
      else if (action.modelGrade) {
        const g = action.modelGrade;
        if (g.grade === "correct" && g.confidence >= 0.7) outcome = "correct";
        else if (g.grade === "partial") outcome = "partial";
        else outcome = "wrong";
      } else outcome = "wrong";

      let st: TutorRuntimeState = { ...s, grading: false, pendingAnswer: null };

      if (outcome === "correct") {
        st = {
          ...st,
          mastery: { ...st.mastery, [lessonId]: updateMastery(st.mastery[lessonId] ?? 0, "correct") },
        };
        st = updateActiveQuestion(st, {
          status: "done",
          answer,
          correct: chunk.correctFeedback,
          wrong: undefined,
        });
        st = tx(st, "ADVANCE_CHUNK");
        return advance(st, course, opts.singleLesson);
      }

      const attempts = st.chunkAttempts + 1;
      st = {
        ...st,
        chunkAttempts: attempts,
        mastery: { ...st.mastery, [lessonId]: updateMastery(st.mastery[lessonId] ?? 0, outcome) },
        mistakes:
          outcome === "wrong"
            ? { ...st.mistakes, [lessonId]: (st.mistakes[lessonId] ?? 0) + 1 }
            : st.mistakes,
      };
      st = updateActiveQuestion(st, { wrong: answer });
      st = tx(st, attempts >= 2 ? "REMEDIATE" : "GIVE_HINT");
      return { ...st, hinting: true, lastWrongAnswer: answer };
    }

    case "APPLY_HINT": {
      if (!s.hinting) return s;
      let st = updateActiveQuestion(s, { hint: action.text });
      st = tx(st, "ASK_MICRO_QUIZ");
      return { ...st, hinting: false, lastWrongAnswer: null, awaitingAnswer: true };
    }

    default:
      return s;
  }
}

export function makeTutorReducer(course: CoursePack, opts: ReducerOptions = {}) {
  const full: Required<ReducerOptions> = {
    singleLesson: opts.singleLesson ?? false,
    startModule: opts.startModule ?? 0,
    startLesson: opts.startLesson ?? 0,
  };
  return (s: TutorRuntimeState, action: TutorAction) => reduce(s, action, course, full);
}
