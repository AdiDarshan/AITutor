"use client";

import type { Speaker } from "../llm/useSpeaker";
import styles from "./TutorGate.module.css";

export default function TutorGate({ speaker }: { speaker: Speaker }) {
  const { status, checked, progress, retry } = speaker;

  if (!checked || status === "not_checked") {
    return (
      <div className={styles.gate}>
        <h2 className={styles.title}>Checking your device…</h2>
      </div>
    );
  }

  if (status === "unsupported") {
    return (
      <div className={styles.gate}>
        <h2 className={styles.title}>Local AI not available</h2>
        <p className={styles.body}>
          This tutor runs an AI model directly in your browser, which needs WebGPU. Please
          open it in a recent version of Chrome or Edge on a desktop (or another device that
          supports WebGPU).
        </p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className={styles.gate}>
        <h2 className={styles.title}>The AI tutor failed to load</h2>
        <p className={styles.body}>Something went wrong while loading the local model.</p>
        <button className={styles.btn} type="button" onClick={retry}>
          Retry
        </button>
      </div>
    );
  }

  // loading
  return (
    <div className={styles.gate}>
      <h2 className={styles.title}>Preparing your AI tutor…</h2>
      <p className={styles.body}>
        Downloading the local model {progress}. This happens once, then it&apos;s cached for
        next time.
      </p>
    </div>
  );
}
