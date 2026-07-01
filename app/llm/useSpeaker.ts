"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LLMClient, ModelStatus } from "./LLMClient";
import { speakerPrompt } from "./prompts/speakerPrompt";
import { groundOrNull } from "./grounding";
import { gradingPrompt, parseGrade, type GradeInput, type GradeResult } from "./grade";
import { questionAnswerPrompt, type QuestionInput } from "./prompts/questionAnswerPrompt";
import { getWebLLMClient } from "./WebLLMClient";

export interface Speaker {
  status: ModelStatus;
  supported: boolean;
  /** True once device support has been determined. */
  checked: boolean;
  progress: string;
  /** Model loaded and ready to teach. */
  ready: boolean;
  /** Retry loading after a failure. */
  retry: () => void;
  /** Generate tutor phrasing from approved text; null if it drifts or fails. */
  rephrase: (approved: string) => Promise<string | null>;
  /** Grade a student answer; null if the model isn't ready or returns junk. */
  grade: (input: GradeInput) => Promise<GradeResult | null>;
  /** Answer a question from the current chunk; null if not ready or fails. */
  answerQuestion: (input: QuestionInput) => Promise<string | null>;
}

export function useSpeaker(): Speaker {
  const clientRef = useRef<LLMClient | null>(null);
  const [status, setStatus] = useState<ModelStatus>("not_checked");
  const [supported, setSupported] = useState(false);
  const [checked, setChecked] = useState(false);
  const [progress, setProgress] = useState("");

  const load = useCallback((client: LLMClient) => {
    setStatus("loading");
    client
      .init((text, pct) => setProgress(pct ? `${Math.round(pct * 100)}%` : text))
      .then(() => setStatus("ready"))
      .catch(() => setStatus("failed"));
  }, []);

  // The app is AI-first: auto-load the model on mount.
  useEffect(() => {
    const client = getWebLLMClient();
    clientRef.current = client;
    const ok = client.isSupported();
    setSupported(ok);
    setChecked(true);
    if (!ok) {
      setStatus("unsupported");
      return;
    }
    const cur = client.status();
    if (cur === "ready") setStatus("ready");
    else if (cur === "loading") setStatus("loading");
    else load(client);
  }, [load]);

  const retry = useCallback(() => {
    const client = clientRef.current;
    if (client && client.isSupported()) load(client);
  }, [load]);

  const rephrase = useCallback(async (approved: string): Promise<string | null> => {
    const client = clientRef.current;
    if (!client || client.status() !== "ready") return null;
    try {
      const out = await client.generate(speakerPrompt(approved), {
        maxTokens: 200,
        temperature: 0.3,
      });
      return groundOrNull(approved, out);
    } catch {
      return null;
    }
  }, []);

  const grade = useCallback(async (input: GradeInput): Promise<GradeResult | null> => {
    const client = clientRef.current;
    if (!client || client.status() !== "ready") return null;
    try {
      // temperature 0: grading should be as deterministic as possible.
      const out = await client.generate(gradingPrompt(input), {
        maxTokens: 200,
        temperature: 0,
      });
      return parseGrade(out);
    } catch {
      return null;
    }
  }, []);

  const answerQuestion = useCallback(
    async (input: QuestionInput): Promise<string | null> => {
      const client = clientRef.current;
      if (!client || client.status() !== "ready") return null;
      try {
        const out = await client.generate(questionAnswerPrompt(input), {
          maxTokens: 220,
          temperature: 0.3,
        });
        return out.trim() || null;
      } catch {
        return null;
      }
    },
    [],
  );

  return {
    status,
    supported,
    checked,
    progress,
    ready: status === "ready",
    retry,
    rephrase,
    grade,
    answerQuestion,
  };
}
