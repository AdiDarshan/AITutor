# CLAUDE.md

This file gives Claude Code persistent instructions for this project. Claude reads it
automatically at the start of every session. Edit anything below to change how I work.

## Project

<!-- What is this project? One or two sentences. -->
AITutor — a browser-first guided AI course tutor (Next.js + WebLLM).
First build target: **PY101 — Introduction to Python**, following the Maestro LMS structure
(Program → Module/Week → Lesson → chunks; lesson types: standard/challenge/review/weekly_review/exam/retake_review).
- Full build plan: `ai_course_tutor_build_plan.md`
- High-level todo / progress tracker: `PROGRESS.md` (work through it in order, top to bottom)

## Instructions for Claude
important! work by plan, tell me if you want to change and let me decide.
work in small pieces.
<!-- Add your standing instructions here. Examples:
- Always run the test suite before committing.
- Prefer TypeScript over JavaScript.
- Keep responses concise.
-->

## Tech stack

- Framework: Next.js (App Router), deployed to Vercel
- Language: TypeScript
- Validation: Zod
- Styling: CSS Modules (no Tailwind)
- State: React reducer / Context (no Zustand)
- Local model: WebLLM via `@mlc-ai/web-llm` (client-only)
- Storage: localStorage (v1) → IndexedDB (later)
- Lesson lives at the root route `/` (no landing page)

## Commands

<!-- Common commands, e.g.:
- Install: `npm install`
- Dev server: `npm run dev`
- Test: `npm test`
-->

## Conventions

<!-- Code style, naming, file layout, commit message format, etc. -->
