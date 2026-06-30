"use client";

import type { ModelStatus as Status } from "../llm/LLMClient";
import styles from "./ModelStatus.module.css";

export default function ModelStatus({
  status,
  supported,
  progress,
  onEnable,
}: {
  status: Status;
  supported: boolean;
  progress: string;
  onEnable: () => void;
}) {
  if (status === "unsupported" || !supported) {
    return (
      <div className={styles.bar}>
        Local AI unsupported on this device — using guided lesson mode.
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className={styles.bar}>
        Downloading local model… {progress} (the lesson works while it loads)
      </div>
    );
  }

  if (status === "ready") {
    return <div className={`${styles.bar} ${styles.ready}`}>✨ Local AI on</div>;
  }

  if (status === "failed") {
    return (
      <div className={styles.bar}>
        Local AI failed to load — using static tutor mode.{" "}
        <button className={styles.btn} type="button" onClick={onEnable}>
          Retry
        </button>
      </div>
    );
  }

  // not_checked + supported → available, awaiting enable
  return (
    <div className={styles.bar}>
      Local AI available.{" "}
      <button className={styles.btn} type="button" onClick={onEnable}>
        Enable natural phrasing
      </button>
    </div>
  );
}
