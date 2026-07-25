import { promises as fs } from "fs";
import path from "path";

import type {
  Candidate,
  CastMember,
  Clearance,
  ClearanceStatus,
  Corpus,
  Origin,
  Scores,
} from "./types";

/**
 * Reads the research agent's output off disk.
 *
 * The real source is `data/corpus.json`, written by `python tasks.py corpus`.
 * It does not exist yet — the four stories in `data/stories/` were produced
 * before the pipeline was wired, so this falls back to assembling a queue from
 * them and says loudly that it did. An empty screen would be indistinguishable
 * from a broken one, and a screen quietly pretending assembled rows are real
 * pipeline output is worse than either.
 *
 * Server-side only: this reads the filesystem directly rather than going
 * through FastAPI, so the queue does not block on an API nobody has built.
 */

// `..` escapes the web root, which makes the bundler trace the whole repo as a
// dependency. The read is deliberate and server-only, so the trace is opted out
// of rather than the path being contorted to satisfy it.
export const DATA_DIR =
  process.env.CANONFORGE_DATA ??
  path.join(/* turbopackIgnore: true */ process.cwd(), "..", "data");

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function readJson(...parts: string[]): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, ...parts), "utf-8"));
  } catch {
    return null;
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : String(x ?? ""))).filter(Boolean);
}

/** Clamp to the 0-10 the rubric defines. Out-of-range means the model drifted. */
function score(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 0;
}

function normaliseScores(raw: unknown): Scores | null {
  const r = asRecord(raw);
  const keys = [
    "engine_longevity",
    "hook_density",
    "emotional_immediacy",
    "conflict",
    "cast_depth",
  ] as const;
  if (!keys.some((k) => k in r)) return null;

  const parts = Object.fromEntries(keys.map((k) => [k, score(r[k])])) as Omit<
    Scores,
    "total"
  >;
  // Recomputed, never trusted. `total` is model-supplied and nothing upstream
  // verifies it equals the sum, yet the 38-point threshold gates on it.
  const total = keys.reduce((sum, k) => sum + parts[k], 0);
  return { ...parts, total };
}

function normaliseClearance(raw: unknown): Clearance | null {
  const r = asRecord(raw);
  const status = str(r.status);
  const valid: ClearanceStatus[] = ["greenlight", "fictionalize_first", "blocked"];
  if (!status || !valid.includes(status as ClearanceStatus)) return null;
  return { status: status as ClearanceStatus, reasons: strList(r.reasons) };
}

function normaliseCast(raw: unknown): CastMember[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const r = asRecord(entry);
    const potential = str(r.spinoff_potential);
    return {
      name_or_role: str(r.name_or_role) ?? str(r.name) ?? str(r.char_id) ?? "unnamed",
      motive: str(r.motive) ?? str(r.want) ?? "",
      spinoff_potential:
        potential === "high" || potential === "med" || potential === "low"
          ? potential
          : null,
    };
  });
}

/**
 * The rejection rationale has three names in committed data — `why_not`,
 * `why_rejected`, `rejected_because` — because three separate runs each
 * invented one. The schema now names it `why_not`; this accepts all three so
 * the older stories still render.
 */
function rejectionReason(r: Record<string, unknown>): string | null {
  return (
    str(r.why_not) ??
    str(r.why_rejected) ??
    str(r.rejected_because) ??
    str(r.why_rejected_reason)
  );
}

const REQUIRED_FOR_A_FULL_ROW = [
  "category",
  "one_line",
  "year",
  "where",
  "mechanism",
  "engine",
  "episode_estimate",
  "cast",
  "scores",
  "clearance",
  "sources",
  "why_this_sells",
] as const;

function toCandidate(raw: unknown, origin: Origin, fallbackId?: string): Candidate {
  const r = asRecord(raw);
  const title = str(r.title) ?? str(r.one_line_summary) ?? "Untitled candidate";
  const sources = strList(r.sources).length
    ? strList(r.sources)
    : str(r.source)
      ? [str(r.source)!]
      : [];

  const missing = REQUIRED_FOR_A_FULL_ROW.filter((k) => {
    const v = r[k];
    if (k === "scores") return !normaliseScores(r.scores ?? r.hunt_scores);
    if (k === "clearance") return !normaliseClearance(r.clearance);
    if (k === "sources") return sources.length === 0;
    if (k === "cast") return !Array.isArray(v) || v.length === 0;
    return v === undefined || v === null || v === "";
  });

  const episodes = Number(r.episode_estimate);

  return {
    id: str(r.id) ?? str(r.event_id) ?? fallbackId ?? slug(title),
    title,
    category: str(r.category) ?? str(r.hunt_category),
    one_line: str(r.one_line) ?? str(r.one_line_summary) ?? "",
    year: str(r.year),
    where: str(r.where),
    mechanism: str(r.mechanism),
    engine: str(r.engine),
    episode_estimate: Number.isFinite(episodes) && episodes > 0 ? episodes : null,
    cast: normaliseCast(r.cast),
    scores: normaliseScores(r.scores ?? r.hunt_scores),
    clearance: normaliseClearance(r.clearance),
    prior_adaptations: strList(r.prior_adaptations),
    sources,
    domain: str(r.domain) ?? domainOf(sources[0]),
    winner: r.winner === true || origin === "commissioned",
    why_this_sells: str(r.why_this_sells) ?? str(r.sells) ?? str(r.why_this_works),
    why_not: rejectionReason(r),
    origin,
    missing: [...missing],
  };
}

function domainOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Real pipeline output. Preferred whenever it exists. */
async function fromCorpus(): Promise<Corpus | null> {
  const raw = await readJson("corpus.json");
  if (!raw) return null;
  const r = asRecord(raw);
  const items = Array.isArray(r.items) ? r.items : [];
  if (!items.length) return null;

  return {
    candidates: items.map((i) => toCandidate(i, "corpus")),
    assembled: false,
    builtAt: str(r.built_at),
    warnings: [],
  };
}

/**
 * Fallback: build a queue from the stories already committed. Each story
 * contributes its own commissioned event plus whatever it recorded as
 * `also_considered`.
 */
async function fromStories(): Promise<Corpus> {
  const warnings: string[] = [];
  const candidates: Candidate[] = [];

  let dirs: string[] = [];
  try {
    dirs = (await fs.readdir(path.join(DATA_DIR, "stories"), { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return {
      candidates: [],
      assembled: true,
      builtAt: null,
      warnings: [
        "No data/corpus.json and no data/stories/ — run `python tasks.py corpus` to build the queue.",
      ],
    };
  }

  for (const dir of dirs) {
    const dossier = asRecord(await readJson("stories", dir, "dossier.json"));
    if (!Object.keys(dossier).length) {
      warnings.push(`${dir}: dossier.json missing or unreadable — skipped.`);
      continue;
    }

    candidates.push(toCandidate(dossier, "commissioned", dir));

    const also = Array.isArray(dossier.also_considered) ? dossier.also_considered : [];
    also.forEach((entry, i) =>
      candidates.push(toCandidate(entry, "also-considered", `${dir}-alt-${i + 1}`)),
    );
    if (!also.length) {
      warnings.push(`${dir}: recorded no rejected candidates, so it contributes one row.`);
    }
  }

  warnings.unshift(
    "Assembled from committed stories — data/corpus.json does not exist yet. " +
      "Run `python tasks.py corpus` for real scout output.",
  );

  return { candidates, assembled: true, builtAt: null, warnings };
}

function rank(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    // Blocked sinks to the bottom: it cannot be commissioned, so it should not
    // occupy the top of a triage list however well it scored.
    const blocked = (c: Candidate) => (c.clearance?.status === "blocked" ? 1 : 0);
    if (blocked(a) !== blocked(b)) return blocked(a) - blocked(b);
    return (b.scores?.total ?? -1) - (a.scores?.total ?? -1);
  });
}

export async function loadCorpus(): Promise<Corpus> {
  const real = await fromCorpus();
  const corpus = real ?? (await fromStories());
  const ranked = rank(corpus.candidates);

  const warnings = [...corpus.warnings];
  const unsourced = ranked.filter((c) => c.sources.length === 0).length;
  if (unsourced) {
    warnings.push(
      `${unsourced} candidate${unsourced === 1 ? "" : "s"} cite no source. ` +
        "The scout drops ungrounded candidates, so these predate that check.",
    );
  }
  const statuses = new Set(ranked.map((c) => c.clearance?.status).filter(Boolean));
  if (ranked.length > 1 && statuses.size === 1) {
    warnings.push(
      `Every candidate is \`${[...statuses][0]}\` — the clearance column cannot ` +
        "be seen doing any work until the corpus holds a mix.",
    );
  }

  return { ...corpus, candidates: ranked, warnings };
}

export async function loadCandidate(id: string): Promise<Candidate | null> {
  const { candidates } = await loadCorpus();
  return candidates.find((c) => c.id === id) ?? null;
}
