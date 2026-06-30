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
import TutorMessage from "./TutorMessage";
import StudentMessage from "./StudentMessage";
import QuickActions from "./QuickActions";
import Composer from "./Composer";
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
              awaiting answer: {state.awaitingAnswer ? "yes" : "no"} · mastery{" "}
              {mastery.toFixed(2)} · mistakes {mistakes}
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
                </>
              )}
            </TutorMessage>
          );
        })}
      </div>

      <QuickActions
        onEvent={send}
        onToggleAsk={() => setAskMode((v) => !v)}
        askMode={askMode}
        disabled={state.finished || !state.awaitingAnswer}
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
        disabled={state.finished}
        placeholder={
          state.finished
            ? "Lesson complete 🎉"
            : askMode
              ? "Type your question…"
              : "Type your answer…"
        }
      />
    </div>
  );
}
