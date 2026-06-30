import LessonPlayer from "./components/LessonPlayer";
import { writingYourFirstProgram } from "./lessonContent";
import styles from "./page.module.css";

export default function LessonPage() {
  const lesson = writingYourFirstProgram;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <p className={styles.course}>
          {lesson.program} · {lesson.module}
        </p>
        <h1 className={styles.concept}>{lesson.title}</h1>
      </header>

      <LessonPlayer lesson={lesson} />
    </main>
  );
}
