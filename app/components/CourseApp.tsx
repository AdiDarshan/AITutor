"use client";

import { useState } from "react";
import type { CoursePack } from "../content/types";
import { useSpeaker } from "../llm/useSpeaker";
import LessonPlayer from "./LessonPlayer";
import TutorGate from "./TutorGate";
import styles from "./CourseApp.module.css";

export default function CourseApp({ courses }: { courses: CoursePack[] }) {
  const speaker = useSpeaker();
  const [programId, setProgramId] = useState(courses[0].programId);
  const course = courses.find((c) => c.programId === programId) ?? courses[0];
  const module = course.modules[0];
  const lesson = module.lessons[0];

  return (
    <>
      <header className={styles.header}>
        {courses.length > 1 && (
          <select
            className={styles.switcher}
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            aria-label="Choose a course"
          >
            {courses.map((c) => (
              <option key={c.programId} value={c.programId}>
                {c.programTitle}
              </option>
            ))}
          </select>
        )}
        <p className={styles.course}>
          {course.programId.toUpperCase()} · {module.title}
        </p>
        <h1 className={styles.concept}>{lesson.title}</h1>
      </header>

      {/* AI-first: the lesson only runs once the local model is ready. */}
      {speaker.ready ? (
        // key forces a fresh state machine + restore when switching courses
        <LessonPlayer key={course.programId} course={course} speaker={speaker} />
      ) : (
        <TutorGate speaker={speaker} />
      )}
    </>
  );
}
