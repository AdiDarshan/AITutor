# Build Progress — AI Course Tutor

High-level todo list derived from `ai_course_tutor_build_plan.md`. I work through these
in order, in small pieces, and check items off as their acceptance criteria are met.
I will not skip ahead or change the plan without asking first.

**Target course:** PY101 — Introduction to Python, following the Maestro LMS structure:
Program → Module (Week) → Lesson → chunks. Lesson types: standard, challenge, review,
weekly_review, exam, retake_review.

**Direction change (user, supersedes plan):** the app is **AI-first / model-required**. The
model auto-loads and the lesson is gated behind it (TutorGate). No "guided/static" mode toggle;
devices without WebGPU or with a failed load get an error, not a no-AI lesson. This overrides
the plan's static-fallback principle (MVP 7 / Browser & Device Plan). Per-message generation
failures still fall back to the approved text (resilience, not a user-facing mode).

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

**Current focus:** MVP 7 built (model status states + Mode A/B fallback toggle). Next: MVP 8 —
quiz bank + deterministic grading. Three courses now load via the switcher.

---

## Phase 1 — Guided tutor engine (no AI)

- [x] **MVP 0 — Skeleton + Vercel deploy.** Next.js + TS app; root route is the lesson view
  (no landing page) with placeholder tutor message + quiz card. Builds, deploys, works on
  mobile width.
  - [x] Next.js (App Router) + TypeScript scaffold, CSS Modules
  - [x] Lesson view at `/` with `TutorMessage` + `QuizCard` placeholders
  - [x] `npm run build` passes; serves 200 with content locally
  - [x] Deployed to Vercel — live at ai-tutor-5xyz.vercel.app (auto-deploys on push to main)
- [x] **MVP 1 — No-AI lesson player.** Hardcoded PY101 Week 1 "Writing your first program"
  lesson; flow: explain → check question → submit → fixed feedback → next chunk. ≥2 chunks,
  deterministic.
  - [x] 4-chunk hardcoded lesson (`app/lessonContent.ts`)
  - [x] Chat UI: `LessonPlayer` (message list) + `TutorMessage` / `StudentMessage` / `Composer`
  - [x] Deterministic string matching, retry on wrong; auto-advance after correct (no Continue button)
  - [x] Advance gated on correct answer; build passes; click-through confirmed in browser
- [x] **MVP 2 — Course Pack JSON + Zod.** Move hardcoded content into validated JSON
  (program / module / lesson / lesson-chunk shapes, incl. lesson `type`). Bad JSON fails
  validation clearly.
  - [x] `content/py101/course.json` (program → modules → lessons → chunks + common_mistakes)
  - [x] Zod schema (`app/content/courseSchema.ts`) + runtime types (`types.ts`)
  - [x] `courseLoader.ts` validates + maps snake_case JSON → camelCase, readable errors
  - [x] Page loads from JSON; lesson player unchanged; bad `type` fails with path-pinpointed error
- [x] **MVP 3 — Tutor state machine.** Explicit states + allowed transitions across the
  module → lesson → chunk hierarchy; illegal transitions impossible; debug view of current state.
  - [x] `app/tutor/stateMachine.ts` — 13 states + transition table + `assertTransition` guard
  - [x] `app/tutor/tutorMachine.ts` — pure reducer driving the chat through the machine
  - [x] `LessonPlayer` refactored to `useReducer`; ad-hoc state removed
  - [x] Debug chip shows live state + position + transition history; tsc clean
- [x] **MVP 4 — Student mastery model.** Local `StudentState` (program/module/lesson), mastery
  update fn keyed by lesson, localStorage persistence across refresh; advance uses mastery.
  - [x] `app/tutor/mastery.ts` — `updateMastery` (+0.15/+0.05/−0.1, clamped) + threshold helper
  - [x] `app/storage/progressStore.ts` — load/save/clear in localStorage (`course-tutor:progress:py101`)
  - [x] Reducer tracks mastery + mistakes; RESTORE / RESET actions; `toSavedProgress`
  - [x] Player restores on mount, persists on change; debug panel shows mastery/mistakes + reset
- [x] **MVP 5 — Quick action UI.** Structured `StudentEvent` buttons (understand/confused/
  example/quiz/ask) driving the state machine; free-text quiz answers still work.
  - [x] `app/tutor/events.ts` — `StudentEvent` union; reducer handles each event
  - [x] `QuickActions` component (optional helpers above the composer; don't gate the flow)
  - [x] Ask-mode composer (Ask a question → ASK_QUESTION); structured events logged in dev
  - [x] Quick actions surface approved content only (no AI text classification yet)

## Phase 2 — Add the local model (WebLLM)

- [x] **MVP 6 — WebLLM client-only speaker.** Client-only WebLLM; `LLMClient` interface +
  `WebLLMClient`; teach approved explanations in natural language. No server import.
  - [x] `app/llm/LLMClient.ts` interface + `WebLLMClient.ts` (lazy dynamic import, singleton)
  - [x] Model: Qwen2.5-1.5B-Instruct (1B hallucinated); `speakerPrompt` teaches the material simply
  - [x] `useSpeaker` hook + `ModelStatus` bar (enable / loading% / ready / unsupported / failed)
  - [x] Single bubble: approved text → "writing…" → generated; `grounding.ts` guard falls back on drift
  - [x] Rebuilt PY101 lesson (8 chunks from zero context → write+run a print() script)
  - [x] Visible "Start over" button; tsc + build clean; verified in browser (WebGPU)
- [x] **MVP 7 — Model status + gating (AI-first, reworked per user).** Model auto-loads; lesson
  gated behind it. (Supersedes the plan's Mode A/B/C static-fallback design.)
  - [x] `useSpeaker` auto-loads on mount; exposes `checked`/`ready`/`retry` (no enable/toggle)
  - [x] `TutorGate`: checking → downloading% → ready (lesson) / unsupported / failed+Retry
  - [x] `CourseApp` gates the lesson on `speaker.ready`; speaker lifted up, passed to player
  - [x] Removed `ModelStatus` toggle; per-message generation failure still falls back to approved text
  - [x] tsc clean

## Phase 3 — Quizzing, grading, remediation

- [ ] **MVP 8 — Quiz bank + deterministic grading.** Approved quiz items; string-match
  grading: correct advances, known-wrong → specific hint, unknown → generic clarify.
- [ ] **MVP 9 — LLM quiz grading.** JSON-only grading prompt against rubric; app enforces
  `canAdvance = correct && confidence >= 0.7`; falls back to deterministic on JSON failure.
- [ ] **MVP 10 — Remediation loop.** Detect misconception → gentle correction → hint/example
  → retry. Mistake counts stored; repeated mistakes slow the explanation.

## Phase 4 — Questions & retrieval

- [ ] **MVP 11 — Question interrupt (no retrieval).** Save state → answer from current chunk
  only → return to exact prior state; refuse safely if out of chunk scope.
- [ ] **MVP 12 — Simple retrieval.** Source chunks + keyword search (top 3); answers include
  source label; graceful "not enough course material" fallback.
- [ ] **MVP 13 — Verifier pass.** Post-speaker verifier (JSON); fail once → regenerate shorter,
  fail twice → safe fallback. No infinite regen loops.

## Phase 5 — Evaluation & quality

- [ ] **MVP 14 — Eval runner.** `npm run eval` over JSON test cases (flow, grading,
  misconceptions, interrupts, refusal, injection, length, JSON validity); pass/fail summary.
- [ ] **MVP 15 — Embeddings + hybrid retrieval.** Keyword + embedding similarity + concept
  boost; build-time or in-browser embeddings; keyword fallback if embeddings fail.
- [ ] **MVP 16 — Progress & review mode.** Module/lesson map, mastery scores, weak-topic
  review, resume from last session, session summary. Implements the Maestro `review` /
  `weekly_review` / `exam` / `retake_review` lesson types as first-class assessment/gating.

## Phase 6 — Authoring, server, hardening

- [ ] **MVP 17 — Course authoring workflow.** Manual authoring format + `validate-course` /
  `build-course` / `eval-course` scripts; new concept addable without app code changes.
- [ ] **MVP 18 — Optional Vercel server features.** Auth/progress/metadata API routes, Blob
  for large assets, server-only secrets. Local tutor still works if server fails.
- [ ] **MVP 19 — Production hardening.** Error boundaries, model-failure fallbacks, offline
  handling, course-pack versioning, state migrations, privacy notice, compatibility warnings.

---

## Definition of Done (first real MVP)

This end-to-end flow works on Vercel: open app → start PY101 Week 1 "Writing your first program"
→ tutor explains a small piece → student says "yes" → tutor still asks a tiny check → wrong answer
→ tutor detects mistake → gives hint → retry → advances only on correct → student asks a question
→ tutor answers from course material → tutor returns to the lesson.

## Key guardrails (from the plan)

- Use normal code for control; use the model only for language.
- Don't build a chatbot first. Don't start with raw PDF RAG.
- Never trust "I understand" — always verify with a tiny quiz.
- The model may recommend advancing, but the app enforces mastery rules.
- If the local model fails, keep teaching with approved static content.
- WebLLM is client-only — never import it from server components / API routes.
