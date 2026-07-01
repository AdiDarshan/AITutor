"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CoursePack } from "../content/types";
import {
  buildInitialState,
  makeTutorReducer,
  staticHint,
  knownWrongHint,
  type LessonItem,
} from "../tutor/tutorMachine";
import type { StudentEvent } from "../tutor/events";
import type { Speaker } from "../llm/useSpeaker";
import { buildCorpus, hybridSearch, loadEmbeddings } from "../retrieval/retrieval";
import { embedQuery } from "../retrieval/embedModel";
import { deriveQuestionMode } from "../tutor/choices";
import { highlightPy } from "./codeHighlight";
import SourceBadge from "./SourceBadge";
import styles from "./LessonPlayer.module.css";

type GenState = Record<string, "pending" | "failed" | { text: string }>;

export default function LessonPlayer({
  course,
  moduleIndex,
  lessonIndex,
  speaker,
  onComplete,
  onExit,
}: {
  course: CoursePack;
  moduleIndex: number;
  lessonIndex: number;
  speaker: Speaker;
  onComplete: (lessonId: string, mastery: number, mistakes: number) => void;
  onExit: () => void;
}) {
  const reducer = useMemo(
    () => makeTutorReducer(course, { singleLesson: true, startModule: moduleIndex, startLesson: lessonIndex }),
    [course, moduleIndex, lessonIndex],
  );
  const [state, dispatch] = useReducer(reducer, null, () =>
    buildInitialState(course, moduleIndex, lessonIndex),
  );
  const [askMode, setAskMode] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [draft, setDraft] = useState("");
  const [askDraft, setAskDraft] = useState("");
  const [gen, setGen] = useState<GenState>({});
  const startedRef = useRef<Set<string>>(new Set());

  const mod = course.modules[moduleIndex];
  const lesson = mod.lessons[lessonIndex];
  const lessonId = lesson.lessonId;

  const activeChunk = state.awaitingAnswer ? lesson.chunks[state.chunkIndex] : null;
  const questionMode = useMemo(
    () => (activeChunk ? deriveQuestionMode(activeChunk) : ({ kind: "open" } as const)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeChunk?.chunkId],
  );

  function send(event: StudentEvent) {
    if (process.env.NODE_ENV !== "production") console.log("[tutor event]", event);
    dispatch(event);
  }

  const reportedRef = useRef(false);
  useEffect(() => {
    if (state.finished && !reportedRef.current) {
      reportedRef.current = true;
      onComplete(lessonId, state.mastery[lessonId] ?? 0, state.mistakes[lessonId] ?? 0);
    }
  }, [state.finished, state.mastery, state.mistakes, lessonId, onComplete]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [state.items, revealed, state.grading, state.hinting]);

  // Reveal items one at a time (content, then question, …).
  useEffect(() => {
    if (revealed >= state.items.length) return;
    const last = revealed > 0 ? state.items[revealed - 1] : null;
    if (last && (last.kind === "content" || last.kind === "ai") && last.speakable && speaker.ready) {
      const g = gen[last.id];
      const settled = g === "failed" || (typeof g === "object" && g !== null);
      if (!settled) return;
    }
    const t = setTimeout(() => setRevealed((r) => Math.min(r + 1, state.items.length)), revealed === 0 ? 0 : 500);
    return () => clearTimeout(t);
  }, [revealed, state.items, gen, speaker.ready]);

  // Teach: generate phrasing for each approved explanation once.
  useEffect(() => {
    if (!speaker.ready) return;
    for (const it of state.items) {
      if ((it.kind !== "content" && it.kind !== "ai") || !it.speakable) continue;
      if (startedRef.current.has(it.id)) continue;
      startedRef.current.add(it.id);
      setGen((prev) => ({ ...prev, [it.id]: "pending" }));
      const approved = it.text;
      speaker.rephrase(approved).then((out) => {
        setGen((prev) => ({ ...prev, [it.id]: out ? { text: out } : "failed" }));
      });
    }
  }, [state.items, speaker.ready, speaker]);

  // Grade a submitted answer.
  const gradingRef = useRef(false);
  useEffect(() => {
    if (!state.grading || state.pendingAnswer == null || gradingRef.current) return;
    gradingRef.current = true;
    const chunk = lesson.chunks[state.chunkIndex];
    speaker
      .grade({
        question: chunk.checkQuestion,
        correctAnswer: chunk.expectedAnswer,
        acceptedAnswers: chunk.accepted,
        knownWrong: chunk.commonWrongAnswers.flatMap((w) => w.answers),
        studentAnswer: state.pendingAnswer,
      })
      .then((modelGrade) => dispatch({ type: "APPLY_GRADE", modelGrade }))
      .catch(() => dispatch({ type: "APPLY_GRADE", modelGrade: null }))
      .finally(() => {
        gradingRef.current = false;
      });
  }, [state.grading, state.pendingAnswer, state.chunkIndex, lesson, speaker]);

  // Agentic hint on a wrong answer.
  const hintingRef = useRef(false);
  useEffect(() => {
    if (!state.hinting || state.lastWrongAnswer == null || hintingRef.current) return;
    hintingRef.current = true;
    const chunk = lesson.chunks[state.chunkIndex];
    const answer = state.lastWrongAnswer;
    const fallback = staticHint(chunk, answer);
    speaker
      .hint({
        explanation: chunk.explanation,
        example: chunk.example,
        question: chunk.checkQuestion,
        correctAnswer: chunk.expectedAnswer,
        studentAnswer: answer,
        misconceptionHint: knownWrongHint(chunk, answer) ?? undefined,
        attempt: state.chunkAttempts,
      })
      .then((h) => dispatch({ type: "APPLY_HINT", text: h ?? fallback }))
      .catch(() => dispatch({ type: "APPLY_HINT", text: fallback }))
      .finally(() => {
        hintingRef.current = false;
      });
  }, [state.hinting, state.lastWrongAnswer, state.chunkIndex, state.chunkAttempts, lesson, speaker]);

  // Answer a paused-lesson question via hybrid retrieval.
  const corpus = useMemo(() => buildCorpus(course), [course]);
  const answeringRef = useRef(false);
  useEffect(() => {
    if (!state.answeringQuestion || state.pendingQuestion == null || answeringRef.current) return;
    answeringRef.current = true;
    const question = state.pendingQuestion;
    const refusal = "I don't have enough course material to answer that yet — let's keep going.";
    (async () => {
      const embeddings = await loadEmbeddings(course.programId);
      const queryVec = embeddings ? await embedQuery(question) : null;
      const hits = hybridSearch(corpus, question, queryVec, embeddings, 3);
      if (hits.length === 0) {
        dispatch({ type: "ANSWER_QUESTION", text: refusal, sources: [] });
        return;
      }
      const material = hits.map((h) => `[Source: ${h.label}]\n${h.text}`).join("\n\n");
      const ans = await speaker.answerQuestion({ explanation: material, question });
      dispatch({
        type: "ANSWER_QUESTION",
        text: ans ?? refusal,
        sources: ans ? hits.map((h) => h.label) : [],
      });
    })()
      .catch(() => dispatch({ type: "ANSWER_QUESTION", text: refusal, sources: [] }))
      .finally(() => {
        answeringRef.current = false;
      });
  }, [state.answeringQuestion, state.pendingQuestion, corpus, course, speaker]);

  function genText(id: string, approved: string, speakable?: boolean): string | null {
    if (!speakable) return approved;
    const g = gen[id];
    if (g && typeof g === "object") return g.text;
    if (g === "failed") return approved;
    return null; // writing
  }

  function submitAnswer() {
    const v = draft.trim();
    if (!v) return;
    send({ type: "SUBMIT_ANSWER", text: v });
    setDraft("");
  }

  function submitAsk() {
    const v = askDraft.trim();
    if (!v) return;
    send({ type: "ASK_QUESTION", text: v });
    setAskDraft("");
    setAskMode(false);
  }

  const allRevealed = revealed >= state.items.length;
  const canAnswer =
    state.awaitingAnswer &&
    allRevealed &&
    !state.grading &&
    !state.hinting &&
    !state.answeringQuestion &&
    !askMode;

  // Keyboard shortcuts via a window listener (works regardless of focus).
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
    if (canAnswer && questionMode.kind === "choice" && /^[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < questionMode.options.length) {
        e.preventDefault();
        send({ type: "SUBMIT_ANSWER", text: questionMode.options[idx] });
      }
      return;
    }
    if (state.finished || state.grading || state.hinting || state.answeringQuestion) return;
    const k = e.key.toLowerCase();
    if (k === "e") {
      e.preventDefault();
      send({ type: "REQUEST_EXAMPLE" });
    } else if (k === "c") {
      e.preventDefault();
      send({ type: "CONFUSED" });
    } else if (k === "a") {
      e.preventDefault();
      setAskMode((v) => !v);
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const progressPct = state.finished
    ? 100
    : Math.round((state.chunkIndex / lesson.chunks.length) * 100);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <button className={styles.back} type="button" onClick={onExit}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Lessons
          </button>
          <span className={styles.lessonLabel}>
            {lesson.title} · {lessonIndex + 1}/{mod.lessons.length}
          </span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.stack}>
          {state.items.slice(0, revealed).map((it) => renderItem(it))}
        </div>
      </div>

      {askMode && !state.finished && (
        <div className={styles.askBar}>
          <input
            className={styles.askInput}
            value={askDraft}
            onChange={(e) => setAskDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitAsk();
              }
            }}
            placeholder="Ask about this part of the lesson…"
            aria-label="Your question"
            autoFocus
          />
          <button className={styles.askSend} type="button" onClick={submitAsk}>
            Send
          </button>
        </div>
      )}

      {!state.finished && (
        <>
          <div className={styles.shortcuts}>
            <span><b>1–4</b> choose</span>
            <span><b>↵</b> answer</span>
            <span><b>E C A</b> below</span>
          </div>
          <div className={styles.actionBar}>
            <button className={styles.action} type="button" onClick={() => send({ type: "REQUEST_EXAMPLE" })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eaad5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.1v.2h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0012 2z" /></svg>
              Example<span className={styles.key}>E</span>
            </button>
            <button className={styles.action} type="button" onClick={() => send({ type: "CONFUSED" })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#808ff0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
              I&apos;m confused<span className={styles.key}>C</span>
            </button>
            <button className={`${styles.action} ${askMode ? styles.actionActive : ""}`} type="button" onClick={() => setAskMode((v) => !v)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#51985c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 01-11.9 7.8L3 21l1.7-6.1A8.5 8.5 0 1121 11.5z" /></svg>
              Ask<span className={styles.key}>A</span>
            </button>
          </div>
        </>
      )}
    </div>
  );

  function renderItem(it: LessonItem) {
    if (it.kind === "note") {
      return (
        <div key={it.id} className={styles.note}>
          {it.text}
        </div>
      );
    }

    if (it.kind === "done") {
      return (
        <div key={it.id} className={styles.doneCard}>
          <div className={styles.doneCircle}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#27764b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <div className={styles.doneTitle}>Lesson complete</div>
          <div className={styles.doneSub}>Nice work. Head back to keep going.</div>
          <button className={styles.doneBtn} type="button" onClick={onExit}>
            ← Back to lessons
          </button>
        </div>
      );
    }

    if (it.kind === "content") {
      const text = genText(it.id, it.text, it.speakable);
      return (
        <div key={it.id} className={styles.contentCard}>
          <span className={styles.lessonPill}>Lesson</span>
          <div className={styles.contentText}>
            {text === null ? <span className={styles.writing}>✨ writing…</span> : text}
          </div>
          {it.example && <pre className={styles.example}>{highlightPy(it.example)}</pre>}
        </div>
      );
    }

    if (it.kind === "ai") {
      const text = genText(it.id, it.text, it.speakable);
      return (
        <div key={it.id} className={styles.aiCard}>
          <span className={styles.aiPill}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#27764b" stroke="none"><path d="M12 2l1.9 5.8L20 9.5l-5 3.6L16.5 19 12 15.6 7.5 19 9 13.1 4 9.5l6.1-1.7z" /></svg>
            Maestro
          </span>
          <div className={styles.aiText}>
            {text === null ? <span className={styles.writing}>✨ writing…</span> : text}
          </div>
          {it.example && <pre className={styles.example}>{highlightPy(it.example)}</pre>}
          {it.sources && it.sources.length > 0 && <SourceBadge sources={it.sources} />}
        </div>
      );
    }

    // question
    if (it.status === "done") {
      return (
        <div key={it.id} className={styles.feedbackCard}>
          <span className={styles.donePill}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059273" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            Done
          </span>
          <div className={styles.donePrompt}>{it.prompt}</div>
          <div className={styles.doneAnswer}>{it.answer}</div>
          {it.correct && <div className={styles.doneCorrect}>{it.correct}</div>}
        </div>
      );
    }

    // active question — inline input
    const mc = questionMode.kind === "choice";
    return (
      <div key={it.id} className={styles.questionCard}>
        <span className={styles.checkPill}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#5c6bcb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
          Check
        </span>
        <div className={styles.questionText}>{it.prompt}</div>

        {state.grading && <div className={styles.inlineStatus}>✨ checking your answer…</div>}
        {state.hinting && <div className={styles.inlineStatus}>✨ thinking of a hint…</div>}

        {canAnswer && mc && questionMode.kind === "choice" && (
          <div className={styles.choices}>
            {questionMode.options.map((opt, i) => {
              const isWrong = it.wrong != null && norm(opt) === norm(it.wrong);
              return (
                <button
                  key={opt}
                  className={`${styles.choice} ${isWrong ? styles.choiceWrong : ""}`}
                  type="button"
                  onClick={() => send({ type: "SUBMIT_ANSWER", text: opt })}
                >
                  <span className={`${styles.radio} ${isWrong ? styles.radioWrong : ""}`} />
                  <span className={styles.choiceLabel}>{opt}</span>
                  <span className={styles.choiceNum}>{i + 1}</span>
                </button>
              );
            })}
          </div>
        )}

        {canAnswer && !mc && (
          <>
            <div className={styles.answerRow}>
              <input
                className={styles.input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitAnswer();
                  }
                }}
                placeholder="Type your answer…"
                aria-label="Your answer"
                autoFocus
              />
              <button className={styles.checkBtn} type="button" onClick={submitAnswer}>
                Check
              </button>
            </div>
            <div className={styles.pressHint}>
              Press <kbd>↵</kbd> to check
            </div>
          </>
        )}

        {it.hint && (
          <div className={styles.hintBox}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#a97907" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto", marginTop: 1 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
            <span>{it.hint}</span>
          </div>
        )}
      </div>
    );
  }
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
