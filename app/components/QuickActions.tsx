"use client";

import type { StudentEvent } from "../tutor/events";
import styles from "./QuickActions.module.css";

export default function QuickActions({
  onEvent,
  onToggleAsk,
  askMode,
  disabled,
}: {
  onEvent: (e: StudentEvent) => void;
  onToggleAsk: () => void;
  askMode: boolean;
  disabled: boolean;
}) {
  return (
    <div className={styles.actions}>
      <button
        className={styles.action}
        type="button"
        disabled={disabled}
        onClick={() => onEvent({ type: "UNDERSTANDS" })}
      >
        👍 I understand
      </button>
      <button
        className={styles.action}
        type="button"
        disabled={disabled}
        onClick={() => onEvent({ type: "CONFUSED" })}
      >
        🤔 I&apos;m confused
      </button>
      <button
        className={styles.action}
        type="button"
        disabled={disabled}
        onClick={() => onEvent({ type: "REQUEST_EXAMPLE" })}
      >
        💡 Give me an example
      </button>
      <button
        className={styles.action}
        type="button"
        disabled={disabled}
        onClick={() => onEvent({ type: "REQUEST_QUIZ" })}
      >
        🔁 Quiz me
      </button>
      <button
        className={`${styles.action} ${askMode ? styles.activeAction : ""}`}
        type="button"
        disabled={disabled}
        onClick={onToggleAsk}
      >
        ❓ Ask a question
      </button>
    </div>
  );
}
