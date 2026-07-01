"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CoursePack } from "../content/types";
import {
  buildInitialState,
  makeTutorReducer,
  toSavedProgress,
} from "../tutor/tutorMachine";
import { clearProgress, loadProgress, saveProgress } from "../storage/progressStore";
import type { StudentEvent } from "../tutor/events";
import type { Speaker } from "../llm/useSpeaker";
import { buildCorpus, keywordSearch } from "../retrieval/retrieval";
import TutorMessage from "./TutorMessage";
import StudentMessage from "./StudentMessage";
import QuickActions from "./QuickActions";
import Composer from "./Composer";
import SourceBadge from "./SourceBadge";
import styles from "./LessonPlayer.module.css";

export default function LessonPlayer({
  course,
  speaker,
}: {
  course: CoursePack;
  speaker: Speaker;
}) {
  const reducer = useMemo(() => makeTutorReducer(course), [course]);
  const [state, dispatch] = useReducer(reducer, course, buildInitialState);
  const [showDebug, setShowDebug] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [askMode, setAskMode] = useState(false);

  // Per-message generation state: "pending" | "failed" | { text }.
  const [gen, setGen] = useState<Record<string, "pending" | "failed" | { text: string }>>({});
  const startedRef = useRef<Set<string>>(new Set());

  // Dispatch a structured student event (logged in development).
  function send(event: StudentEvent) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[tutor event]", event);
    }
    dispatch(event);
  }

  // Restore saved progress once, on mount (client only).
  useEffect(() => {
    const saved = loadProgress(course.programId);
    if (saved) dispatch({ type: "RESTORE", saved });
    setHydrated(true);
  }, [course.programId]);

  // Persist progress after every change (but not before the restore above).
  useEffect(() => {
    if (!hydrated) return;
    saveProgress(toSavedProgress(course, state));
  }, [state, hydrated, course]);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [state.messages]);

  // When AI is active, generate the tutor phrasing for each approved
  // explanation (strictly from its content). Each message is generated once.
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
    const chunk =
      course.modules[state.moduleIndex].lessons[state.lessonIndex].chunks[state.chunkIndex];
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
  }, [state.grading, state.pendingAnswer, state.moduleIndex, state.lessonIndex, state.chunkIndex, course, speaker]);

  // Retrieval corpus over all chunks in the course (rebuilt only when it changes).
  const corpus = useMemo(() => buildCorpus(course), [course]);

  // Answer a paused-lesson question: retrieve relevant chunks, answer from them
  // (with source labels), then return to the lesson. Refuse if nothing matches.
  const answeringRef = useRef(false);
  useEffect(() => {
    if (!state.answeringQuestion || state.pendingQuestion == null || answeringRef.current)
      return;
    answeringRef.current = true;
    const question = state.pendingQuestion;
    const refusal =
      "I don't have enough course material to answer that yet — let's keep going.";

    const hits = keywordSearch(corpus, question, 3);
    if (hits.length === 0) {
      dispatch({ type: "ANSWER_QUESTION", text: refusal, sources: [] });
      answeringRef.current = false;
      return;
    }

    const material = hits.map((h) => `[Source: ${h.label}]\n${h.text}`).join("\n\n");
    speaker
      .answerQuestion({ explanation: material, question })
      .then((ans) =>
        dispatch({
          type: "ANSWER_QUESTION",
          text: ans ?? refusal,
          sources: ans ? hits.map((h) => h.label) : [],
        }),
      )
      .catch(() => dispatch({ type: "ANSWER_QUESTION", text: refusal, sources: [] }))
      .finally(() => {
        answeringRef.current = false;
      });
  }, [state.answeringQuestion, state.pendingQuestion, corpus, speaker]);

  // What to show for a tutor message's text (single bubble, no duplicates).
  function tutorText(id: string, speakable: boolean | undefined, approved: string): string | null {
    if (!speakable) return approved;
    const g = gen[id];
    if (g && typeof g === "object") return g.text; // generated
    if (g === "failed") return approved; // fallback on failure
    return null; // pending -> show "writing…" placeholder
  }

  function startOver() {
    clearProgress(course.programId);
    startedRef.current.clear();
    setGen({});
    setAskMode(false);
    dispatch({ type: "RESET" });
  }

  const lessonId = course.modules[state.moduleIndex].lessons[state.lessonIndex].lessonId;
  const mastery = state.mastery[lessonId] ?? 0;
  const mistakes = state.mistakes[lessonId] ?? 0;

  return (
    <div className={styles.chat}>
      <div className={styles.debugBar}>
        <div className={styles.debugRow}>
          <button className={styles.startOver} type="button" onClick={startOver}>
            ↺ Start over
          </button>
          <button
            className={styles.debugChip}
            type="button"
            onClick={() => setShowDebug((v) => !v)}
          >
            🐞 {state.machineState} · mastery {mastery.toFixed(2)}
          </button>
        </div>
        {showDebug && (
          <div className={styles.debugPanel}>
            <div>
              module {state.moduleIndex + 1}/{course.modules.length} · lesson{" "}
              {state.lessonIndex + 1} · chunk {state.chunkIndex + 1}
            </div>
            <div>
              awaiting: {state.awaitingAnswer ? "yes" : "no"} · attempts{" "}
              {state.chunkAttempts} · mastery {mastery.toFixed(2)} · mistakes {mistakes}
            </div>
            <div className={styles.debugHistory}>{state.history.join(" → ")}</div>
          </div>
        )}
      </div>

      <div className={styles.messages} ref={messagesRef}>
        {state.messages.map((m) => {
          if (m.role !== "tutor") {
            return <StudentMessage key={m.id}>{m.text}</StudentMessage>;
          }
          const text = tutorText(m.id, m.speakable, m.text);
          return (
            <TutorMessage key={m.id}>
              {text === null ? (
                <span className={styles.generating}>✨ writing…</span>
              ) : (
                <>
                  {text}
                  {m.example && <pre className={styles.example}>{m.example}</pre>}
                  {m.sources && m.sources.length > 0 && (
                    <SourceBadge sources={m.sources} />
                  )}
                </>
              )}
            </TutorMessage>
          );
        })}
        {state.grading && (
          <div className={styles.grading}>✨ checking your answer…</div>
        )}
        {state.answeringQuestion && (
          <div className={styles.grading}>✨ thinking…</div>
        )}
      </div>

      <QuickActions
        onEvent={send}
        onToggleAsk={() => setAskMode((v) => !v)}
        askMode={askMode}
        disabled={
          state.finished || !state.awaitingAnswer || state.grading || state.answeringQuestion
        }
      />

      <Composer
        onSend={(text) => {
          if (askMode) {
            send({ type: "ASK_QUESTION", text });
            setAskMode(false);
          } else {
            send({ type: "SUBMIT_ANSWER", text });
          }
        }}
        disabled={state.finished || state.grading || state.answeringQuestion}
        placeholder={
          state.finished
            ? "Lesson complete 🎉"
            : state.grading
              ? "Checking…"
              : state.answeringQuestion
                ? "Thinking…"
                : askMode
                  ? "Type your question…"
                  : "Type your answer…"
        }
      />
    </div>
  );
}
