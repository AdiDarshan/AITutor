"use client";

import { useEffect, useRef, useState } from "react";
import type { Lesson, LessonChunk } from "../lessonContent";
import TutorMessage from "./TutorMessage";
import StudentMessage from "./StudentMessage";
import Composer from "./Composer";
import styles from "./LessonPlayer.module.css";

type ChatMessage = {
  id: string;
  role: "tutor" | "student";
  text: string;
  example?: string;
};

/** Deterministic answer matching — no AI in MVP 1. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isCorrect(accepted: string[], raw: string): boolean {
  const got = normalize(raw);
  return accepted.some((a) => normalize(a) === got);
}

/** The tutor messages that introduce a chunk: explanation, then the check question. */
function introOf(chunk: LessonChunk): Omit<ChatMessage, "id">[] {
  return [
    { role: "tutor", text: chunk.explanation, example: chunk.example },
    { role: "tutor", text: chunk.checkQuestion },
  ];
}

export default function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const idRef = useRef(0);
  const nextId = () => `m${idRef.current++}`;

  // Seed with the first chunk's messages (deterministic ids so SSR == client).
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    introOf(lesson.chunks[0]).map((m, i) => ({ ...m, id: `seed-${i}` })),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function add(...msgs: Omit<ChatMessage, "id">[]) {
    setMessages((prev) => [...prev, ...msgs.map((m) => ({ ...m, id: nextId() }))]);
  }

  function handleSend(value: string) {
    if (finished) return;
    const chunk = lesson.chunks[currentIndex];
    add({ role: "student", text: value });

    if (!isCorrect(chunk.accepted, value)) {
      add({ role: "tutor", text: chunk.hint });
      return;
    }

    // Correct: acknowledge, then auto-advance to the next part (chat-style).
    add({ role: "tutor", text: chunk.correctFeedback });
    const next = currentIndex + 1;
    if (next < lesson.chunks.length) {
      add(...introOf(lesson.chunks[next]));
      setCurrentIndex(next);
    } else {
      add({
        role: "tutor",
        text:
          "Nice work — you wrote and reasoned about your first Python program. That's the end of this lesson. 🎉",
      });
      setFinished(true);
    }
  }

  return (
    <div className={styles.chat}>
      <div className={styles.messages} ref={messagesRef}>
        {messages.map((m) =>
          m.role === "tutor" ? (
            <TutorMessage key={m.id}>
              {m.text}
              {m.example && <pre className={styles.example}>{m.example}</pre>}
            </TutorMessage>
          ) : (
            <StudentMessage key={m.id}>{m.text}</StudentMessage>
          ),
        )}
      </div>

      <Composer
        onSend={handleSend}
        disabled={finished}
        placeholder={finished ? "Lesson complete 🎉" : "Type your answer…"}
      />
    </div>
  );
}
