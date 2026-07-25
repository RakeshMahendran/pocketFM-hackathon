import { promises as fs } from "fs";
import path from "path";

import { SCORE_LABELS, type ClearanceStatus } from "./types";

/**
 * Reads the recorded discovery run off disk.
 *
 * `data/cache/hunt_*.json` is the raw OpenAI Responses object saved by the one
 * real scout run. Hard rule 5 keeps live network calls off the demo path, so
 * the /scout screen plays that recording back rather than hunting again.
 *
 * Every number this module returns is read out of the file. Where the recording
 * is silent it returns null and lets the UI say so — the response records when
 * the run started and finished but not when each search fired, so there is no
 * per-step timing here to hand a progress bar.
 *
 * Server-side only.
 */

// Same resolution as lib/data.ts: env var first, repo-root `data/` second.
// Duplicated rather than exported from there because that module belongs to the
// sourcing track. `..` escapes the web root and would make the bundler trace the
// whole repo, so the deliberate server-only read is opted out of the trace.
const DATA_DIR =
  process.env.CANONFORGE_DATA ??
  path.join(/* turbopackIgnore: true */ process.cwd(), "..", "data");

const SCORE_KEYS = Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[];

/** One `web_search_call` whose action was a search. */
export interface ReplaySearch {
  /** 1-based position among searches, for display. */
  ordinal: number;
  /** `action.query` — the search string the model settled on. */
  query: string;
  /** The rest of `action.queries`: issued in the same call, same breath. */
  alsoIssued: string[];
  /** Every page this call opened, in the order the response lists them. */
  urls: string[];
  /** Of those, how many no earlier call had already opened. */
  newUrls: number;
}

/**
 * The response output replayed in its recorded order. Reasoning items carry no
 * summary in this recording, so they are a beat in the sequence and nothing more.
 */
export type ReplayStep =
  | { kind: "reasoning" }
  | ({ kind: "search" } & ReplaySearch)
  | { kind: "open"; url: string }
  | { kind: "result" };

/**
 * A candidate the scout refused because it had already been dramatised, paired
 * with the search that told it so. This is the hunt's judgement made legible:
 * the model went looking for the reason to reject its own best find.
 */
export interface NoveltyCheck {
  title: string;
  /** Recomputed from the five sub-scores, as everywhere else. */
  total: number | null;
  /** The search string that turned up the prior adaptation. */
  query: string;
  /** Which search step it was, so playback can attach the moment to it. */
  ordinal: number;
  priorAdaptations: string[];
  reasons: string[];
}

export interface ReplayUsage {
  input: number;
  output: number;
  reasoning: number;
  total: number;
}

export interface Replay {
  ok: true;
  /** The cache file this came from. Named on screen so the claim is checkable. */
  file: string;
  /** When the run was recorded, formatted UTC. */
  savedAt: string | null;
  model: string | null;
  /** Wall clock of the real run. The playback is not this long. */
  durationSeconds: number | null;
  steps: ReplayStep[];
  searches: ReplaySearch[];
  distinctUrls: number;
  reasoningSteps: number;
  outputItems: number;
  usage: ReplayUsage | null;
  /** Winner plus also-considered, i.e. the rows this run put in the queue. */
  candidates: number | null;
  winner: string | null;
  /** Best score in the run, so "the highest" is a claim the screen can check. */
  topScore: number | null;
  clearance: Record<ClearanceStatus, number>;
  /** Highest-scoring first. The demo headlines the top one. */
  novelty: NoveltyCheck[];
}

export interface ReplayMissing {
  ok: false;
  /** Written straight onto the screen, so it reads as prose not as an error code. */
  reason: string;
}

export type ReplayResult = Replay | ReplayMissing;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Fractional seconds run to six digits in the saved timestamp; Date wants three. */
function formatSavedAt(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw.replace(/(\.\d{3})\d+/, "$1"));
  if (Number.isNaN(d.getTime())) return null;
  // Fixed to UTC: the server and the browser must render the same string or
  // hydration tears, and the recording happened in UTC anyway.
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(d)} UTC`;
}

async function newestHuntFile(cacheDir: string): Promise<string | null> {
  let names: string[];
  try {
    names = (await fs.readdir(cacheDir)).filter((n) => /^hunt_.+\.json$/.test(n));
  } catch {
    return null;
  }
  if (!names.length) return null;
  if (names.length === 1) return names[0];

  const dated = await Promise.all(
    names.map(async (n) => {
      try {
        return { n, at: (await fs.stat(path.join(cacheDir, n))).mtimeMs };
      } catch {
        return { n, at: 0 };
      }
    }),
  );
  dated.sort((a, b) => b.at - a.at);
  return dated[0].n;
}

/** The five sub-scores are the evidence; `total` is model-supplied and not read. */
function totalOf(raw: unknown): number | null {
  const r = asRecord(raw);
  if (!SCORE_KEYS.some((k) => k in r)) return null;
  return SCORE_KEYS.reduce((sum, k) => {
    const n = num(r[k]) ?? 0;
    return sum + Math.max(0, Math.min(10, Math.round(n)));
  }, 0);
}

/**
 * Words long enough to identify a candidate inside a search string. Short ones
 * ("the", "who", "man") match everything and would credit the wrong query.
 */
function titleTokens(title: string): string[] {
  return [
    ...new Set(
      title
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 5),
    ),
  ];
}

/**
 * A search that names a medium is the scout checking for prior adaptation
 * rather than hunting. Without this test, "claimant" alone would match an
 * earlier discovery query that had nothing to do with the 1998 film.
 */
const ADAPTATION_VOCABULARY =
  /\b(film|movie|series|drama|dramati[sz]ed|adaptation|adapted|documentary|tv|itv|bbc|netflix|based on)\b/i;

function findNoveltyChecks(
  candidates: Record<string, unknown>[],
  searches: ReplaySearch[],
): NoveltyCheck[] {
  const checks: NoveltyCheck[] = [];

  for (const c of candidates) {
    const clearance = asRecord(c.clearance);
    if (str(clearance.status) !== "blocked") continue;

    const prior = Array.isArray(c.prior_adaptations)
      ? c.prior_adaptations.map(String).filter(Boolean)
      : [];
    if (!prior.length) continue;

    const title = str(c.title);
    if (!title) continue;
    const tokens = titleTokens(title);

    for (const s of searches) {
      const strings = [s.query, ...s.alsoIssued].filter((q) =>
        ADAPTATION_VOCABULARY.test(q),
      );
      const hit = strings.find((q) => {
        const lower = q.toLowerCase();
        return tokens.some((t) => lower.includes(t));
      });
      if (!hit) continue;

      checks.push({
        title,
        total: totalOf(c.scores),
        query: hit,
        ordinal: s.ordinal,
        priorAdaptations: prior,
        reasons: Array.isArray(clearance.reasons)
          ? clearance.reasons.map(String).filter(Boolean)
          : [],
      });
      break;
    }
  }

  return checks.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
}

function emptyClearance(): Record<ClearanceStatus, number> {
  return { greenlight: 0, fictionalize_first: 0, blocked: 0 };
}

export async function loadReplay(): Promise<ReplayResult> {
  const cacheDir = path.join(DATA_DIR, "cache");

  const file = await newestHuntFile(cacheDir);
  if (!file) {
    return {
      ok: false,
      reason:
        "No recording on disk. The scout's response is cached to data/cache/hunt_*.json " +
        "by `python tasks.py corpus`, and nothing here has run it yet.",
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.join(cacheDir, file), "utf-8"));
  } catch {
    return {
      ok: false,
      reason: `data/cache/${file} could not be read as JSON. It is the raw model response and may have been truncated mid-write.`,
    };
  }

  const response = asRecord(asRecord(raw).response);
  const output = Array.isArray(response.output) ? response.output : [];
  if (!output.length) {
    return {
      ok: false,
      reason: `data/cache/${file} parsed, but carries no response output to replay.`,
    };
  }

  const steps: ReplayStep[] = [];
  const searches: ReplaySearch[] = [];
  const seen = new Set<string>();
  let reasoningSteps = 0;

  for (const item of output) {
    const o = asRecord(item);
    const type = str(o.type);

    if (type === "reasoning") {
      reasoningSteps += 1;
      steps.push({ kind: "reasoning" });
      continue;
    }

    if (type === "message") {
      steps.push({ kind: "result" });
      continue;
    }

    if (type !== "web_search_call") continue;

    const action = asRecord(o.action);
    const kind = str(action.type);

    if (kind === "open_page") {
      const url = str(action.url);
      if (url) {
        steps.push({ kind: "open", url });
        seen.add(url);
      }
      continue;
    }

    const query = str(action.query);
    if (!query) continue;

    const urls = (Array.isArray(action.sources) ? action.sources : [])
      .map((s) => str(asRecord(s).url))
      .filter((u): u is string => Boolean(u));

    let newUrls = 0;
    for (const u of urls) {
      if (!seen.has(u)) {
        seen.add(u);
        newUrls += 1;
      }
    }

    const alsoIssued = (Array.isArray(action.queries) ? action.queries : [])
      .map((q) => str(q))
      .filter((q): q is string => Boolean(q) && q !== query);

    const search: ReplaySearch = {
      ordinal: searches.length + 1,
      query,
      alsoIssued,
      urls,
      newUrls,
    };
    searches.push(search);
    steps.push({ kind: "search", ...search });
  }

  // The message item holds the structured result. It is the one part of the
  // response that can be well-formed JSON inside a well-formed file and still
  // fail to parse, so the counts it feeds are nullable rather than assumed.
  let candidates: number | null = null;
  let winner: string | null = null;
  let topScore: number | null = null;
  const clearance = emptyClearance();
  let novelty: NoveltyCheck[] = [];

  const message = output
    .map(asRecord)
    .find((o) => str(o.type) === "message");
  const text = str(
    asRecord((Array.isArray(message?.content) ? message.content : [])[0]).text,
  );

  if (text) {
    try {
      const result = asRecord(JSON.parse(text));
      const rows = [
        asRecord(result.winner),
        ...(Array.isArray(result.also_considered)
          ? result.also_considered.map(asRecord)
          : []),
      ].filter((r) => Object.keys(r).length > 0);

      if (rows.length) {
        candidates = rows.length;
        winner = str(asRecord(result.winner).title);
        for (const r of rows) {
          const status = str(asRecord(r.clearance).status);
          if (status && status in clearance) {
            clearance[status as ClearanceStatus] += 1;
          }
          const t = totalOf(r.scores);
          if (t !== null && (topScore === null || t > topScore)) topScore = t;
        }
        novelty = findNoveltyChecks(rows, searches);
      }
    } catch {
      // Leave the result counts null. The playback of the search itself is
      // still true, and the summary says the tally was unreadable.
    }
  }

  const started = num(response.created_at);
  const finished = num(response.completed_at);
  const usageRaw = asRecord(response.usage);
  const usageTotal = num(usageRaw.total_tokens);

  return {
    ok: true,
    file,
    savedAt: formatSavedAt(str(asRecord(raw).saved_at)),
    model: str(response.model),
    durationSeconds:
      started !== null && finished !== null && finished >= started
        ? Math.round(finished - started)
        : null,
    steps,
    searches,
    distinctUrls: seen.size,
    reasoningSteps,
    outputItems: output.length,
    usage: usageTotal
      ? {
          input: num(usageRaw.input_tokens) ?? 0,
          output: num(usageRaw.output_tokens) ?? 0,
          reasoning:
            num(asRecord(usageRaw.output_tokens_details).reasoning_tokens) ?? 0,
          total: usageTotal,
        }
      : null,
    candidates,
    winner,
    topScore,
    clearance,
    novelty,
  };
}
