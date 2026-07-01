// Build-time embeddings: embed every course chunk offline and write vectors to
// public/embeddings/<programId>.json. Run with: npm run embed-courses
// The SAME model must embed the query at runtime (see app/retrieval/embedModel).

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "@huggingface/transformers";
import { mapCoursePack } from "../app/content/mapCoursePack";
import { buildCorpus } from "../app/retrieval/retrieval";

export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

async function main() {
  const extractor = await pipeline("feature-extraction", EMBED_MODEL);

  const contentDir = path.join(process.cwd(), "content");
  const outDir = path.join(process.cwd(), "public", "embeddings");
  fs.mkdirSync(outDir, { recursive: true });

  for (const dir of fs.readdirSync(contentDir)) {
    const file = path.join(contentDir, dir, "course.json");
    if (!fs.existsSync(file)) continue;

    const course = mapCoursePack(JSON.parse(fs.readFileSync(file, "utf8")));
    const corpus = buildCorpus(course);
    const vectors: Record<string, number[]> = {};

    for (const c of corpus) {
      const out = await extractor(c.text, { pooling: "mean", normalize: true });
      vectors[c.id] = Array.from(out.data as Float32Array).map((n) => Number(n.toFixed(6)));
    }

    const dim = corpus.length ? vectors[corpus[0].id].length : 0;
    const outFile = path.join(outDir, `${course.programId}.json`);
    fs.writeFileSync(outFile, JSON.stringify({ model: EMBED_MODEL, dim, vectors }));
    console.log(`embedded ${course.programId}: ${corpus.length} chunks (dim ${dim}) -> ${outFile}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
