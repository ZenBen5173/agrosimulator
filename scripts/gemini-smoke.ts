/**
 * Gemini API smoke test.
 *
 * Run with:  npx tsx scripts/gemini-smoke.ts
 *
 * Reports whether:
 *   1. Vertex AI authentication actually works
 *   2. A plain text generate() call returns a sensible answer
 *   3. A vision call with a tiny test image returns structured output
 *
 * No assertions — this is a one-shot diagnostic, not a unit test. It either
 * prints SUCCESS lines or surfaces the real error message from the API.
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load env BEFORE any module that touches genkit
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  console.log("─── AgroSim 2.0 — Gemini smoke test ─────────────");
  console.log("Project ID set:        ", !!process.env.GOOGLE_CLOUD_PROJECT_ID);
  console.log("Gemini API key set:    ", !!process.env.GEMINI_API_KEY);
  console.log("Google App creds set:  ", !!process.env.GOOGLE_APPLICATION_CREDENTIALS);
  console.log("──────────────────────────────────────────────");

  if (!process.env.GOOGLE_CLOUD_PROJECT_ID) {
    console.error(
      "[FAIL] GOOGLE_CLOUD_PROJECT_ID not set. Vertex AI requires this."
    );
    process.exit(1);
  }

  // Lazy-import so env is loaded first
  const { ai, DEFAULT_MODEL } = await import("../src/lib/genkit");
  const { z } = await import("genkit");

  // ─── Test 1: text-only generation ──────────────────────
  console.log("\n[Test 1] Plain text generation");
  const t1Start = Date.now();
  try {
    const { text } = await ai.generate({
      model: DEFAULT_MODEL,
      prompt:
        "In ONE short sentence, what is the most common chilli disease in Malaysian smallholder farms?",
      config: { temperature: 0.2 },
    });
    const t1Time = Date.now() - t1Start;
    console.log(`[OK] (${t1Time}ms) Response:`);
    console.log("  >", text?.trim() ?? "(empty)");
  } catch (err) {
    console.error("[FAIL] Text generation error:");
    console.error("  ", err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) {
      console.error(err.stack.split("\n").slice(1, 4).join("\n"));
    }
    process.exit(1);
  }

  // ─── Test 2: structured JSON output ────────────────────
  console.log("\n[Test 2] Structured JSON output (zod schema)");
  const TestSchema = z.object({
    crop: z.string(),
    common_diseases: z.array(z.string()).max(3),
    confidence: z.number().min(0).max(1),
  });
  const t2Start = Date.now();
  try {
    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      prompt:
        "List the 3 most common diseases for chilli (capsicum) grown in Malaysia. Return JSON only.",
      output: { schema: TestSchema },
      config: { temperature: 0.1 },
    });
    const t2Time = Date.now() - t2Start;
    console.log(`[OK] (${t2Time}ms) Structured output:`);
    console.log("  ", JSON.stringify(output, null, 2));
  } catch (err) {
    console.error("[FAIL] Structured output error:");
    console.error("  ", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // ─── Test 3: vision with a tiny synthetic image ────────
  console.log("\n[Test 3] Vision call with a 1x1 PNG (connectivity smoke)");
  // 1×1 white PNG, ~70 bytes — just enough to exercise the multimodal pipeline
  const tinyPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const t3Start = Date.now();
  try {
    const { text } = await ai.generate({
      model: DEFAULT_MODEL,
      prompt: [
        { text: "Describe in one sentence what you see in this image (it may be tiny or blank)." },
        {
          media: {
            contentType: "image/png",
            url: `data:image/png;base64,${tinyPng}`,
          },
        },
      ],
      config: { temperature: 0.2 },
    });
    const t3Time = Date.now() - t3Start;
    console.log(`[OK] (${t3Time}ms) Vision response:`);
    console.log("  >", text?.trim() ?? "(empty)");
  } catch (err) {
    console.error("[FAIL] Vision error:");
    console.error("  ", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // ─── Test 4: actually invoke the visionDifferentialFlow ──
  console.log("\n[Test 4] Real flow: visionDifferentialFlow (chilli, anthracnose candidates)");
  const t4Start = Date.now();
  try {
    const { visionDifferentialFlow } = await import("../src/flows/doctorDiagnosis");
    const out = await visionDifferentialFlow({
      photoBase64: tinyPng,
      photoMimeType: "image/png",
      crop: "chilli",
      candidateIds: [
        "chilli_anthracnose",
        "chilli_cercospora",
        "chilli_bacterial_wilt",
        "chilli_phosphorus_deficiency",
        "chilli_iron_deficiency",
      ],
      pattern: "few_plants",
    });
    const t4Time = Date.now() - t4Start;
    console.log(`[OK] (${t4Time}ms) Flow returned valid structured output:`);
    console.log("  observations:", out.observations);
    console.log("  photoQuality:", out.photoQuality);
    console.log("  candidates:");
    for (const c of out.candidates) {
      console.log(
        `    - ${c.diseaseId}: prob=${c.probability.toFixed(2)} ruledOut=${
          c.ruledOut
        }${c.ruleOutReason ? ` (${c.ruleOutReason})` : ""}`
      );
    }
  } catch (err) {
    console.error("[FAIL] Flow error:");
    console.error("  ", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log("\n──────────────────────────────────────────────");
  console.log("All Gemini smoke tests passed.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
