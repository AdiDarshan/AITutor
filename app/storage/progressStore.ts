// MVP 4 persistence: store student progress in localStorage.
// (IndexedDB and larger state come later, per the plan.)

export interface SavedProgress {
  programId: string;
  moduleIndex: number;
  lessonIndex: number;
  chunkIndex: number;
  mastery: Record<string, number>;
  mistakes: Record<string, number>;
}

const keyFor = (programId: string) => `course-tutor:progress:${programId}`;

export function loadProgress(programId: string): SavedProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(programId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedProgress;
    if (parsed.programId !== programId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProgress(p: SavedProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(p.programId), JSON.stringify(p));
  } catch {
    // ignore (e.g. storage disabled / quota)
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
