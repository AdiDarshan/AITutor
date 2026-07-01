import type { Module } from "../content/types";
import styles from "./ProgressMap.module.css";

export default function ProgressMap({
  module,
  currentLessonIndex,
  mastery,
  finished,
}: {
  module: Module;
  currentLessonIndex: number;
  mastery: Record<string, number>;
  finished: boolean;
}) {
  return (
    <div className={styles.map}>
      {module.lessons.map((lesson, i) => {
        const status =
          finished || i < currentLessonIndex
            ? "done"
            : i === currentLessonIndex
              ? "current"
              : "upcoming";
        const m = mastery[lesson.lessonId] ?? 0;
        const icon = status === "done" ? "✓" : status === "current" ? "▶" : "○";
        return (
          <div key={lesson.lessonId} className={`${styles.row} ${styles[status]}`}>
            <span className={styles.icon}>{icon}</span>
            <span className={styles.title}>{lesson.title}</span>
            <span className={styles.bar}>
              <span className={styles.fill} style={{ width: `${Math.round(m * 100)}%` }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
