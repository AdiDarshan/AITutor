// Runtime (camelCase) types the app works with, mapped from the validated
// Course Pack JSON by the loader.

export type LessonType =
  | "standard"
  | "challenge"
  | "review"
  | "weekly_review"
  | "exam"
  | "retake_review";

export interface LessonChunk {
  chunkId: string;
  explanation: string;
  example?: string;
  checkQuestion: string;
  expectedAnswer: string;
  /** Accepted answers for deterministic matching (defaults to [expectedAnswer]). */
  accepted: string[];
  correctFeedback: string;
  hint: string;
}

export interface Lesson {
  lessonId: string;
  title: string;
  type: LessonType;
  order: number;
  learningGoal: string;
  chunks: LessonChunk[];
}

export interface Module {
  moduleId: string;
  title: string;
  order: number;
  lessons: Lesson[];
}

export interface CoursePack {
  programId: string;
  programTitle: string;
  teacherStyle: { tone: string; rules: string[] };
  modules: Module[];
}
