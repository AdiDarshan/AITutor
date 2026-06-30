import LessonPlayer from "./components/LessonPlayer";
import { loadCoursePack } from "./content/courseLoader";
import styles from "./page.module.css";

export default function LessonPage() {
  const course = loadCoursePack();
  const module = course.modules[0];
  const lesson = module.lessons[0];

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <p className={styles.course}>
          {course.programId.toUpperCase()} · {module.title}
        </p>
        <h1 className={styles.concept}>{lesson.title}</h1>
      </header>

      <LessonPlayer lesson={lesson} />
    </main>
  );
}
