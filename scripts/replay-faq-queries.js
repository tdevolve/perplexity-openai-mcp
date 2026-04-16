import fs from "fs";
import readline from "readline";
import { performance } from "node:perf_hooks";

const INPUT_PATH = process.env.REPLAY_INPUT || "logs/faq-misses.jsonl";
const OUTPUT_PATH = process.env.REPLAY_OUTPUT || "logs/query-replay-results.jsonl";
const SUMMARY_PATH = process.env.REPLAY_SUMMARY || "logs/query-replay-summary.json";

const BASELINE_URL = process.env.BASELINE_URL || "http://localhost:3000/api/faq/match";
const CANDIDATE_URL = process.env.CANDIDATE_URL || "http://localhost:3001/api/faq/match";

const LIMIT = Number(process.env.LIMIT || 500);
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function pickQuery(row) {
  return (
    row?.question ||
    row?.query ||
    row?.message ||
    row?.text ||
    ""
  ).trim();
}

async function callEndpoint(url, payload) {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const latency_ms = Number((performance.now() - started).toFixed(2));
    let body = null;
    let raw = null;

    try {
      body = await res.json();
    } catch {
      try {
        raw = await res.text();
      } catch {
        raw = null;
      }
    }

    return {
      ok: res.ok,
      status: res.status,
      latency_ms,
      body,
      raw,
      error: null
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latency_ms: Number((performance.now() - started).toFixed(2)),
      body: null,
      raw: null,
      error: err?.message || "request_failed"
    };
  }
}

function extractMatch(result) {
  const body = result?.body || {};

  return {
    faq_id:
      body?.faq_id ??
      body?.match?.faq_id ??
      body?.match?.id ??
      body?.id ??
      null,
    question:
      body?.question ??
      body?.match?.question ??
      null,
    normalized_query:
      body?.normalized_query ??
      body?.match?.normalized_query ??
      null,
    confidence:
      body?.confidence ??
      body?.score ??
      body?.match?.confidence ??
      body?.match?.score ??
      null,
    hit:
      body?.hit ??
      body?.matched ??
      Boolean(
        body?.faq_id ??
        body?.match?.faq_id ??
        body?.match?.id ??
        body?.id
      )
  };
}

function buildPayload(row, query) {
  return {
    query,
    question: query,
    role: row?.role || row?.user_role || null,
    metadata: row?.metadata || {},
    source: "offline_replay"
  };
}

function makeComparison(row, baselineRes, candidateRes) {
  const baseline = extractMatch(baselineRes);
  const candidate = extractMatch(candidateRes);

  return {
    replayed_at: new Date().toISOString(),
    source_id: row?.id || row?.request_id || null,
    original_timestamp: row?.timestamp || row?.created_at || null,
    query: pickQuery(row),

    baseline: {
      url: BASELINE_URL,
      ok: baselineRes.ok,
      status: baselineRes.status,
      latency_ms: baselineRes.latency_ms,
      error: baselineRes.error,
      ...baseline
    },

    candidate: {
      url: CANDIDATE_URL,
      ok: candidateRes.ok,
      status: candidateRes.status,
      latency_ms: candidateRes.latency_ms,
      error: candidateRes.error,
      ...candidate
    },

    delta: {
      same_faq_id: baseline.faq_id === candidate.faq_id,
      baseline_hit: Boolean(baseline.hit),
      candidate_hit: Boolean(candidate.hit),
      hit_change:
        Boolean(candidate.hit) === Boolean(baseline.hit)
          ? "same"
          : candidate.hit
            ? "candidate_gained_hit"
            : "candidate_lost_hit",
      latency_ms_diff: Number(
        ((candidateRes.latency_ms || 0) - (baselineRes.latency_ms || 0)).toFixed(2)
      ),
      confidence_diff:
        baseline.confidence != null && candidate.confidence != null
          ? Number((candidate.confidence - baseline.confidence).toFixed(4))
          : null
    }
  };
}

async function processRow(row, outputStream) {
  const query = pickQuery(row);
  if (!query) return null;

  const payload = buildPayload(row, query);

  const [baselineRes, candidateRes] = await Promise.all([
    callEndpoint(BASELINE_URL, payload),
    callEndpoint(CANDIDATE_URL, payload)
  ]);

  const comparison = makeComparison(row, baselineRes, candidateRes);
  outputStream.write(JSON.stringify(comparison) + "\n");
  return comparison;
}

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Input file not found: ${INPUT_PATH}`);
  }

  fs.mkdirSync("logs", { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, "");

  const outputStream = fs.createWriteStream(OUTPUT_PATH, { flags: "a" });

  const input = fs.createReadStream(INPUT_PATH);
  const rl = readline.createInterface({
    input,
    crlfDelay: Infinity
  });

  const active = new Set();
  const summary = {
    input_path: INPUT_PATH,
    output_path: OUTPUT_PATH,
    baseline_url: BASELINE_URL,
    candidate_url: CANDIDATE_URL,
    processed: 0,
    skipped: 0,
    same_faq_id: 0,
    candidate_gained_hit: 0,
    candidate_lost_hit: 0,
    same_hit_state: 0,
    baseline_hits: 0,
    candidate_hits: 0,
    baseline_errors: 0,
    candidate_errors: 0,
    avg_baseline_latency_ms: 0,
    avg_candidate_latency_ms: 0
  };

  let baselineLatencyTotal = 0;
  let candidateLatencyTotal = 0;
  let seen = 0;

  for await (const line of rl) {
    if (seen >= LIMIT) break;
    const row = safeJsonParse(line);

    if (!row) {
      summary.skipped += 1;
      continue;
    }

    seen += 1;

    const p = processRow(row, outputStream)
      .then(result => {
        if (!result) {
          summary.skipped += 1;
          return;
        }

        summary.processed += 1;

        if (result.delta.same_faq_id) summary.same_faq_id += 1;
        if (result.delta.hit_change === "candidate_gained_hit") summary.candidate_gained_hit += 1;
        if (result.delta.hit_change === "candidate_lost_hit") summary.candidate_lost_hit += 1;
        if (result.delta.hit_change === "same") summary.same_hit_state += 1;

        if (result.baseline.hit) summary.baseline_hits += 1;
        if (result.candidate.hit) summary.candidate_hits += 1;

        if (result.baseline.error) summary.baseline_errors += 1;
        if (result.candidate.error) summary.candidate_errors += 1;

        baselineLatencyTotal += result.baseline.latency_ms || 0;
        candidateLatencyTotal += result.candidate.latency_ms || 0;
      })
      .finally(() => {
        active.delete(p);
      });

    active.add(p);

    if (active.size >= CONCURRENCY) {
      await Promise.race(active);
    }
  }

  await Promise.all(active);
  outputStream.end();

  if (summary.processed > 0) {
    summary.avg_baseline_latency_ms = Number((baselineLatencyTotal / summary.processed).toFixed(2));
    summary.avg_candidate_latency_ms = Number((candidateLatencyTotal / summary.processed).toFixed(2));
    summary.baseline_hit_rate = Number((summary.baseline_hits / summary.processed).toFixed(4));
    summary.candidate_hit_rate = Number((summary.candidate_hits / summary.processed).toFixed(4));
    summary.same_faq_id_rate = Number((summary.same_faq_id / summary.processed).toFixed(4));
  } else {
    summary.baseline_hit_rate = 0;
    summary.candidate_hit_rate = 0;
    summary.same_faq_id_rate = 0;
  }

  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2) + "\n");
  console.log(`Wrote ${summary.processed} replay rows to ${OUTPUT_PATH}`);
  console.log(`Wrote summary to ${SUMMARY_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
