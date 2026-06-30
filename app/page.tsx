import CourseApp from "./components/CourseApp";
import { loadAllCourses } from "./content/courseLoader";
import styles from "./page.module.css";

export default function LessonPage() {
  const courses = loadAllCourses();

  return (
    <main className={styles.main}>
      <CourseApp courses={courses} />
    </main>
  );
}
