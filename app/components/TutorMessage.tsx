import styles from "./TutorMessage.module.css";

export default function TutorMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.message}>
      <div className={styles.avatar} aria-hidden="true">
        🎓
      </div>
      <div className={styles.bubble}>
        <div className={styles.label}>Tutor</div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
