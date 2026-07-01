"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CoursePack } from "../content/types";
import {
  buildInitialState,
  makeTutorReducer,
  staticHint,
  knownWrongHint,
} from "../tutor/tutorMachine";
import type { StudentEvent } from "../tutor/events";
import type { Speaker } from "../llm/useSpeaker";
import { buildCorpus, hybridSearch, loadEmbeddings } from "../retrieval/retrieval";
import { embedQuery } from "../retrieval/embedModel";
import { deriveQuestionMode } from "../tutor/choices";
import QuickActions from "./QuickActions";
import Composer from "./Composer";
import SourceBadge from "./SourceBadge";
import styles from "./LessonPlayer.module.css";

export default function LessonPlayer({
  course,
  moduleIndex,
  lessonIndex,
  speaker,
  onComplete,
  onExit,
}: {
  course: CoursePack;
  moduleIndex: number;
  lessonIndex: number;
  speaker: Speaker;
  onComplete: (lessonId: string, mastery: number, mistakes: number) => void;
  onExit: () => void;
}) {
  const reducer = useMemo(
    () => makeTutorReducer(course, { singleLesson: true, startModule: moduleIndex, startLesson: lessonIndex }),
    [course, moduleIndex, lessonIndex],
  );
  const [state, dispatch] = useReducer(reducer, null, () =>
    buildInitialState(course, moduleIndex, lessonIndex),
  );
  const [showDebug, setShowDebug] = useState(false);
  const [askMode, setAskMode] = useState(false);
  // How many slides are revealed (they appear one at a time — content, then question).
  const [revealed, setRevealed] = useState(0);

  // Per-message generation state: "pending" | "failed" | { text }.
  const [gen, setGen] = useState<Record<string, "pending" | "failed" | { text: string }>>({});
  const startedRef = useRef<Set<string>>(new Set());

  const mod = course.modules[moduleIndex];
  const lesson = mod.lessons[lessonIndex];
  const lessonId = lesson.lessonId;
  const mastery = state.mastery[lessonId] ?? 0;
  const mistakes = state.mistakes[lessonId] ?? 0;

  // Current question: multiple-choice buttons or a text box (derived from data).
  const activeChunk = state.awaitingAnswer ? lesson.chunks[state.chunkIndex] : null;
  const questionMode = useMemo(
    () => (activeChunk ? deriveQuestionMode(activeChunk) : ({ kind: "open" } as const)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeChunk?.chunkId],
  );

  function send(event: StudentEvent) {
    if (process.env.NODE_ENV !== "production") console.log("[tutor event]", event);
    dispatch(event);
  }

  // Report completion once when the lesson finishes (persists progress upstream).
  const reportedRef = useRef(false);
  useEffect(() => {
    if (state.finished && !reportedRef.current) {
      reportedRef.current = true;
      onComplete(lessonId, state.mastery[lessonId] ?? 0, state.mistakes[lessonId] ?? 0);
    }
  }, [state.finished, state.mastery, state.mistakes, lessonId, onComplete]);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [state.messages, revealed]);

  // Reveal slides one at a time (content, then question, then feedback…). A
  // tutor slide waits for its AI text to finish before the next slide appears.
  useEffect(() => {
    if (revealed >= state.messages.length) return;
    const last = revealed > 0 ? state.messages[revealed - 1] : null;
    if (last && last.speakable && speaker.ready) {
      const g = gen[last.id];
      const settled = g === "failed" || (typeof g === "object" && g !== null);
      if (!settled) return; // wait for the content to finish "writing"
    }
    const next = state.messages[revealed];
    const delay = revealed === 0 || next.role === "student" ? 0 : 650;
    const t = setTimeout(
      () => setRevealed((r) => Math.min(r + 1, state.messages.length)),
      delay,
    );
    return () => clearTimeout(t);
  }, [revealed, state.messages, gen, speaker.ready]);

  // Generate tutor phrasing for each approved explanation (once each).
  useEffect(() => {
    if (!speaker.ready) return;
    for (const m of state.messages) {
      if (m.role !== "tutor" || !m.speakable || startedRef.current.has(m.id)) continue;
      startedRef.current.add(m.id);
      setGen((prev) => ({ ...prev, [m.id]: "pending" }));
      const approved = m.text;
      speaker.rephrase(approved).then((out) => {
        setGen((prev) => ({ ...prev, [m.id]: out ? { text: out } : "failed" }));
      });
    }
  }, [state.messages, speaker.ready, speaker]);

  // Grade a submitted answer with the model, then let the reducer decide.
  const gradingRef = useRef(false);
  useEffect(() => {
    if (!state.grading || state.pendingAnswer == null || gradingRef.current) return;
    gradingRef.current = true;
    const chunk = mod.lessons[state.lessonIndex].chunks[state.chunkIndex];
    speaker
      .grade({
        question: chunk.checkQuestion,
        correctAnswer: chunk.expectedAnswer,
        acceptedAnswers: chunk.accepted,
        knownWrong: chunk.commonWrongAnswers.flatMap((w) => w.answers),
        studentAnswer: state.pendingAnswer,
      })
      .then((modelGrade) => dispatch({ type: "APPLY_GRADE", modelGrade }))
      .catch(() => dispatch({ type: "APPLY_GRADE", modelGrade: null }))
      .finally(() => {
        gradingRef.current = false;
      });
  }, [state.grading, state.pendingAnswer, state.lessonIndex, state.chunkIndex, mod, speaker]);

  // Agentic hint: model sees the content + the wrong answer and crafts a hint
  // (static authored hint is the fallback). See reducer APPLY_HINT.
  const hintingRef = useRef(false);
  useEffect(() => {
    if (!state.hinting || state.lastWrongAnswer == null || hintingRef.current) return;
    hintingRef.current = true;
    const chunk = lesson.chunks[state.chunkIndex];
    const answer = state.lastWrongAnswer;
    const fallback = staticHint(chunk, answer);
    speaker
      .hint({
        explanation: chunk.explanation,
        example: chunk.example,
        question: chunk.checkQuestion,
        correctAnswer: chunk.expectedAnswer,
        studentAnswer: answer,
        misconceptionHint: knownWrongHint(chunk, answer) ?? undefined,
        attempt: state.chunkAttempts,
      })
      .then((h) => dispatch({ type: "APPLY_HINT", text: h ?? fallback }))
      .catch(() => dispatch({ type: "APPLY_HINT", text: fallback }))
      .finally(() => {
        hintingRef.current = false;
      });
  }, [state.hinting, state.lastWrongAnswer, state.chunkIndex, state.chunkAttempts, lesson, speaker]);

  // Retrieval corpus over the WHOLE course (Q&A can answer from any lesson).
  const corpus = useMemo(() => buildCorpus(course), [course]);

  // Answer a paused-lesson question via hybrid retrieval, then return.
  const answeringRef = useRef(false);
  useEffect(() => {
    if (!state.answeringQuestion || state.pendingQuestion == null || answeringRef.current) return;
    answeringRef.current = true;
    const question = state.pendingQuestion;
    const refusal = "I don't have enough course material to answer that yet — let's keep going.";

    (async () => {
      const embeddings = await loadEmbeddings(course.programId);
      const queryVec = embeddings ? await embedQuery(question) : null;
      const hits = hybridSearch(corpus, question, queryVec, embeddings, 3);
      if (hits.length === 0) {
        dispatch({ type: "ANSWER_QUESTION", text: refusal, sources: [] });
        return;
      }
      const material = hits.map((h) => `[Source: ${h.label}]\n${h.text}`).join("\n\n");
      const ans = await speaker.answerQuestion({ explanation: material, question });
      dispatch({
        type: "ANSWER_QUESTION",
        text: ans ?? refusal,
        sources: ans ? hits.map((h) => h.label) : [],
      });
    })()
      .catch(() => dispatch({ type: "ANSWER_QUESTION", text: refusal, sources: [] }))
      .finally(() => {
        answeringRef.current = false;
      });
  }, [state.answeringQuestion, state.pendingQuestion, corpus, course, speaker]);

  function tutorText(id: string, speakable: boolean | undefined, approved: string): string | null {
    if (!speakable) return approved;
    const g = gen[id];
    if (g && typeof g === "object") return g.text;
    if (g === "failed") return approved;
    return null;
  }

  function restartLesson() {
    startedRef.current.clear();
    reportedRef.current = false;
    setGen({});
    setAskMode(false);
    setRevealed(0);
    dispatch({ type: "RESET" });
  }

  const allRevealed = revealed >= state.messages.length;
  const showAnswerPanel =
    !state.finished &&
    !state.grading &&
    !state.answeringQuestion &&
    state.awaitingAnswer &&
    allRevealed;

  return (
    <div className={styles.lesson}>
      <header className={styles.lessonHeader}>
        <div className={styles.headerRow}>
          <button className={styles.back} type="button" onClick={onExit}>
            ← All lessons
          </button>
          <div className={styles.headerSpacer} />
          <button className={styles.startOver} type="button" onClick={restartLesson}>
            ↺ Restart
          </button>
          <button
            className={styles.debugChip}
            type="button"
            onClick={() => setShowDebug((v) => !v)}
          >
            🐞 {state.machineState} · {mastery.toFixed(2)}
          </button>
        </div>
        <p className={styles.crumb}>
          {course.programId.toUpperCase()} · {mod.title} · lesson {lessonIndex + 1} of{" "}
          {mod.lessons.length}
        </p>
        <h1 className={styles.lessonTitle}>{lesson.title}</h1>
        {showDebug && (
          <div className={styles.debugPanel}>
            <div>
              chunk {state.chunkIndex + 1} · awaiting {state.awaitingAnswer ? "yes" : "no"} ·
              attempts {state.chunkAttempts} · mistakes {mistakes}
            </div>
            <div className={styles.debugHistory}>{state.history.join(" → ")}</div>
          </div>
        )}
      </header>

      <div className={styles.slides} ref={messagesRef}>
        {state.messages.slice(0, revealed).map((m) => {
          if (m.role === "student") {
            return (
              <div key={m.id} className={styles.studentSlide}>
                {m.text}
              </div>
            );
          }
          const text = tutorText(m.id, m.speakable, m.text);
          return (
            <div key={m.id} className={styles.slide}>
              {text === null ? (
                <span className={styles.generating}>✨ writing…</span>
              ) : (
                <>
                  <div className={styles.slideText}>{text}</div>
                  {m.example && <pre className={styles.example}>{m.example}</pre>}
                  {m.sources && m.sources.length > 0 && <SourceBadge sources={m.sources} />}
                </>
              )}
            </div>
          );
        })}

        {state.grading && <div className={styles.statusSlide}>✨ checking your answer…</div>}
        {state.hinting && <div className={styles.statusSlide}>✨ thinking of a hint…</div>}
        {state.answeringQuestion && <div className={styles.statusSlide}>✨ thinking…</div>}

        {/* Ask-a-question input slide */}
        {showAnswerPanel && askMode && (
          <div className={styles.panel}>
            <p className={styles.panelPrompt}>What&apos;s your question?</p>
            <Composer
              onSend={(text) => {
                send({ type: "ASK_QUESTION", text });
                setAskMode(false);
              }}
              placeholder="Type your question…"
            />
          </div>
        )}

        {/* Answer input slide: multiple-choice buttons or a text box */}
        {showAnswerPanel && !askMode && (
          <div className={styles.panel}>
            {questionMode.kind === "choice" ? (
              <div className={styles.choices}>
                {questionMode.options.map((opt) => (
                  <button
                    key={opt}
                    className={styles.choiceBtn}
                    type="button"
                    onClick={() => send({ type: "SUBMIT_ANSWER", text: opt })}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <Composer
                onSend={(text) => send({ type: "SUBMIT_ANSWER", text })}
                placeholder="Type your answer…"
              />
            )}
          </div>
        )}

        {state.finished && allRevealed && (
          <button className={styles.doneButton} type="button" onClick={onExit}>
            ← Back to lessons
          </button>
        )}
      </div>

      {!state.finished && (
        <div className={styles.actionBar}>
          <QuickActions
            onEvent={send}
            onToggleAsk={() => setAskMode((v) => !v)}
            askMode={askMode}
            disabled={
              !allRevealed || !state.awaitingAnswer || state.grading || state.answeringQuestion
            }
          />
        </div>
      )}
    </div>
  );
}
