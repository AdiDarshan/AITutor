import { coursePackSchema } from "./courseSchema";
import type { CoursePack } from "./types";

/** Validate raw Course Pack JSON and map it to the runtime (camelCase) shape.
 *  Throws a readable error listing every validation issue. */
export function mapCoursePack(raw: unknown): CoursePack {
  const parsed = coursePackSchema.safeParse(raw);

  if (!parsed.success) {
    const id =
      raw && typeof raw === "object" && "program_id" in raw
        ? String((raw as { program_id: unknown }).program_id)
        : "unknown";
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid course pack (program "${id}"):\n${issues}`);
  }

  const data = parsed.data;

  return {
    programId: data.program_id,
    programTitle: data.program_title,
    teacherStyle: { tone: data.teacher_style.tone, rules: data.teacher_style.rules },
    modules: data.modules.map((m) => ({
      moduleId: m.module_id,
      title: m.title,
      order: m.order,
      lessons: m.lessons.map((l) => ({
        lessonId: l.lesson_id,
        title: l.title,
        type: l.type,
        order: l.order,
        learningGoal: l.learning_goal,
        chunks: l.lesson_chunks.map((c) => ({
          chunkId: c.chunk_id,
          explanation: c.approved_explanation,
          example: c.simple_example,
          checkQuestion: c.check_question,
          expectedAnswer: c.expected_answer,
          accepted: c.accepted_answers ?? [c.expected_answer],
          commonWrongAnswers: c.common_wrong_answers ?? [],
          correctFeedback: c.correct_feedback ?? "Correct.",
          hint: c.hint ?? "Not quite — try again.",
        })),
      })),
    })),
  };
}
