"use client";

import type { CoursePack } from "../content/types";
import type { SavedProgress } from "../storage/progressStore";
import styles from "./CourseHome.module.css";

export default function CourseHome({
  course,
  progress,
  onSelect,
}: {
  course: CoursePack;
  progress: SavedProgress;
  onSelect: (moduleIndex: number, lessonIndex: number) => void;
}) {
  const done = new Set(progress.completedLessons);

  // The current lesson is the first not-yet-completed lesson in order.
  let currentId: string | null = null;
  outer: for (const m of course.modules) {
    for (const l of m.lessons) {
      if (!done.has(l.lessonId)) {
        currentId = l.lessonId;
        break outer;
      }
    }
  }

  return (
    <div className={styles.home}>
      {course.modules.map((m, mi) => (
        <section key={m.moduleId} className={styles.module}>
          <h2 className={styles.moduleTitle}>{m.title}</h2>
          <ul className={styles.list}>
            {m.lessons.map((lesson, li) => {
              const isDone = done.has(lesson.lessonId);
              const isCurrent = lesson.lessonId === currentId;
              const mastery = progress.mastery[lesson.lessonId] ?? 0;
              const status = isDone ? "done" : isCurrent ? "current" : "upcoming";
              return (
                <li key={lesson.lessonId}>
                  <button
                    className={`${styles.lesson} ${styles[status]}`}
                    type="button"
                    onClick={() => onSelect(mi, li)}
                  >
                    <span className={styles.icon}>
                      {isDone ? "✓" : isCurrent ? "▶" : "○"}
                    </span>
                    <span className={styles.info}>
                      <span className={styles.title}>{lesson.title}</span>
                      <span className={styles.bar}>
                        <span
                          className={styles.fill}
                          style={{ width: `${Math.round(mastery * 100)}%` }}
                        />
                      </span>
                    </span>
                    <span className={styles.cta}>
                      {isDone ? "Review" : isCurrent ? "Continue" : "Start"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
