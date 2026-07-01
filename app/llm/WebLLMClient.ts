"use client";

import {
  MODEL_ID,
  type GenerateOptions,
  type LLMClient,
  type ModelStatus,
  type ProgressCallback,
} from "./LLMClient";

// WebLLM types are loaded dynamically so the library is never imported on the server.
type MLCEngine = {
  chat: {
    completions: {
      create: (req: {
        messages: { role: string; content: string }[];
        temperature?: number;
        max_tokens?: number;
      }) => Promise<{ choices: { message: { content: string | null } }[] }>;
    };
  };
};

class WebLLMClient implements LLMClient {
  private engine: MLCEngine | null = null;
  private _status: ModelStatus = "not_checked";

  isSupported(): boolean {
    return typeof navigator !== "undefined" && "gpu" in navigator;
  }

  status(): ModelStatus {
    return this._status;
  }

  async init(onProgress?: ProgressCallback): Promise<void> {
    if (this._status === "ready" || this._status === "loading") return;
    if (!this.isSupported()) {
      this._status = "unsupported";
      return;
    }

    this._status = "loading";
    try {
      // Client-only: WebLLM is imported here, never at the top level.
      const webllm = await import("@mlc-ai/web-llm");
      this.engine = (await webllm.CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (report: { text: string; progress: number }) =>
          onProgress?.(report.text, report.progress),
      })) as unknown as MLCEngine;
      this._status = "ready";
    } catch (err) {
      console.error("WebLLM init failed", err);
      this._status = "failed";
      throw err;
    }
  }

  async generate(prompt: string, opts?: GenerateOptions): Promise<string> {
    if (!this.engine) throw new Error("WebLLM engine not ready");
    const label = opts?.label ?? "llm";

    if (process.env.NODE_ENV !== "production") {
      console.groupCollapsed(`%c[LLM ${label}] prompt`, "color:#2f6fed;font-weight:bold");
      console.log(prompt);
      console.groupEnd();
    }

    const res = await this.engine.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 200,
    });
    const out = res.choices[0]?.message?.content?.trim() ?? "";

    if (process.env.NODE_ENV !== "production") {
      console.log(`%c[LLM ${label}] response`, "color:#14532d;font-weight:bold", out);
    }

    return out;
  }
}

let singleton: WebLLMClient | null = null;

export function getWebLLMClient(): LLMClient {
  if (!singleton) singleton = new WebLLMClient();
  return singleton;
}
