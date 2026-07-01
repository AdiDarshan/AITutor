"use client";

import { useEffect, useState } from "react";
import type { CoursePack } from "../content/types";
import { useSpeaker } from "../llm/useSpeaker";
import {
  loadProgress,
  saveProgress,
  recordLessonComplete,
  type SavedProgress,
} from "../storage/progressStore";
import CourseHome from "./CourseHome";
import LessonPlayer from "./LessonPlayer";
import TutorGate from "./TutorGate";
import styles from "./CourseApp.module.css";

type View = { kind: "home" } | { kind: "lesson"; moduleIndex: number; lessonIndex: number };

export default function CourseApp({ courses }: { courses: CoursePack[] }) {
  const speaker = useSpeaker();
  const [programId, setProgramId] = useState(courses[0].programId);
  const course = courses.find((c) => c.programId === programId) ?? courses[0];

  const [view, setView] = useState<View>({ kind: "home" });
  const [progress, setProgress] = useState<SavedProgress | null>(null);

  // Load progress when the course changes (client only); reset to the home view.
  useEffect(() => {
    setProgress(loadProgress(programId));
    setView({ kind: "home" });
  }, [programId]);

  // Persist completion; stay on the lesson so the student sees the summary and
  // taps "Back to lessons" when ready.
  function handleComplete(lessonId: string, mastery: number, mistakes: number) {
    setProgress((prev) => {
      const base = prev ?? loadProgress(programId);
      const next = recordLessonComplete(base, lessonId, mastery, mistakes);
      saveProgress(next);
      return next;
    });
  }

  return (
    <>
      {courses.length > 1 && view.kind === "home" && (
        <div className={styles.switcherRow}>
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
        </div>
      )}

      {!speaker.ready ? (
        <TutorGate speaker={speaker} />
      ) : view.kind === "lesson" ? (
        <LessonPlayer
          key={`${programId}:${view.moduleIndex}:${view.lessonIndex}`}
          course={course}
          moduleIndex={view.moduleIndex}
          lessonIndex={view.lessonIndex}
          speaker={speaker}
          onComplete={handleComplete}
          onExit={() => setView({ kind: "home" })}
        />
      ) : (
        <CourseHome
          course={course}
          progress={progress ?? loadProgress(programId)}
          onSelect={(moduleIndex, lessonIndex) =>
            setView({ kind: "lesson", moduleIndex, lessonIndex })
          }
        />
      )}
    </>
  );
}
