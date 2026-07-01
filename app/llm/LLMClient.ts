// Abstraction over a local LLM so the rest of the app doesn't depend on WebLLM.

export type ModelStatus =
  | "not_checked" // supported but not loaded yet (or support not yet determined)
  | "unsupported"
  | "loading"
  | "ready"
  | "failed";

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  /** Tag for debug logging (e.g. "speaker", "grade", "question"). */
  label?: string;
}

export type ProgressCallback = (text: string, progress: number) => void;

export interface LLMClient {
  isSupported(): boolean;
  status(): ModelStatus;
  init(onProgress?: ProgressCallback): Promise<void>;
  generate(prompt: string, opts?: GenerateOptions): Promise<string>;
}

/** The local model to load. Change here if you want a different size/quant. */
export const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";
