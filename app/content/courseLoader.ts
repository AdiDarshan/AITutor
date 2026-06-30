import courseJson from "@/content/py101/course.json";
import { coursePackSchema } from "./courseSchema";
import type { CoursePack } from "./types";

/**
 * Validate the Course Pack JSON against the schema and map it to the runtime
 * (camelCase) shape. Throws a readable error listing every validation issue —
 * surfaced by Next's dev error overlay during development.
 */
export function loadCoursePack(): CoursePack {
  const parsed = coursePackSchema.safeParse(courseJson);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid course pack (content/py101/course.json):\n${issues}`);
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
          correctFeedback: c.correct_feedback ?? "Correct.",
          hint: c.hint ?? "Not quite — try again.",
        })),
      })),
    })),
  };
}
