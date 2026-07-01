import type { CoursePack, LessonChunk } from "../content/types";
import type { StudentEvent } from "./events";
import type { GradeResult } from "../llm/grade";
import { assertTransition, type TutorState } from "./stateMachine";
import { updateMastery } from "./mastery";

export interface ChatMessage {
  id: string;
  role: "tutor" | "student";
  text: string;
  example?: string;
  /** True for approved-explanation messages the speaker may rephrase. */
  speakable?: boolean;
  /** Source labels to show under a retrieval-grounded answer. */
  sources?: string[];
}

export interface TutorRuntimeState {
  machineState: TutorState;
  moduleIndex: number;
  lessonIndex: number;
  chunkIndex: number;
  messages: ChatMessage[];
  /** True while waiting for the student to answer the current check question. */
  awaitingAnswer: boolean;
  /** True while an answer is being graded (async LLM call in flight). */
  grading: boolean;
  /** The answer awaiting a grade. */
  pendingAnswer: string | null;
  /** Wrong/partial attempts on the current chunk (resets when a chunk starts). */
  chunkAttempts: number;
  /** True while the model is crafting a hint for a wrong answer. */
  hinting: boolean;
  /** The wrong answer a hint is being generated for. */
  lastWrongAnswer: string | null;
  /** True while answering a student question (async LLM call in flight). */
  answeringQuestion: boolean;
  /** The question awaiting an answer. */
  pendingQuestion: string | null;
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
  | { type: "APPLY_GRADE"; modelGrade: GradeResult | null }
  | { type: "APPLY_HINT"; text: string }
  | { type: "ANSWER_QUESTION"; text: string; sources: string[] }
  | { type: "RESET" };

/** Deterministic answer matching — no AI in MVP 4. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isCorrect(accepted: string[], raw: string): boolean {
  const got = normalize(raw);
  return accepted.some((a) => normalize(a) === got);
}

/** Deterministic grading: a targeted hint if the wrong answer is a known one, else null. */
function matchWrongHint(
  wrongs: { answers: string[]; hint: string }[],
  raw: string,
): string | null {
  const got = normalize(raw);
  const hit = wrongs.find((w) => w.answers.some((a) => normalize(a) === got));
  return hit ? hit.hint : null;
}

/** The authored hint for a wrong answer (specific if known, else the generic one).
 *  Used as the fallback when the model hint is unavailable. */
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
  sources?: string[],
): TutorRuntimeState {
  return {
    ...s,
    messages: [
      ...s.messages,
      { id: `m${s.messages.length}`, role: "tutor", text, example, speakable, sources },
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
    messages: [],
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

export interface ReducerOptions {
  /** End after the starting lesson instead of advancing to the next one. */
  singleLesson?: boolean;
  startModule?: number;
  startLesson?: number;
}

/** From ADVANCE_CHUNK after a correct answer, move to the next chunk/lesson/module or end. */
function advance(
  s: TutorRuntimeState,
  course: CoursePack,
  singleLesson = false,
): TutorRuntimeState {
  const lesson = currentLesson(course, s);
  if (s.chunkIndex + 1 < lesson.chunks.length) {
    s = { ...s, chunkIndex: s.chunkIndex + 1 };
    return presentChunk(s, course);
  }

  // Lesson finished — post a quick progress summary before moving on.
  const doneMistakes = s.mistakes[lesson.lessonId] ?? 0;
  const steps = lesson.chunks.length;
  s = emitTutor(
    s,
    `📊 Lesson complete — ${lesson.title}. You worked through all ${steps} steps` +
      (doneMistakes === 0
        ? " with no mistakes. 🌟"
        : ` with ${doneMistakes} mistake${doneMistakes > 1 ? "s" : ""}.`),
  );

  // Single-lesson mode: end here (return to the lesson list) via a valid path.
  if (singleLesson) {
    s = tx(s, "ADVANCE_LESSON");
    s = tx(s, "ADVANCE_MODULE");
    s = tx(s, "END_PROGRAM");
    return { ...s, finished: true };
  }

  s = tx(s, "ADVANCE_LESSON");
  const mod = course.modules[s.moduleIndex];
  if (s.lessonIndex + 1 < mod.lessons.length) {
    s = { ...s, lessonIndex: s.lessonIndex + 1, chunkIndex: 0 };
    s = tx(s, "INTRODUCE_LESSON");
    s = emitTutor(s, `That lesson's done — nice! Next up: ${currentLesson(course, s).title}.`);
    return presentChunk(s, course);
  }

  s = tx(s, "ADVANCE_MODULE");
  if (s.moduleIndex + 1 < course.modules.length) {
    s = { ...s, moduleIndex: s.moduleIndex + 1, lessonIndex: 0, chunkIndex: 0 };
    s = tx(s, "INTRODUCE_MODULE");
    s = tx(s, "INTRODUCE_LESSON");
    const m = course.modules[s.moduleIndex];
    s = emitTutor(s, `New module: ${m.title}. Next up: ${currentLesson(course, s).title}.`);
    return presentChunk(s, course);
  }

  s = tx(s, "END_PROGRAM");
  s = emitTutor(s, "🎉 That's the end of this course — great work!");
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
      if (!s.awaitingAnswer || s.finished || s.grading || s.answeringQuestion) return s;
      // Interrupt: record the question and let the component answer it from the
      // current chunk. The teaching state machine is untouched (we return to it).
      const st = emitStudent(s, action.text);
      return { ...st, answeringQuestion: true, pendingQuestion: action.text };
    }

    case "ANSWER_QUESTION": {
      if (!s.answeringQuestion) return s;
      let st = emitTutor(
        s,
        action.text,
        undefined,
        false,
        action.sources.length ? action.sources : undefined,
      );
      // Return to exactly where we were in the lesson.
      st = emitTutor(st, `Back to where we were — ${currentChunk(course, s).checkQuestion}`);
      return { ...st, answeringQuestion: false, pendingQuestion: null };
    }

    case "SUBMIT_ANSWER": {
      if (!s.awaitingAnswer || s.finished) return s;
      // Record the answer and enter grading; the component calls the LLM grader
      // and then dispatches APPLY_GRADE.
      let st = emitStudent(s, action.text);
      st = { ...st, awaitingAnswer: false, grading: true, pendingAnswer: action.text };
      return tx(st, "EVALUATE_ANSWER");
    }

    case "APPLY_GRADE": {
      if (s.machineState !== "EVALUATE_ANSWER" || s.pendingAnswer == null) return s;
      const answer = s.pendingAnswer;
      const lessonId = currentLesson(course, s).lessonId;
      const chunk = currentChunk(course, s);

      // Decide the outcome, with deterministic checks taking priority over the model:
      //  - an exact accepted match is always correct (model can't reject it),
      //  - a known wrong answer is always wrong (a flaky model can't pass it),
      //  - otherwise trust the model when confident; else fall back to "wrong".
      // The APP decides advancement, not the model.
      const knownWrongHint = matchWrongHint(chunk.commonWrongAnswers, answer);
      let outcome: "correct" | "partial" | "wrong";
      if (isCorrect(chunk.accepted, answer)) {
        outcome = "correct";
      } else if (knownWrongHint !== null) {
        outcome = "wrong";
      } else if (action.modelGrade) {
        const g = action.modelGrade;
        if (g.grade === "correct" && g.confidence >= 0.7) outcome = "correct";
        else if (g.grade === "partial") outcome = "partial";
        else outcome = "wrong"; // wrong, or low-confidence "correct"
      } else {
        outcome = "wrong";
      }

      let st: TutorRuntimeState = { ...s, grading: false, pendingAnswer: null };

      if (outcome === "correct") {
        st = {
          ...st,
          mastery: {
            ...st.mastery,
            [lessonId]: updateMastery(st.mastery[lessonId] ?? 0, "correct"),
          },
        };
        st = tx(st, "ADVANCE_CHUNK");
        st = emitTutor(st, chunk.correctFeedback);
        return advance(st, course, opts.singleLesson);
      }

      // partial or wrong: update mastery, count the wrong, bump attempts, then
      // hand off to the model to craft a hint (component dispatches APPLY_HINT).
      const attempts = st.chunkAttempts + 1;
      st = {
        ...st,
        chunkAttempts: attempts,
        mastery: {
          ...st.mastery,
          [lessonId]: updateMastery(st.mastery[lessonId] ?? 0, outcome),
        },
        mistakes:
          outcome === "wrong"
            ? { ...st.mistakes, [lessonId]: (st.mistakes[lessonId] ?? 0) + 1 }
            : st.mistakes,
      };
      // First slip → GIVE_HINT; repeated → REMEDIATE (the hint prompt escalates).
      st = tx(st, attempts >= 2 ? "REMEDIATE" : "GIVE_HINT");
      return { ...st, hinting: true, lastWrongAnswer: answer };
    }

    case "APPLY_HINT": {
      if (!s.hinting) return s;
      let st = emitTutor(s, action.text);
      st = tx(st, "ASK_MICRO_QUIZ");
      return { ...st, hinting: false, lastWrongAnswer: null, awaitingAnswer: true };
    }

    default:
      return s;
  }
}

/** Bind a course pack (and options) to the reducer for use with useReducer. */
export function makeTutorReducer(course: CoursePack, opts: ReducerOptions = {}) {
  const full: Required<ReducerOptions> = {
    singleLesson: opts.singleLesson ?? false,
    startModule: opts.startModule ?? 0,
    startLesson: opts.startLesson ?? 0,
  };
  return (s: TutorRuntimeState, action: TutorAction) => reduce(s, action, course, full);
}
