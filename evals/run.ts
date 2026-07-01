// Deterministic eval runner (Node, no model). Run with: npm run eval
// Covers the "code controls the flow" logic: course validation, lesson flow,
// grading decisions, retrieval, and JSON parsing. Model generation quality is
// a separate browser/manual check.

import fs from "node:fs";
import path from "node:path";
import { mapCoursePack } from "../app/content/mapCoursePack";
import { buildInitialState, makeTutorReducer, staticHint } from "../app/tutor/tutorMachine";
import { buildCorpus, keywordSearch, cosineSim, hybridSearch } from "../app/retrieval/retrieval";
import { parseGrade, type GradeResult } from "../app/llm/grade";
import { parseVerdict } from "../app/llm/verify";
import type { CoursePack, LessonChunk } from "../app/content/types";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function readJson(rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
}

// --- Suite 1: course packs validate & map -------------------------------
console.log("\nCourse packs");
const courses: CoursePack[] = [];
const contentDir = path.join(process.cwd(), "content");
for (const dir of fs.readdirSync(contentDir)) {
  const file = path.join(contentDir, dir, "course.json");
  if (!fs.existsSync(file)) continue;
  try {
    const course = mapCoursePack(JSON.parse(fs.readFileSync(file, "utf8")));
    courses.push(course);
    check(`valid: ${dir}`, true);
  } catch (e) {
    check(`valid: ${dir}`, false, String(e));
  }
}
check("at least one course loaded", courses.length > 0);

// --- Suite 2: lesson flow completes via the state machine ----------------
console.log("\nLesson flow");
try {
  const py = courses.find((c) => c.programId === "py101");
  if (!py) {
    check("py101 present", false);
  } else {
    const reducer = makeTutorReducer(py);
    let st = buildInitialState(py);
    let guard = 0;
    while (!st.finished && guard < 100) {
      const ch = py.modules[st.moduleIndex].lessons[st.lessonIndex].chunks[st.chunkIndex];
      st = reducer(st, { type: "SUBMIT_ANSWER", text: ch.expectedAnswer });
      st = reducer(st, { type: "APPLY_GRADE", modelGrade: null });
      guard += 1;
    }
    check("lesson completes with correct answers", st.finished, `stuck at ${st.machineState}`);
  }
} catch (e) {
  check("no illegal transitions during a lesson", false, String(e));
}

// --- Suite 3: grading decisions (JSON cases) -----------------------------
console.log("\nGrading decisions");
function synthCourse(accepted: string[], commonWrong: LessonChunk["commonWrongAnswers"]): CoursePack {
  const chunk: LessonChunk = {
    chunkId: "c",
    explanation: "exp",
    checkQuestion: "q?",
    expectedAnswer: accepted[0] ?? "x",
    accepted,
    commonWrongAnswers: commonWrong,
    correctFeedback: "ok",
    hint: "hint",
  };
  return {
    programId: "t",
    programTitle: "t",
    teacherStyle: { tone: "", rules: [] },
    modules: [
      {
        moduleId: "m",
        title: "m",
        order: 1,
        lessons: [
          { lessonId: "l", title: "l", type: "standard", order: 1, learningGoal: "", chunks: [chunk] },
        ],
      },
    ],
  };
}

for (const c of readJson("evals/cases/grading.json") as any[]) {
  const course = synthCourse(c.accepted, c.commonWrong ?? []);
  const reducer = makeTutorReducer(course);
  let st = buildInitialState(course);
  st = reducer(st, { type: "SUBMIT_ANSWER", text: c.answer });
  st = reducer(st, { type: "APPLY_GRADE", modelGrade: (c.modelGrade ?? null) as GradeResult | null });
  const outcome = st.finished ? "correct" : "wrong";
  check(`grading: ${c.name}`, outcome === c.expect, `expected ${c.expect}, got ${outcome}`);
  if (c.expectHint) {
    // The model hint is async/non-deterministic; verify the deterministic fallback.
    const chunk = course.modules[0].lessons[0].chunks[0];
    const hint = staticHint(chunk, c.answer);
    check(`grading hint: ${c.name}`, hint.includes(c.expectHint), `got "${hint}"`);
  }
}

// --- Suite 4: retrieval (JSON cases) -------------------------------------
console.log("\nRetrieval");
for (const c of readJson("evals/cases/retrieval.json") as any[]) {
  const course = courses.find((x) => x.programId === c.programId);
  if (!course) {
    check(`retrieval: ${c.name}`, false, `course ${c.programId} missing`);
    continue;
  }
  const hits = keywordSearch(buildCorpus(course), c.query, 3);
  const ok = c.expect === "empty" ? hits.length === 0 : hits.length > 0;
  check(`retrieval: ${c.name}`, ok, `expected ${c.expect}, got ${hits.length} hits`);
}

// --- Suite 4b: hybrid retrieval math & fallback --------------------------
console.log("\nHybrid retrieval");
check("cosineSim: identical vectors ~ 1", Math.abs(cosineSim([1, 0, 0], [1, 0, 0]) - 1) < 1e-9);
check("cosineSim: orthogonal vectors ~ 0", Math.abs(cosineSim([1, 0], [0, 1])) < 1e-9);
{
  const py = courses.find((c) => c.programId === "py101");
  if (py) {
    const corpus = buildCorpus(py);
    // No query vector / no embeddings -> must fall back to keyword search.
    const fb = hybridSearch(corpus, "what goes inside the parentheses", null, null, 3);
    check("hybridSearch falls back to keyword when no vectors", fb.length > 0);
  } else {
    check("hybridSearch fallback (py101 present)", false);
  }
}

// --- Suite 4c: embeddings coverage (catches stale/missing vectors) -------
console.log("\nEmbeddings coverage");
for (const course of courses) {
  const file = path.join(process.cwd(), "public", "embeddings", `${course.programId}.json`);
  if (!fs.existsSync(file)) {
    check(`embeddings present: ${course.programId}`, false, "run: npm run embed-courses");
    continue;
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { vectors: Record<string, number[]> };
  const missing = buildCorpus(course).filter((c) => !data.vectors[c.id]).map((c) => c.id);
  check(
    `embeddings cover all chunks: ${course.programId}`,
    missing.length === 0,
    missing.length ? `missing ${missing.join(", ")} — run npm run embed-courses` : "",
  );
}

// --- Suite 5: JSON parsing robustness ------------------------------------
console.log("\nJSON parsing");
check(
  "parseGrade: valid",
  parseGrade('{"grade":"correct","confidence":0.9,"misconception":null}')?.grade === "correct",
);
check(
  "parseGrade: extracts from surrounding text",
  parseGrade('Sure: {"grade":"wrong","confidence":0.8,"misconception":null} done')?.grade === "wrong",
);
check("parseGrade: rejects non-JSON", parseGrade("no json here") === null);
check("parseGrade: rejects invalid grade", parseGrade('{"grade":"maybe"}') === null);
check("parseVerdict: flags a problem", parseVerdict('{"too_long":true}').okay === false);
check("parseVerdict: fails open on garbage", parseVerdict("garbage").okay === true);

// --- Summary -------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
