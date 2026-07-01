// Persistence: per-program progress (completed lessons + mastery + mistakes).
// localStorage for v1; IndexedDB later per the plan.

export interface SavedProgress {
  programId: string;
  completedLessons: string[];
  mastery: Record<string, number>;
  mistakes: Record<string, number>;
}

const keyFor = (programId: string) => `course-tutor:progress:${programId}`;

export function emptyProgress(programId: string): SavedProgress {
  return { programId, completedLessons: [], mastery: {}, mistakes: {} };
}

export function loadProgress(programId: string): SavedProgress {
  if (typeof window === "undefined") return emptyProgress(programId);
  try {
    const raw = window.localStorage.getItem(keyFor(programId));
    if (!raw) return emptyProgress(programId);
    const p = JSON.parse(raw) as Partial<SavedProgress>;
    return {
      programId,
      completedLessons: p.completedLessons ?? [],
      mastery: p.mastery ?? {},
      mistakes: p.mistakes ?? {},
    };
  } catch {
    return emptyProgress(programId);
  }
}

export function saveProgress(p: SavedProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(p.programId), JSON.stringify(p));
  } catch {
    // ignore (storage disabled / quota)
  }
}

export function clearProgress(programId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(programId));
  } catch {
    // ignore
  }
}

/** Record a completed lesson with its mastery/mistakes; returns the new state. */
export function recordLessonComplete(
  prev: SavedProgress,
  lessonId: string,
  mastery: number,
  mistakes: number,
): SavedProgress {
  return {
    ...prev,
    completedLessons: prev.completedLessons.includes(lessonId)
      ? prev.completedLessons
      : [...prev.completedLessons, lessonId],
    mastery: { ...prev.mastery, [lessonId]: mastery },
    mistakes: { ...prev.mistakes, [lessonId]: mistakes },
  };
}
