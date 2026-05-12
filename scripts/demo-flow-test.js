/**
 * End-to-end demo flow test against the live dev server.
 *
 * Walks through every step a judge would tap during the 3-minute demo:
 *   1. Pact: benchmark + group buys
 *   2. Diagnosis: start → pattern → photo (real Gemini call) → history → test → finalise
 *   3. Receipts: scan a small test image
 *
 * Run with: node scripts/demo-flow-test.js
 */

const BASE = "http://localhost:3001";

// 1×1 white PNG. For the diagnosis demo we expect "photoQuality: unusable"
// + low probabilities — that's the CORRECT honest-uncertainty behaviour.
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const COLOURS = {
  ok: "\x1b[32m✓\x1b[0m",
  bad: "\x1b[31m✗\x1b[0m",
  info: "\x1b[36m·\x1b[0m",
};

async function req(path, body = null) {
  const opts = body
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    : { method: "GET" };
  const start = Date.now();
  const r = await fetch(`${BASE}${path}`, opts);
  const ms = Date.now() - start;
  const data = await r.json().catch(() => null);
  return { status: r.status, ms, data };
}

async function step(label, fn) {
  process.stdout.write(`  ${label} ... `);
  try {
    const result = await fn();
    console.log(`${COLOURS.ok} (${result.ms}ms)`);
    return result;
  } catch (err) {
    console.log(`${COLOURS.bad} ${err.message}`);
    throw err;
  }
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("\n══ AgroSim 2.0 — Demo Flow End-to-End Test ══\n");

  // ── 1. Pact: benchmark
  console.log("Pact layer:");
  const benchmark = await step("Benchmark for chilli in Cameron Highlands", async () => {
    const r = await req(
      "/api/pact/benchmark?district=Cameron%20Highlands&crop=chilli&farmer_id=a7cd8b7d-d657-4d97-b36b-b2b31bd76c4f"
    );
    check(r.status === 200, `status ${r.status}`);
    check(r.data.comparison === "below_median", `expected below_median, got ${r.data.comparison}`);
    check(r.data.message.includes("RM 4.20"), "expected message to mention RM 4.20");
    check(r.data.message.includes("RM 3.90"), "expected message to mention farmer's RM 3.90");
    return r;
  });
  console.log(`    ${COLOURS.info} ${benchmark.data.message}`);

  await step("Group buys list (Cameron Highlands)", async () => {
    const r = await req("/api/pact/group-buy?district=Cameron%20Highlands");
    check(r.status === 200, `status ${r.status}`);
    check(r.data.groupBuys.length >= 2, `expected ≥2 group buys, got ${r.data.groupBuys.length}`);
    const mancozeb = r.data.groupBuys.find((g) => g.itemName.includes("Mancozeb"));
    const npk = r.data.groupBuys.find((g) => g.itemName.includes("NPK"));
    check(mancozeb, "expected Mancozeb group buy");
    check(npk, "expected NPK group buy");
    check(mancozeb.savingsRm === 10, `Mancozeb savings should be 10, got ${mancozeb.savingsRm}`);
    check(npk.savingsRm === 17, `NPK savings should be 17, got ${npk.savingsRm}`);
    return r;
  });

  // ── 2. Doctor diagnosis flow
  console.log("\nDoctor diagnosis flow:");
  let session;

  await step("Start session (chilli, Cameron Highlands)", async () => {
    const r = await req("/api/diagnosis/v2", {
      step: "start",
      crop: "chilli",
      plotLabel: "Plot A",
      recentWeather: { rainyDaysLast7: 5, avgHumidityLast7: 85 },
    });
    check(r.status === 200, `status ${r.status}`);
    check(r.data.session.candidates.length === 5, `expected 5 candidates, got ${r.data.session.candidates.length}`);
    session = r.data.session;
    return r;
  });

  await step("Pattern: 'few_plants'", async () => {
    const r = await req("/api/diagnosis/v2", {
      step: "pattern",
      session,
      pattern: "few_plants",
    });
    check(r.status === 200, `status ${r.status}`);
    check(r.data.session.pattern === "few_plants", "pattern not stored");
    const inPlay = r.data.session.candidates.filter((c) => !c.ruledOut);
    check(inPlay.length === 5, "few_plants should keep all candidates in play");
    session = r.data.session;
    return r;
  });

  const photoResult = await step("Photo analysis (REAL Gemini Vision call, ~5-8s)", async () => {
    const r = await req("/api/diagnosis/v2", {
      step: "photo",
      session,
      photoBase64: TINY_PNG,
      photoMimeType: "image/png",
    });
    check(r.status === 200, `status ${r.status}`);
    check(Array.isArray(r.data.observations), "expected observations array");
    session = r.data.session;
    return r;
  });
  console.log(`    ${COLOURS.info} photoQuality: ${photoResult.data.photoQuality}`);
  console.log(`    ${COLOURS.info} observations: ${photoResult.data.observations.length} items`);

  if (photoResult.data.nextHistoryQuestions?.length > 0) {
    const q = photoResult.data.nextHistoryQuestions[0];
    await step(`History Q: '${q.text.slice(0, 40)}…'`, async () => {
      const r = await req("/api/diagnosis/v2", {
        step: "history",
        session,
        questionId: q.id,
        question: q.text,
        answer: q.options[0].value,
      });
      check(r.status === 200, `status ${r.status}`);
      session = r.data.session;
      return r;
    });
  }

  const final = await step("Finalise diagnosis", async () => {
    const r = await req("/api/diagnosis/v2", {
      step: "finalise",
      session,
    });
    check(r.status === 200, `status ${r.status}`);
    check(r.data.result.outcome, "expected an outcome");
    return r;
  });
  console.log(`    ${COLOURS.info} outcome: ${final.data.result.outcome}, confidence: ${(final.data.result.confidence * 100).toFixed(0)}%`);
  if (final.data.result.escalation?.suggested) {
    console.log(`    ${COLOURS.info} escalation suggested: ${final.data.result.escalation.options.join(", ")}`);
  }

  // ── 3. Receipt scan
  console.log("\nReceipt scan:");
  const scan = await step("Scan receipt (REAL Gemini Vision, ~3-6s)", async () => {
    const r = await req("/api/receipts/scan", {
      photoBase64: TINY_PNG,
      photoMimeType: "image/png",
    });
    check(r.status === 200, `status ${r.status}`);
    check(r.data.receipt, "expected parsed receipt");
    return r;
  });
  console.log(
    `    ${COLOURS.info} imageQuality: ${scan.data.receipt.imageQuality}, items: ${scan.data.receipt.items.length}, warnings: ${scan.data.warnings.length}`
  );

  console.log("\n══ All demo flow steps completed ══\n");
}

main().catch((err) => {
  console.error("\n\x1b[31mFAILED:\x1b[0m", err.message);
  process.exit(1);
});
