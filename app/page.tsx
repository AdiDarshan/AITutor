import TutorMessage from "./components/TutorMessage";
import QuizCard from "./components/QuizCard";
import styles from "./page.module.css";

export default function LessonPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.course}>Probability 101</h1>
        <p className={styles.concept}>Conditional Probability</p>
      </header>

      <section className={styles.flow}>
        <TutorMessage>
          Welcome! We&apos;ll learn conditional probability one small step at a time.
          Conditional probability means we ask for a chance after we already know
          something else happened.
        </TutorMessage>

        <QuizCard question="In P(A | B), which event is already known?" />
      </section>
    </main>
  );
}
