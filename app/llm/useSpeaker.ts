"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LLMClient, ModelStatus } from "./LLMClient";
import { speakerPrompt } from "./prompts/speakerPrompt";
import { groundOrNull } from "./grounding";
import { getWebLLMClient } from "./WebLLMClient";

export interface Speaker {
  status: ModelStatus;
  supported: boolean;
  progress: string;
  /** Begin downloading/initializing the local model. */
  enable: () => void;
  /** Rephrase approved text; returns null if the model isn't ready or fails. */
  rephrase: (approved: string) => Promise<string | null>;
}

export function useSpeaker(): Speaker {
  const clientRef = useRef<LLMClient | null>(null);
  const [status, setStatus] = useState<ModelStatus>("not_checked");
  const [supported, setSupported] = useState(false);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    const client = getWebLLMClient();
    clientRef.current = client;
    const ok = client.isSupported();
    setSupported(ok);
    if (!ok) {
      setStatus("unsupported");
      return;
    }
    // Reflect an already-loaded model (e.g. after switching courses).
    const cur = client.status();
    if (cur === "ready" || cur === "loading") setStatus(cur);
  }, []);

  const enable = useCallback(() => {
    const client = clientRef.current;
    if (!client || !client.isSupported()) return;
    if (client.status() === "loading" || client.status() === "ready") return;
    setStatus("loading");
    client
      .init((text, pct) => setProgress(pct ? `${Math.round(pct * 100)}%` : text))
      .then(() => setStatus("ready"))
      .catch(() => setStatus("failed"));
  }, []);

  const rephrase = useCallback(async (approved: string): Promise<string | null> => {
    const client = clientRef.current;
    if (!client || client.status() !== "ready") return null;
    try {
      const out = await client.generate(speakerPrompt(approved), {
        maxTokens: 200,
        temperature: 0.3,
      });
      // Reject ungrounded/rambling output -> caller falls back to approved text.
      return groundOrNull(approved, out);
    } catch {
      return null;
    }
  }, []);

  return { status, supported, progress, enable, rephrase };
}
