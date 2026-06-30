// Simple mastery model. Mastery is a 0..1 score per lesson.

export type AnswerResult = "correct" | "partial" | "wrong";

export function updateMastery(old: number, result: AnswerResult): number {
  if (result === "correct") return Math.min(1, old + 0.15);
  if (result === "partial") return Math.min(1, old + 0.05);
  return Math.max(0, old - 0.1);
}

/** Threshold the tutor can use to decide a lesson is understood well enough. */
export const MASTERY_THRESHOLD = 0.6;

export function isLessonMastered(
  mastery: Record<string, number>,
  lessonId: string,
): boolean {
  return (mastery[lessonId] ?? 0) >= MASTERY_THRESHOLD;
}
