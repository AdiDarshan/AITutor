"use client";

// Client-only query embedder. Uses the SAME model as the offline build script
// (scripts/embed-courses.ts) so query and chunk vectors share one space.
// Loaded lazily and never imported on the server.

const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorPromise: Promise<any> | null = null;

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return pipeline("feature-extraction", EMBED_MODEL);
    })();
  }
  return extractorPromise;
}

/** Embed a query into a normalized vector, or null if the model fails to load. */
export async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const extractor = await getExtractor();
    const out = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(out.data as Float32Array);
  } catch {
    return null;
  }
}
