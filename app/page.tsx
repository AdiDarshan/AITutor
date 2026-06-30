import TutorMessage from "./components/TutorMessage";
import QuizCard from "./components/QuizCard";
import styles from "./page.module.css";

export default function LessonPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <p className={styles.course}>PY101 · Week 1 — Writing your first program</p>
        <h1 className={styles.concept}>Writing your first program</h1>
      </header>

      <section className={styles.flow}>
        <TutorMessage>
          Welcome to PY101! We&apos;ll learn Python one small step at a time. A program runs
          top to bottom, and <code>print()</code> shows text on the screen — the text goes
          inside the parentheses, in quotes.
        </TutorMessage>

        <QuizCard question="Which function displays text on screen in Python?" />
      </section>
    </main>
  );
}
