# AI Course Tutor Build Plan

## Goal

Build a browser-first AI tutor that teaches a specific course step by step.

The product should not behave mainly like a Q&A chatbot. The normal flow should be:

```text
Tutor explains a small piece
-> checks if the student follows
-> gives a tiny quiz
-> evaluates the answer
-> remediates if needed
-> continues to the next piece
```

Questions are always allowed, but they are interrupt events. After answering, the tutor should return to the lesson flow.

The target is not to make a free/local model equal to a frontier model in general intelligence. The target is to make the whole system feel like a strong course teacher by controlling the content, teaching flow, quizzes, grading, retrieval, and verification.

---

## Core Product Principle

Use normal code for control. Use the model for language.

The app should control:

- Lesson order
- Current state
- Allowed next actions
- Quiz selection
- Mastery tracking
- Source tracking
- Fallback behavior
- Whether the tutor may advance
- Whether the tutor should remediate

The local model should handle:

- Natural tutor phrasing
- Short re-explanations
- Short-answer grading against a rubric
- Confusion detection
- Hint generation from approved hints
- Answering course questions from retrieved material

Do not ask the model to freely invent the course.

---

## Important Vercel Assumption

Vercel will host the web app, static content, and optional API routes.

The local LLM itself should run in the user's browser through WebLLM/WebGPU. Vercel serverless functions should not be used to run the local browser model.

For the first MVPs, prefer:

```text
Next.js on Vercel
+ static Course Pack files
+ client-side tutor state
+ client-side WebLLM
+ localStorage or IndexedDB for progress
```

Later, add server/database/storage only when needed.

---

## Recommended Initial Stack

```text
Framework: Next.js, deployed to Vercel
Language: TypeScript
Validation: Zod
Styling: Tailwind or simple CSS modules
State: Zustand or React reducer
Local model: WebLLM through @mlc-ai/web-llm
Storage v1: localStorage for simple state
Storage v2: IndexedDB for larger state, cached course packs, embeddings
Course content v1: JSON files in the repo
Course content v2: public files or Vercel Blob
Evals: Node/TypeScript script with JSON test cases
```

Keep the first version simple. You can change the stack later, but the architecture should stay the same.

---

## High-Level Architecture

```text
User Interface
  -> Tutor Runtime
    -> Tutor State Machine
    -> Student Mastery Model
    -> Course Pack Loader
    -> Retrieval Layer
    -> Local LLM Client
    -> Verifier
  -> Final Tutor Message
```

### Main Modules

```text
app/
  lesson UI
  quiz UI
  quick action buttons

tutor/
  state machine
  runtime orchestration
  mastery updates
  transition rules

content/
  course pack schema
  course loader
  concept files
  quiz files

llm/
  WebLLM client wrapper
  prompt templates
  JSON parsing helpers

retrieval/
  chunk search
  context builder
  simple reranker

evals/
  test cases
  eval runner
```

---

## Suggested Repo Structure

```text
course-tutor/
  app/
    page.tsx
    layout.tsx
    lesson/
      page.tsx
    components/
      LessonShell.tsx
      TutorMessage.tsx
      QuizCard.tsx
      QuickActions.tsx
      SourceBadge.tsx
      ModelStatus.tsx

  src/
    tutor/
      stateMachine.ts
      transitions.ts
      tutorRuntime.ts
      mastery.ts
      actionTypes.ts
      fallbackMessages.ts

    content/
      course.schema.ts
      courseLoader.ts
      types.ts

    llm/
      LLMClient.ts
      WebLLMClient.ts
      safeJson.ts
      prompts/
        speakerPrompt.ts
        controllerPrompt.ts
        gradingPrompt.ts
        verifierPrompt.ts
        questionAnswerPrompt.ts

    retrieval/
      chunkTypes.ts
      simpleKeywordSearch.ts
      contextBuilder.ts
      retrievalRuntime.ts

    storage/
      progressStore.ts
      localStorageStore.ts
      indexedDbStore.ts

    evals/
      evalRunner.ts
      checks.ts
      testCases/
        lessonFlow.json
        quizGrading.json
        questionInterrupts.json
        promptInjection.json

  content/
    probability_101/
      course.json
      concepts/
        conditional_probability.json
      sources/
        lecture_02_slides.json
        lecture_02_transcript.json

  public/
    content/
      probability_101/
        course-manifest.json

  docs/
    PRODUCT_SPEC.md
    COURSE_PACK_FORMAT.md
    EVALS.md
    DEPLOYMENT.md
```

---

# Micro-MVP Roadmap

Each MVP should produce something usable and deployable. Do not wait until the full product is complete.

---

## MVP 0: Project Skeleton and Vercel Deployment

### Goal

Create a minimal Next.js app and deploy it to Vercel.

### Build

- Create Next.js project with TypeScript.
- Add a simple landing page.
- Add a `/lesson` route.
- Add a placeholder tutor message.
- Add a placeholder quiz card.
- Add a basic deployment through Vercel.

### Do Not Build Yet

- No AI.
- No Course Pack parser.
- No retrieval.
- No login.
- No database.

### Vercel Notes

- Keep the app deployable from day one.
- Use Vercel Preview Deployments for every branch.
- Do not add heavy model files to the repo.
- Do not add secrets yet.

### Acceptance Criteria

- The app opens on Vercel.
- `/lesson` shows a static tutor message.
- The UI works on desktop and mobile width.
- Build passes with `npm run build`.

### Manual Test

```text
Open deployed URL
-> click Start Lesson
-> see static lesson page
```

---

## MVP 1: No-AI Lesson Player

### Goal

Prove the teaching flow works without any model.

### Build

Hardcode one concept: Conditional Probability.

The flow should be:

```text
Show explanation chunk 1
-> ask check question
-> user submits answer
-> show fixed feedback
-> continue to chunk 2
```

### Content

Create one hardcoded lesson object in TypeScript:

```ts
const conditionalProbabilityLesson = {
  conceptId: "conditional_probability",
  title: "Conditional Probability",
  chunks: [
    {
      chunkId: "given_that_intro",
      explanation: "Conditional probability means we ask for a chance after we already know something else happened.",
      checkQuestion: "In P(A | B), which event is already known?",
      expectedAnswer: "B"
    }
  ]
};
```

### Do Not Build Yet

- No LLM.
- No grading model.
- No retrieval.
- No generated explanations.

### Acceptance Criteria

- Student can move through at least 2 chunks.
- Student can answer a check question.
- The app gives deterministic feedback.
- The tutor does not move forward until the student interacts.

### Manual Test

```text
Tutor: explains P(A | B)
Student: B
Tutor: says correct
Tutor: moves to next piece
```

---

## MVP 2: Course Pack JSON Format

### Goal

Move hardcoded content into validated JSON files.

### Build

- Define Course Pack schema.
- Add Zod validation.
- Load course content from JSON.
- Show validation errors clearly during development.

### Course Pack Minimum Shape

```json
{
  "course_id": "probability_101",
  "course_title": "Probability 101",
  "teacher_style": {
    "tone": "patient, clear, concise",
    "rules": [
      "explain one idea at a time",
      "ask short check questions",
      "do not give long lectures"
    ]
  },
  "concepts": []
}
```

### Concept Minimum Shape

```json
{
  "concept_id": "conditional_probability",
  "title": "Conditional Probability",
  "order": 1,
  "prerequisites": [],
  "learning_goal": "Student can identify the condition in P(A | B).",
  "lesson_chunks": [],
  "quiz_items": [],
  "common_mistakes": []
}
```

### Lesson Chunk Minimum Shape

```json
{
  "chunk_id": "given_that_intro",
  "goal": "Explain what 'given that' means.",
  "approved_explanation": "Conditional probability means asking for a chance after we already know something else happened.",
  "simple_example": "What is the chance it rains, given that the sky is cloudy?",
  "check_question": "In P(A | B), which event is already known?",
  "expected_answer": "B",
  "source_refs": ["Lecture 2, slide 14"]
}
```

### Vercel Notes

For the first real deployment, put course JSON either:

```text
/content/... imported at build time
```

or:

```text
/public/content/... fetched by the browser
```

For very small hand-authored course packs, importing JSON at build time is simplest. For course packs that should be replaceable without rebuilding, public static files or external storage are better.

### Acceptance Criteria

- Lesson content loads from JSON.
- Bad JSON fails validation.
- The lesson player still works after replacing hardcoded content.

---

## MVP 3: Tutor State Machine

### Goal

Make the teaching flow explicit and controlled.

### Build

Create a state machine with states:

```ts
type TutorState =
  | "START_LESSON"
  | "INTRODUCE_CONCEPT"
  | "EXPLAIN_CHUNK"
  | "ASK_UNDERSTANDING"
  | "ASK_MICRO_QUIZ"
  | "EVALUATE_ANSWER"
  | "GIVE_HINT"
  | "REMEDIATE"
  | "ADVANCE_CHUNK"
  | "ADVANCE_CONCEPT"
  | "END_LESSON";
```

Create allowed transitions:

```ts
const transitions = {
  START_LESSON: ["INTRODUCE_CONCEPT"],
  INTRODUCE_CONCEPT: ["EXPLAIN_CHUNK"],
  EXPLAIN_CHUNK: ["ASK_UNDERSTANDING"],
  ASK_UNDERSTANDING: ["ASK_MICRO_QUIZ"],
  ASK_MICRO_QUIZ: ["EVALUATE_ANSWER"],
  EVALUATE_ANSWER: ["ADVANCE_CHUNK", "GIVE_HINT", "REMEDIATE"],
  GIVE_HINT: ["ASK_MICRO_QUIZ"],
  REMEDIATE: ["ASK_MICRO_QUIZ"],
  ADVANCE_CHUNK: ["EXPLAIN_CHUNK", "ADVANCE_CONCEPT"],
  ADVANCE_CONCEPT: ["INTRODUCE_CONCEPT", "END_LESSON"]
};
```

### Do Not Build Yet

- The model should not choose states yet.
- Keep transitions deterministic.

### Acceptance Criteria

- Illegal transitions are impossible.
- Every user action moves through the state machine.
- The app can display current state for debugging.

### Manual Test

```text
Student cannot jump from EXPLAIN_CHUNK directly to ADVANCE_CONCEPT.
Student must pass through check/quiz flow.
```

---

## MVP 4: Student Mastery Model

### Goal

Track whether the student probably understands each concept.

### Build

Create local student state:

```ts
interface StudentState {
  studentId: string;
  courseId: string;
  currentConceptId: string;
  currentChunkId: string;
  currentState: TutorState;
  mastery: Record<string, number>;
  mistakes: Record<string, number>;
  recentAnswers: StudentAnswerRecord[];
}
```

Add simple mastery update:

```ts
function updateMastery(oldScore: number, result: "correct" | "partial" | "wrong") {
  if (result === "correct") return Math.min(1, oldScore + 0.15);
  if (result === "partial") return Math.min(1, oldScore + 0.05);
  return Math.max(0, oldScore - 0.1);
}
```

### Storage

Start with localStorage:

```text
localStorage key: course-tutor:progress:probability_101
```

Move to IndexedDB later if the state becomes large.

### Acceptance Criteria

- Student progress persists after page refresh.
- Correct answers increase mastery.
- Wrong answers decrease mastery or increment mistake count.
- The tutor can decide whether to advance based on mastery.

---

## MVP 5: Quick Action UI

### Goal

Reduce ambiguity before using AI.

### Build

Add quick buttons:

```text
I understand
I'm confused
Give me an example
Quiz me
Go slower
Ask a question
Continue
```

Each button should send a structured event, not just text.

Example:

```ts
type StudentEvent =
  | { type: "UNDERSTANDS" }
  | { type: "CONFUSED" }
  | { type: "REQUEST_EXAMPLE" }
  | { type: "REQUEST_QUIZ" }
  | { type: "ASK_QUESTION"; text: string }
  | { type: "SUBMIT_ANSWER"; text: string };
```

### Do Not Build Yet

- No AI classification of free text.
- Buttons should control the main path.

### Acceptance Criteria

- Button clicks move the tutor through the state machine.
- Student can still type a free-form answer for quizzes.
- The app logs structured events in development mode.

---

## MVP 6: WebLLM Client-Only Speaker

### Goal

Add the local model only for natural phrasing.

The deterministic engine still decides what to teach.

### Build

- Add WebLLM as a client-only dependency.
- Create `LLMClient` interface.
- Create `WebLLMClient` implementation.
- Dynamically load WebLLM only in client components.
- Add a model loading status UI.
- Use WebLLM to rewrite approved explanations into natural tutor language.

### Important Implementation Rule

Do not import WebLLM from server components.

Use a client component or a client-side wrapper:

```ts
"use client";

// Load WebLLM only in the browser.
const webllm = await import("@mlc-ai/web-llm");
```

### Speaker Prompt

```text
You are a course tutor.
Rewrite the approved explanation as a warm, short teacher message.
Use only the approved content.
Do not add new facts.
Use 2-5 sentences.
Ask at most one short check question.

Approved explanation:
{{approved_explanation}}

Check question:
{{check_question}}
```

### Vercel Notes

- This should run in the browser after deployment.
- The Vercel server is only serving the app bundle.
- WebGPU availability depends on the user's browser/device.
- Add a fallback UI when WebGPU is unavailable.

### Acceptance Criteria

- Deployed app loads without server errors.
- Browser console has no server-side WebLLM import error.
- If WebGPU is available, model can generate a short tutor message.
- If WebGPU is unavailable, the app still uses the approved static explanation.

---

## MVP 7: Model Status, Loading, and Fallbacks

### Goal

Make local model behavior usable in production.

### Build

Add model states:

```ts
type ModelStatus =
  | "not_checked"
  | "unsupported"
  | "loading"
  | "ready"
  | "failed";
```

Add UI states:

```text
Checking local AI support...
Local AI unsupported on this device. Using guided lesson mode.
Downloading local model...
Local AI ready.
Local AI failed. Using static tutor mode.
```

### Build Fallback Modes

```text
Mode A: AI speaker enabled
Mode B: static approved explanations
Mode C: search-only or lesson-only mode
```

### Do Not Build Yet

- No cloud fallback.
- No paid API fallback.

### Acceptance Criteria

- Unsupported devices still get a working lesson.
- Failed model loading does not break the app.
- The student can continue the lesson without AI.

---

## MVP 8: Quiz Bank and Deterministic Grading v1

### Goal

Add approved quizzes and simple grading before using the model as grader.

### Build

Add quiz items to Course Pack:

```json
{
  "quiz_id": "cp_q1",
  "concept_id": "conditional_probability",
  "difficulty": 1,
  "question": "In P(A | B), which event is already known?",
  "correct_answer": "B",
  "accepted_answers": ["B", "event B", "the event after the bar"],
  "common_wrong_answers": [
    {
      "pattern": "A",
      "misconception": "confuses target event with condition"
    }
  ],
  "hints": [
    "Look at the event after the vertical bar.",
    "The event after the bar is the given information."
  ]
}
```

Start with deterministic string matching:

```text
B -> correct
A -> known misconception
empty -> ask again
other -> unknown/partial
```

### Acceptance Criteria

- Tutor asks approved quizzes only.
- Correct answer advances the lesson.
- Known wrong answer triggers a specific hint.
- Unknown answer triggers a generic clarification.

---

## MVP 9: LLM Quiz Grading

### Goal

Use the model to grade short free-text answers against an approved rubric.

### Build

Add a grading prompt that returns JSON only.

Input:

```text
quiz question
correct answer
rubric
common wrong answers
student answer
```

Output:

```json
{
  "grade": "correct",
  "detected_misconception": null,
  "confidence": 0.91,
  "feedback_type": "advance"
}
```

### Safety Rule

The model grades only. It does not decide final advancement alone.

The app should decide:

```ts
const canAdvance = grade === "correct" && confidence >= 0.7;
```

### Acceptance Criteria

- Model correctly grades obvious correct answers.
- Model correctly catches common wrong answers.
- Low-confidence grading does not advance the student.
- If JSON parsing fails, app falls back to deterministic grading.

---

## MVP 10: Remediation Loop

### Goal

Make the tutor useful when the student is wrong.

### Build

When a student answers incorrectly:

```text
detect misconception
-> show gentle correction
-> give one hint or smaller example
-> ask a retry question
```

Example behavior:

```text
Student: A
Tutor: Almost. This is the common mix-up. In P(A | B), A is what we are trying to find, and B is what we already know. Look after the vertical bar. Try again: which event is already known?
```

### Course Pack Addition

```json
{
  "mistake_id": "confuses_target_with_condition",
  "description": "Student thinks A is already known in P(A | B).",
  "remediation": "Point to the event after the vertical bar and retry with the same notation."
}
```

### Acceptance Criteria

- Wrong answers do not just get marked wrong.
- Tutor gives a hint and retries.
- Mistake count is stored in student state.
- Repeated mistakes trigger slower explanation.

---

## MVP 11: Question Interrupt Mode Without Retrieval

### Goal

Allow questions while preserving the lesson flow.

### Build

Add a question path:

```text
student asks question
-> save current lesson state
-> answer using current lesson chunk only
-> return to current lesson question
```

### Prompt

```text
Answer the student's question using only the current lesson chunk.
If the lesson chunk is not enough, say you do not have enough course material.
Keep the answer short.
Then return to the lesson.

Current lesson chunk:
{{lesson_chunk}}

Student question:
{{question}}
```

### Acceptance Criteria

- Student can ask a question from the current chunk.
- Tutor answers briefly.
- Tutor returns to the exact prior state.
- If answer is outside the current chunk, tutor refuses safely.

---

## MVP 12: Simple Retrieval for Question Interrupts

### Goal

Answer questions using more than the current chunk, but still from course material only.

### Build

Create course source chunks:

```json
{
  "chunk_id": "lecture_02_slide_14",
  "concept_id": "conditional_probability",
  "source_label": "Lecture 2, slide 14",
  "text": "Conditional probability P(A | B) means...",
  "keywords": ["conditional probability", "given", "P(A|B)"]
}
```

Start with simple keyword search:

```text
lowercase query
-> score chunks by keyword overlap
-> return top 3 chunks
```

### Do Not Build Yet

- No embeddings.
- No vector DB.
- No server search.

### Acceptance Criteria

- Student can ask a question related to another chunk.
- System retrieves relevant course chunks.
- Tutor answer includes source label.
- If retrieval fails, tutor says it does not have enough course material.

---

## MVP 13: Verifier Pass

### Goal

Reduce stupid or invented answers.

### Build

After the speaker generates a message, run a verifier call.

Verifier input:

```text
approved content
retrieved context if any
draft tutor message
current action
```

Verifier output:

```json
{
  "okay_to_show": true,
  "grounded_in_course": true,
  "invented_fact": false,
  "too_long": false,
  "too_many_questions": false,
  "wrong_or_misleading": false,
  "reason": null
}
```

### Failure Behavior

```text
Verifier passes -> show message
Verifier fails once -> regenerate shorter
Verifier fails twice -> use safe fallback message
```

### Acceptance Criteria

- Unsupported claims are caught in common test cases.
- Too-long messages are rejected.
- Messages with too many questions are rejected.
- The app never gets stuck in infinite regeneration.

---

## MVP 14: Evaluation Runner

### Goal

Stop judging quality by vibe.

### Build

Create local eval script:

```text
npm run eval
```

Test categories:

```text
lesson flow
quiz grading
misconception detection
question interrupts
out-of-scope refusal
prompt injection resistance
message length
JSON validity
```

### Example Test Case

```json
{
  "test_id": "cp_wrong_condition_001",
  "state": "ASK_MICRO_QUIZ",
  "concept_id": "conditional_probability",
  "student_message": "A",
  "expected_grade": "wrong",
  "expected_misconception": "confuses_target_with_condition",
  "expected_next_action": "give_hint",
  "must_include": ["B"],
  "must_not_include": ["Correct"]
}
```

### Acceptance Criteria

- Evals run locally.
- Evals produce pass/fail summary.
- Failed tests show expected vs actual.
- You run evals before changing prompts or model.

---

## MVP 15: Embeddings and Better Retrieval

### Goal

Improve question answering beyond keyword search.

### Build

Add hybrid retrieval:

```text
keyword score
+ embedding similarity
+ concept metadata boost
```

For the first version, embeddings can be computed:

```text
at build time for static content
or in browser for small course packs
```

Store embeddings in:

```text
JSON for tiny course
IndexedDB for larger course
```

### Acceptance Criteria

- Retrieval finds relevant chunks even when student uses different wording.
- Question answers improve compared to keyword-only search.
- Retrieval remains fast enough in the browser.
- If embeddings fail, keyword retrieval still works.

---

## MVP 16: Course Progress and Review Mode

### Goal

Make the tutor feel personalized.

### Build

Add:

```text
concept map
mastery scores
weak-topic review
continue from last session
session summary
```

Review mode flow:

```text
find weakest concept
-> ask diagnostic question
-> remediate
-> retry quiz
-> update mastery
```

### Acceptance Criteria

- Student can resume after refresh.
- Student can see weak concepts.
- Tutor reviews concepts with low mastery.
- Repeated mistakes trigger prerequisite review.

---

## MVP 17: Course Authoring Workflow

### Goal

Make it easier to create new courses.

### Build

Start with a manual authoring format:

```text
course.json
concept files
quiz files
source chunk files
```

Then add scripts:

```text
npm run validate-course
npm run build-course
npm run eval-course
```

### Validation Rules

Every concept must have:

- Title
- Learning goal
- At least one lesson chunk
- At least one quiz
- Source reference
- Common mistake list

Every quiz must have:

- Correct answer
- Rubric or accepted answers
- At least one hint

### Acceptance Criteria

- A new concept can be added without changing app code.
- Invalid course files fail validation.
- Course pack builds into deployable static JSON.

---

## MVP 18: Optional Server Features on Vercel

### Goal

Add server-side functionality only after the browser-first version works.

### Possible Additions

```text
user accounts
server-synced progress
teacher dashboard
course upload pipeline
admin review tools
analytics
cloud fallback model
```

### Vercel API Route Uses

Good uses:

```text
auth callbacks
saving progress
serving signed upload URLs
course metadata APIs
teacher dashboard APIs
cloud fallback call if you choose to add one
```

Avoid using Vercel Functions for:

```text
long course-processing jobs
large model inference
slow background transformations
heavy document parsing during user requests
```

For heavy processing, prefer an offline pipeline or a background system designed for that job.

### Acceptance Criteria

- Server features are optional.
- Local browser tutor still works if server APIs fail.
- No API secrets are exposed to the browser.

---

## MVP 19: Production Hardening

### Goal

Make the product robust enough for real students.

### Build

Add:

```text
error boundaries
model failure fallbacks
offline/poor-network handling
course pack versioning
local state migrations
analytics for failures
privacy notice
source display
model capability check
browser compatibility warning
```

### Acceptance Criteria

- App does not crash when model fails.
- App does not lose progress after course pack update.
- App explains when local AI is unsupported.
- App has useful logs for debugging.

---

# First Concrete Course Target

Start with exactly one concept.

## Course

```text
Probability 101
```

## Concept

```text
Conditional Probability
```

## Lesson Chunks

1. What "given that" means
2. Meaning of `P(A | B)`
3. Difference between `P(A | B)` and `P(B | A)`
4. Simple real-world example

## Quizzes

1. In `P(A | B)`, which event is already known?
2. In "chance of passing given that the student studied," what is the condition?
3. Are `P(A | B)` and `P(B | A)` always the same?
4. Write a sentence that matches `P(rain | cloudy)`.

## Common Mistakes

- Student thinks A is already known.
- Student swaps A and B.
- Student thinks conditional probability means causation.
- Student thinks `P(A | B)` always equals `P(B | A)`.

---

# Tutor Runtime Design

## Runtime Loop

```ts
async function handleStudentEvent(event: StudentEvent) {
  const state = getStudentState();
  const course = getCoursePack(state.courseId);
  const lessonChunk = getCurrentLessonChunk(course, state);

  const deterministicResult = handleDeterministicEvent(event, state, lessonChunk);

  if (deterministicResult.needsQuestionAnswering) {
    return handleQuestionInterrupt(event, state, course);
  }

  if (deterministicResult.needsLLMGrading) {
    const grade = await gradeStudentAnswer(event, lessonChunk);
    const updatedState = applyGrade(state, grade);
    return generateTutorMessage(updatedState, lessonChunk, grade);
  }

  return generateTutorMessage(deterministicResult.nextState, lessonChunk);
}
```

## Question Interrupt Loop

```ts
async function handleQuestionInterrupt(event, state, course) {
  const savedState = { ...state };

  const chunks = retrieveCourseChunks({
    query: event.text,
    courseId: state.courseId,
    conceptId: state.currentConceptId
  });

  const draft = await answerQuestionFromChunks(event.text, chunks, savedState);
  const verification = await verifyTutorMessage(draft, chunks);

  restoreState(savedState);

  if (!verification.okay_to_show) {
    return "I don't have enough course material to answer that confidently. Let's return to the current step.";
  }

  return draft + "\n\nBack to where we were: " + getCurrentPrompt(savedState);
}
```

---

# Prompt Templates

## Speaker Prompt

```text
You are a course tutor for {{course_title}}.

You teach step by step. You are not a general chatbot.

Rules:
1. Use only the approved lesson content.
2. Do not add facts, formulas, examples, or course policy.
3. Keep the answer short: 2-5 sentences.
4. Explain one idea at a time.
5. Ask at most one small question.
6. If the student is wrong, correct gently and retry.
7. If there is not enough course material, say so.

Teacher style:
{{teacher_style}}

Current action:
{{action}}

Approved lesson content:
{{lesson_chunk}}

Student message:
{{student_message}}
```

## Grading Prompt

```text
You are grading a student's short answer for a course tutor.

Use only the quiz rubric. Return JSON only.

Quiz question:
{{question}}

Correct answer:
{{correct_answer}}

Rubric:
{{rubric}}

Common wrong answers:
{{common_wrong_answers}}

Student answer:
{{student_answer}}

Return:
{
  "grade": "correct" | "partial" | "wrong",
  "detected_misconception": string | null,
  "confidence": number,
  "feedback_type": "advance" | "hint" | "remediate" | "ask_again"
}
```

## Verifier Prompt

```text
You are a strict verifier for a course tutor.

Check whether the draft message:
- uses only approved course content
- avoids invented facts
- is short enough
- asks at most one question
- matches the requested teaching action
- is safe to show

Approved content:
{{approved_content}}

Draft message:
{{draft_message}}

Return JSON only:
{
  "okay_to_show": boolean,
  "grounded_in_course": boolean,
  "invented_fact": boolean,
  "too_long": boolean,
  "too_many_questions": boolean,
  "wrong_or_misleading": boolean,
  "reason": string | null
}
```

---

# Vercel Deployment Plan

## Deployment Strategy by MVP

### MVP 0-5

Use Vercel as a normal frontend host.

```text
Next.js app
+ static JSON content
+ no server API
+ no secrets
```

### MVP 6-13

Use Vercel to serve the app. WebLLM runs client-side.

```text
Next.js app on Vercel
+ WebLLM imported only in client code
+ model loading in browser
+ static fallback if WebGPU unsupported
```

### MVP 14-17

Evals and course-building scripts run locally or in CI, not during normal user requests.

```text
npm run validate-course
npm run eval
npm run build-course
```

### MVP 18+

Add Vercel server features only when needed.

```text
API routes for auth/progress/course metadata
Vercel Blob for larger course assets or uploaded files
environment variables for server-only secrets
```

---

## Vercel Guardrails

### 1. Keep WebLLM client-only

Bad:

```ts
// Server component or API route
import * as webllm from "@mlc-ai/web-llm";
```

Better:

```ts
"use client";

async function loadWebLLM() {
  const webllm = await import("@mlc-ai/web-llm");
  return webllm;
}
```

### 2. Do not commit huge model artifacts

Use WebLLM's model loading/caching flow or external model hosting configured by WebLLM.

The repo should contain:

```text
app code
course JSON
small demo content
schemas
prompts
evals
```

The repo should not contain:

```text
multi-GB model files
large raw videos
large unprocessed lecture recordings
```

### 3. Use static content first

For the first course, store Course Pack JSON in the repo.

When course assets become large or user-uploaded, move to object storage such as Vercel Blob or another storage provider.

### 4. Avoid long server work during requests

Do not parse full PDFs, transcribe videos, or build embeddings during a user request.

Prefer:

```text
offline preprocessing
build-time processing
admin-only processing
background jobs outside the critical lesson path
```

### 5. Add environment variables only for server secrets

Do not expose private API keys in client code.

For public client config, use safe public env vars. For private model/API fallback later, keep keys server-side only.

---

# Browser and Device Plan

Because the local model depends on browser/device capability, the app needs multiple modes.

## Capability Modes

```text
Mode A: Local AI ready
Mode B: Local AI loading
Mode C: Local AI unsupported
Mode D: Local AI failed
```

## Product Behavior

### Local AI ready

```text
Use WebLLM speaker, grading, verifier.
```

### Local AI loading

```text
Show approved static lesson content.
Allow student to continue.
Upgrade to AI phrasing when ready.
```

### Local AI unsupported

```text
Use deterministic lesson mode.
Optionally offer cloud fallback later.
```

### Local AI failed

```text
Show simple error.
Continue with static lesson mode.
```

---

# Quality Gates

Use these quality gates before expanding to more concepts.

## Minimum Before Adding a Second Concept

- One concept has 4 lesson chunks.
- One concept has at least 4 quiz items.
- Tutor can remediate at least 2 common mistakes.
- Student progress persists locally.
- App deploys to Vercel.
- Unsupported WebGPU devices still get a usable lesson.
- At least 30 eval cases exist.

## Minimum Before Adding More Courses

- Course Pack schema is stable.
- Course validation script exists.
- Retrieval works from source chunks.
- Verifier catches common hallucination cases.
- Eval pass rate is good enough for your internal threshold.
- Course authoring workflow is documented.

---

# Definition of Done for the First Real MVP

The first real MVP is done when this flow works on Vercel:

```text
Student opens the app
-> starts Conditional Probability lesson
-> tutor explains one small piece
-> student says "yes"
-> tutor still asks a tiny check
-> student answers incorrectly
-> tutor detects the mistake
-> tutor gives a hint
-> student retries
-> tutor advances only after a correct answer
-> student asks a question
-> tutor answers from course material
-> tutor returns to the lesson
```

This is the core magic.

---

# Build Order Summary

```text
MVP 0: Deploy skeleton to Vercel
MVP 1: No-AI lesson player
MVP 2: Course Pack JSON schema
MVP 3: Tutor state machine
MVP 4: Student mastery model
MVP 5: Quick action UI
MVP 6: WebLLM client-only speaker
MVP 7: Model loading and fallback states
MVP 8: Approved quiz bank and deterministic grading
MVP 9: LLM quiz grading
MVP 10: Remediation loop
MVP 11: Question interrupt mode without retrieval
MVP 12: Simple retrieval
MVP 13: Verifier pass
MVP 14: Eval runner
MVP 15: Embeddings and better retrieval
MVP 16: Progress and review mode
MVP 17: Course authoring workflow
MVP 18: Optional Vercel server features
MVP 19: Production hardening
```

---

# The Most Important Warnings

## Do Not Build a Chatbot First

A chatbot makes the model carry too much responsibility.

Build a guided tutor engine first.

## Do Not Start With Raw PDF RAG

Raw PDF RAG will probably produce inconsistent teaching.

Instead:

```text
course materials
-> concepts
-> lesson chunks
-> quiz items
-> rubrics
-> source chunks
```

## Do Not Trust "I Understand"

Always verify with a tiny quiz.

## Do Not Let the Model Advance the Student Alone

The model may recommend advancement, but the app should enforce mastery rules.

## Do Not Hide Model Failure

If the local model fails, the app should still teach using approved static content.

---

# Immediate Next Actions

Do these now:

1. Create the Next.js project.
2. Deploy the empty app to Vercel.
3. Create one hardcoded lesson for Conditional Probability.
4. Build the no-AI lesson player.
5. Move that lesson into Course Pack JSON.
6. Add the state machine.
7. Add WebLLM only after the basic teaching flow works.

---

# Reference Links

Use these docs while building:

- Vercel Next.js deployment docs: https://vercel.com/docs/frameworks/full-stack/nextjs
- Next.js public folder docs: https://nextjs.org/docs/pages/api-reference/file-conventions/public-folder
- Vercel Blob docs: https://vercel.com/docs/vercel-blob
- Vercel environment variables docs: https://vercel.com/docs/environment-variables
- WebLLM docs: https://webllm.mlc.ai/docs/
- WebLLM GitHub repo: https://github.com/mlc-ai/web-llm
- WebLLM API reference: https://webllm.mlc.ai/docs/user/api_reference.html
- MDN WebGPU docs: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
