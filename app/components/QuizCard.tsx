import styles from "./QuizCard.module.css";

export default function QuizCard({
  question,
}: {
  question: string;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.label}>Quick check</div>
      <p className={styles.question}>{question}</p>
      <input
        className={styles.input}
        type="text"
        placeholder="Type your answer…"
        disabled
        aria-label="Your answer"
      />
      <button className={styles.submit} type="button" disabled>
        Submit
      </button>
      <p className={styles.note}>Placeholder — interactivity arrives in MVP 1.</p>
    </div>
  );
}
