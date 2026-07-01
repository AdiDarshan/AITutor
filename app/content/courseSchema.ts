import { z } from "zod";

// Zod schema for the on-disk Course Pack JSON (snake_case).
// Runtime code uses the camelCase types in ./types via the loader.

export const lessonTypeSchema = z.enum([
  "standard",
  "challenge",
  "review",
  "weekly_review",
  "exam",
  "retake_review",
]);

// A known wrong answer and the specific hint to show for it.
export const commonWrongAnswerSchema = z.object({
  answers: z.array(z.string()).min(1),
  hint: z.string(),
});

export const lessonChunkSchema = z.object({
  chunk_id: z.string(),
  goal: z.string().optional(),
  approved_explanation: z.string().min(1),
  simple_example: z.string().optional(),
  check_question: z.string().min(1),
  expected_answer: z.string().min(1),
  accepted_answers: z.array(z.string()).optional(),
  common_wrong_answers: z.array(commonWrongAnswerSchema).optional(),
  correct_feedback: z.string().optional(),
  hint: z.string().optional(),
  source_refs: z.array(z.string()).optional(),
});

export const quizItemSchema = z.object({
  quiz_id: z.string(),
  question: z.string(),
  correct_answer: z.string(),
  accepted_answers: z.array(z.string()).optional(),
  hints: z.array(z.string()).optional(),
});

export const commonMistakeSchema = z.object({
  mistake_id: z.string(),
  description: z.string(),
  remediation: z.string(),
});

export const lessonSchema = z.object({
  lesson_id: z.string(),
  title: z.string(),
  type: lessonTypeSchema,
  order: z.number().int(),
  prerequisites: z.array(z.string()).default([]),
  learning_goal: z.string(),
  lesson_chunks: z.array(lessonChunkSchema).min(1),
  quiz_items: z.array(quizItemSchema).default([]),
  common_mistakes: z.array(commonMistakeSchema).default([]),
});

export const moduleSchema = z.object({
  module_id: z.string(),
  title: z.string(),
  order: z.number().int(),
  lessons: z.array(lessonSchema).min(1),
});

export const teacherStyleSchema = z.object({
  tone: z.string(),
  rules: z.array(z.string()),
});

export const coursePackSchema = z.object({
  program_id: z.string(),
  program_title: z.string(),
  teacher_style: teacherStyleSchema,
  modules: z.array(moduleSchema).min(1),
});

export type CoursePackJson = z.infer<typeof coursePackSchema>;
