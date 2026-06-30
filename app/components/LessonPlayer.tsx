"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CoursePack } from "../content/types";
import { buildInitialState, makeTutorReducer } from "../tutor/tutorMachine";
import TutorMessage from "./TutorMessage";
import StudentMessage from "./StudentMessage";
import Composer from "./Composer";
import styles from "./LessonPlayer.module.css";

export default function LessonPlayer({ course }: { course: CoursePack }) {
  const reducer = useMemo(() => makeTutorReducer(course), [course]);
  const [state, dispatch] = useReducer(reducer, course, buildInitialState);
  const [showDebug, setShowDebug] = useState(false);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [state.messages]);

  return (
    <div className={styles.chat}>
      <div className={styles.debugBar}>
        <button
          className={styles.debugChip}
          type="button"
          onClick={() => setShowDebug((v) => !v)}
        >
          🐞 {state.machineState}
        </button>
        {showDebug && (
          <div className={styles.debugPanel}>
            <div>
              module {state.moduleIndex + 1}/{course.modules.length} · lesson{" "}
              {state.lessonIndex + 1} · chunk {state.chunkIndex + 1}
            </div>
            <div>awaiting answer: {state.awaitingAnswer ? "yes" : "no"}</div>
            <div className={styles.debugHistory}>{state.history.join(" → ")}</div>
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

      <Composer
        onSend={(text) => dispatch({ type: "SUBMIT_ANSWER", text })}
        disabled={state.finished}
        placeholder={state.finished ? "Lesson complete 🎉" : "Type your answer…"}
      />
    </div>
  );
}
