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
import TutorMessage from "./TutorMessage";
import StudentMessage from "./StudentMessage";
import QuickActions from "./QuickActions";
import Composer from "./Composer";
import styles from "./LessonPlayer.module.css";

export default function LessonPlayer({ course }: { course: CoursePack }) {
  const reducer = useMemo(() => makeTutorReducer(course), [course]);
  const [state, dispatch] = useReducer(reducer, course, buildInitialState);
  const [showDebug, setShowDebug] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [askMode, setAskMode] = useState(false);

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

  function resetProgress() {
    clearProgress(course.programId);
    dispatch({ type: "RESET" });
  }

  const lessonId = course.modules[state.moduleIndex].lessons[state.lessonIndex].lessonId;
  const mastery = state.mastery[lessonId] ?? 0;
  const mistakes = state.mistakes[lessonId] ?? 0;

  return (
    <div className={styles.chat}>
      <div className={styles.debugBar}>
        <button
          className={styles.debugChip}
          type="button"
          onClick={() => setShowDebug((v) => !v)}
        >
          🐞 {state.machineState} · mastery {mastery.toFixed(2)}
        </button>
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
            <button className={styles.debugReset} type="button" onClick={resetProgress}>
              reset progress
            </button>
          </div>
        )}
      </div>

      <div className={styles.messages} ref={messagesRef}>
        {state.messages.map((m) =>
          m.role === "tutor" ? (
            <TutorMessage key={m.id}>
              {m.text}
              {m.example && <pre className={styles.example}>{m.example}</pre>}
            </TutorMessage>
          ) : (
            <StudentMessage key={m.id}>{m.text}</StudentMessage>
          ),
        )}
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
