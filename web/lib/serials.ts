import { promises as fs } from "fs";
import path from "path";

import { DATA_DIR } from "./data";
import { SCORE_LABELS, type Clearance, type ClearanceStatus, type Scores } from "./types";

/**
 * Reads commissioned seasons off disk — `data/stories/<name>/`.
 *
 * The four seasons committed there were written by hand, one at a time, before
 * the serial writer existed, so they agree on almost nothing: the pitch field
 * has three names, the score block has two, and the promise ledger has a
 * different vocabulary in each of the four files. Every disagreement found in
 * the committed data is absorbed below and named in a comment, because the next
 * person to hit one should be able to tell "the model drifted" from "someone
 * renamed the field on purpose".
 *
 * Where a field is genuinely absent it is recorded in `missing` and the UI says
 * so. Inventing a plausible value would make an editor commission on it.
 *
 * Server-side only, same as `data.ts`: the filesystem is the API.
 */

export type HookType =
  | "ACCUSATION"
  | "DISCOVERY"
  | "ARRIVAL"
  | "RECOGNITION"
  | "THREAT"
  | "REVEAL"
  | "ULTIMATUM"
  | "REVERSAL"
  | "BETRAYAL"
  | "DEADLINE";

/** The ten the season planner is allowed to end an episode on. */
export const HOOK_TYPES: HookType[] = [
  "ACCUSATION",
  "DISCOVERY",
  "ARRIVAL",
  "RECOGNITION",
  "THREAT",
  "REVEAL",
  "ULTIMATUM",
  "REVERSAL",
  "BETRAYAL",
  "DEADLINE",
];

/** Fourteen columns of full words does not fit. Full name goes in the title. */
export const HOOK_ABBR: Record<HookType, string> = {
  ACCUSATION: "ACC",
  DISCOVERY: "DSC",
  ARRIVAL: "ARV",
  RECOGNITION: "RCG",
  THREAT: "THR",
  REVEAL: "RVL",
  ULTIMATUM: "ULT",
  REVERSAL: "RVS",
  BETRAYAL: "BTR",
  DEADLINE: "DDL",
};

export interface SpineEntry {
  ep: number;
  /** What turns in this episode. The planner's one-sentence brief to the writer. */
  turn: string | null;
  hookType: HookType | null;
  /** Raw value when it is not one of the ten — shown rather than swallowed. */
  hookRaw: string | null;
  endsOn: string | null;
  paysOff: string | null;
  /** Protagonist's standing, 1–9. The arc the strip draws. */
  status: number | null;
  /** True when this hook type has already been used earlier in the season. */
  hookRepeats: boolean;
}

export interface CastEntry {
  id: string;
  name: string;
  role: string | null;
  want: string | null;
  /** Which real person, if any, the character derives from. */
  mapsTo: string | null;
  composite: boolean;
}

export type Confidence = "verified" | "reported" | "alleged" | "disputed";

export interface TimelineEntry {
  id: string;
  date: string | null;
  what: string;
  confidence: Confidence | null;
  source: string | null;
}

export interface PromiseEntry {
  id: string;
  raisedEp: number | null;
  /** The debt itself, however the file phrased it. */
  promise: string | null;
  waitingFor: string | null;
  mustPayBy: number | null;
  paidEp: number | null;
  howPaid: string | null;
  state: "open" | "paid" | "unknown";
  /** Paid, but later than the ledger's own deadline. An editorial smell. */
  late: boolean;
}

export interface DeliberateDebt {
  raisedEp: number | null;
  line: string;
  settledEp: number | null;
  how: string | null;
}

export interface SeasonCalendar {
  seasonStart: string | null;
  dates: { ep: number | null; when: string | null; what: string | null }[];
  periods: { between: number[]; elapsed: string | null }[];
  /** Dates the source material contradicts itself on. Left unstated in the scripts. */
  unresolved: string[];
}

export interface PromiseLedger {
  promises: PromiseEntry[];
  /** Counted from the rows. Never the file's own number — see below. */
  openCount: number;
  paidCount: number;
  /** What the file claims. Kept so a disagreement can be shown, not hidden. */
  declaredOpenCount: number | null;
  state: string | null;
  rule: string | null;
  audit: string | null;
  deliberatelyOpen: DeliberateDebt[];
  /** No promises.json at all — different from a ledger with nothing open. */
  absent: boolean;
}

export interface EpisodeRef {
  ep: number;
  /** From the `# Episode N — "Title"` line. */
  title: string | null;
  words: number;
  file: string;
}

export interface Episode extends EpisodeRef {
  body: string;
}

export interface SerialSummary {
  id: string;
  title: string;
  /** The one-line emotional promise. Present in all four; the shortest true thing. */
  fantasy: string | null;
  oneLine: string | null;
  category: string | null;
  clearance: Clearance | null;
  scores: Scores | null;
  episodeCount: number;
  castCount: number;
  beatCount: number;
  spineLength: number;
  openPromises: number;
  totalPromises: number;
  promisesAbsent: boolean;
  neverNarrateCount: number;
  missing: string[];
}

export interface Serial extends SerialSummary {
  eventId: string | null;
  engine: string | null;
  /** `sells` / `selling` / `why_this_sells` — three files, three names. */
  sells: string | null;
  whyThisWorks: string | null;
  protagonist: Record<string, string> | null;
  antagonist: Record<string, string> | null;
  spine: SpineEntry[];
  cast: CastEntry[];
  timeline: TimelineEntry[];
  neverNarrate: string[];
  fictionalizationMap: [string, string][];
  sources: string[];
  priorAdaptations: string[];
  ledger: PromiseLedger;
  episodes: EpisodeRef[];
  /** Beats carrying a non-empty `hidden_from`. The product claim, counted. */
  beatsWithHiddenFrom: number;
  /** How the season keeps its dates straight across batches. Null before the writer ran. */
  calendar: SeasonCalendar | null;
  notes: string[];
}

export interface Slate {
  serials: SerialSummary[];
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* reading                                                             */

type ReadResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "missing" | "unreadable"; detail?: string };

/**
 * Distinguishes "no file" from "file that will not parse". The first is a
 * season that was never given a ledger; the second is a bug someone introduced
 * by hand-editing, and it should not read as the first.
 */
async function readJson(...parts: string[]): Promise<ReadResult> {
  let text: string;
  try {
    text = await fs.readFile(path.join(DATA_DIR, ...parts), "utf-8");
  } catch {
    return { ok: false, reason: "missing" };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return {
      ok: false,
      reason: "unreadable",
      detail: e instanceof Error ? e.message : String(e),
    };
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
  return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

function int(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/* ------------------------------------------------------------------ */
/* normalisation                                                       */

function normaliseScores(raw: unknown): Scores | null {
  const r = asRecord(raw);
  const keys = Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[];
  if (!keys.some((k) => k in r)) return null;
  const parts = Object.fromEntries(
    keys.map((k) => [k, Math.max(0, Math.min(10, int(r[k]) ?? 0))]),
  ) as Omit<Scores, "total">;
  // Recomputed rather than trusted, exactly as the queue does it: `total` is
  // model-supplied and nothing verifies it equals the sum.
  return { ...parts, total: keys.reduce((s, k) => s + parts[k], 0) };
}

function normaliseClearance(raw: unknown): Clearance | null {
  const r = asRecord(raw);
  const status = str(r.status);
  const valid: ClearanceStatus[] = ["greenlight", "fictionalize_first", "blocked"];
  if (!status || !valid.includes(status as ClearanceStatus)) return null;
  return { status: status as ClearanceStatus, reasons: strList(r.reasons) };
}

function normaliseSpine(raw: unknown): SpineEntry[] {
  const seen = new Set<string>();
  return list(raw)
    .map((entry, i) => {
      const r = asRecord(entry);
      const raw_hook = str(r.hook_type);
      const upper = raw_hook?.toUpperCase() ?? null;
      const known = upper && (HOOK_TYPES as string[]).includes(upper);
      const repeats = upper ? seen.has(upper) : false;
      if (upper) seen.add(upper);

      return {
        ep: int(r.ep) ?? i + 1,
        turn: str(r.turn),
        hookType: known ? (upper as HookType) : null,
        hookRaw: known ? null : raw_hook,
        endsOn: str(r.ends_on),
        paysOff: str(r.pays_off),
        status: int(r.status),
        hookRepeats: repeats,
      };
    })
    .sort((a, b) => a.ep - b.ep);
}

function normaliseCast(raw: unknown): CastEntry[] {
  return list(raw).map((entry, i) => {
    const r = asRecord(entry);
    const name = str(r.name) ?? str(r.name_or_role) ?? `character ${i + 1}`;
    return {
      id: str(r.char_id) ?? name.toLowerCase(),
      name,
      role: str(r.role),
      want: str(r.want) ?? str(r.motive),
      mapsTo: str(r.maps_to),
      composite: r.composite === true,
    };
  });
}

const CONFIDENCES: Confidence[] = ["verified", "reported", "alleged", "disputed"];

function normaliseTimeline(raw: unknown): TimelineEntry[] {
  return list(raw).map((entry, i) => {
    const r = asRecord(entry);
    const c = str(r.confidence)?.toLowerCase() ?? null;
    return {
      id: str(r.id) ?? `t${i + 1}`,
      date: str(r.date),
      what: str(r.what_happened) ?? str(r.what) ?? "",
      confidence: c && CONFIDENCES.includes(c as Confidence) ? (c as Confidence) : null,
      source: str(r.source),
    };
  });
}

/**
 * Four ledgers, four vocabularies. `raised_ep` / `raised_in_ep`;
 * `listener_is_waiting_for` / `listener_wants` / `listener_waiting_for`;
 * `must_pay_by_ep` / `must_pay_by`; `paid_ep` / `paid_in_ep`;
 * `how_paid` / `paid_how`; and the state lives under `status` in two files and
 * `state` in the other two, spelled `paid` in one and `closed` in the next.
 */
function normalisePromise(raw: unknown, i: number): PromiseEntry {
  const r = asRecord(raw);
  const rawState = (str(r.status) ?? str(r.state) ?? "").toLowerCase();
  const paidEp = int(r.paid_ep) ?? int(r.paid_in_ep);
  const mustPayBy = int(r.must_pay_by_ep) ?? int(r.must_pay_by);

  const state: PromiseEntry["state"] =
    rawState === "paid" || rawState === "closed"
      ? "paid"
      : rawState === "open"
        ? "open"
        : paidEp !== null
          ? "paid"
          : "unknown";

  return {
    id: str(r.id) ?? `p${i + 1}`,
    raisedEp: int(r.raised_ep) ?? int(r.raised_in_ep),
    // `raised_by` describes the moment rather than the debt, but in the one
    // file that has it there is no other statement of what was promised.
    promise: str(r.promise) ?? str(r.raised_by),
    waitingFor:
      str(r.listener_is_waiting_for) ??
      str(r.listener_wants) ??
      str(r.listener_waiting_for),
    mustPayBy,
    paidEp,
    howPaid: str(r.how_paid) ?? str(r.paid_how),
    state,
    late: state === "paid" && paidEp !== null && mustPayBy !== null && paidEp > mustPayBy,
  };
}

/**
 * The season's own record of when things happened.
 *
 * The writer works in batches, so batch four only avoids contradicting batch
 * one about what month it is because batch one wrote it down here and it was
 * handed back. `unresolved` is the interesting part: dates the source material
 * disagrees on, which the scripts are required to leave unstated rather than
 * quietly pick a winner for.
 */
function normaliseCalendar(raw: ReadResult): SeasonCalendar | null {
  if (!raw.ok) return null;
  const r = asRecord(raw.value);
  const dates = list(r.dates_fixed).map((e) => {
    const d = asRecord(e);
    return { ep: int(d.ep), when: str(d.when), what: str(d.what) };
  });
  const periods = list(r.periods_fixed).map((e) => {
    const p = asRecord(e);
    const between = list(p.between).map((n) => int(n)).filter((n): n is number => n !== null);
    return { between, elapsed: str(p.elapsed) };
  });
  const unresolved = strList(r.unresolved);

  // A file holding nothing is the same as no file, and should not render an
  // empty section that implies the writer tracked dates and found none.
  if (!str(r.season_start) && !dates.length && !periods.length && !unresolved.length) {
    return null;
  }
  return { seasonStart: str(r.season_start), dates, periods, unresolved };
}

function normaliseLedger(raw: ReadResult): PromiseLedger {
  const empty: PromiseLedger = {
    promises: [],
    openCount: 0,
    paidCount: 0,
    declaredOpenCount: null,
    state: null,
    rule: null,
    audit: null,
    deliberatelyOpen: [],
    absent: true,
  };
  if (!raw.ok) return empty;

  const r = asRecord(raw.value);
  const promises = list(r.promises).map(normalisePromise);

  // `audit` is a prose string in one file and an object with a `notes` field in
  // another. Both are the same thing: the model's remark on its own ledger.
  const auditRaw = r.audit ?? r._audit;
  const audit = str(auditRaw) ?? str(asRecord(auditRaw).notes);

  return {
    promises,
    openCount: promises.filter((p) => p.state !== "paid").length,
    paidCount: promises.filter((p) => p.state === "paid").length,
    declaredOpenCount: int(r.open_count),
    state: str(r.ledger_state) ?? str(r.status),
    rule: str(r.rule),
    audit,
    deliberatelyOpen: list(r.narrator_debts_left_open_deliberately).map((e) => {
      const d = asRecord(e);
      return {
        raisedEp: int(d.raised_ep),
        line: str(d.line) ?? "",
        settledEp: int(d.settled_ep),
        how: str(d.how),
      };
    }),
    absent: false,
  };
}

/** `{ real thing: fictional replacement }`, in file order. */
function normaliseFictionalization(raw: unknown): [string, string][] {
  return Object.entries(asRecord(raw))
    .map(([k, v]) => [k, str(v) ?? ""] as [string, string])
    .filter(([, v]) => v);
}

/* ------------------------------------------------------------------ */
/* episodes                                                            */

const EP_FILE = /^ep(\d+)\.md$/i;

/** `# Episode 4 — "The Book Doesn't Have Her"`, cased two ways across stories. */
/**
 * The episode's own title, without the number the screen already shows.
 *
 * Hand-written seasons quote it (`# Episode 4 — "Present, Sir"`); the writer
 * emits it bare (`# Episode 4 — The Date He Should Not Know`). Only the quoted
 * form was being stripped, so every season the pipeline actually produced read
 * "04  Episode 4 — The Date He Should Not Know" in the list and doubled the
 * whole thing in the tab title. The generated seasons were the ones that looked
 * broken, which is the wrong way round.
 */
function episodeTitle(body: string): string | null {
  const heading = body.split("\n").find((l) => l.startsWith("# "));
  if (!heading) return null;
  const quoted = heading.match(/[""“”"](.+?)[""“”"]/);
  if (quoted) return quoted[1];
  return (
    heading
      .replace(/^#\s*/, "")
      .replace(/^episode\s+\d+\s*[—–:-]\s*/i, "")
      .trim() || null
  );
}

function countWords(body: string): number {
  return body.split(/\s+/).filter(Boolean).length;
}

function episodeDir(dir: string): string {
  return path.join(DATA_DIR, "stories", dir, "episodes");
}

async function readEpisodes(dir: string): Promise<EpisodeRef[]> {
  let names: string[];
  try {
    names = await fs.readdir(episodeDir(dir));
  } catch {
    // No `episodes/` at all: the season was planned but never written.
    return [];
  }

  const eps = names
    .map((n) => ({ n, m: n.match(EP_FILE) }))
    .filter((x): x is { n: string; m: RegExpMatchArray } => x.m !== null)
    .map((x) => ({ ep: Number(x.m[1]), file: x.n }))
    .sort((a, b) => a.ep - b.ep);

  return Promise.all(
    eps.map(async ({ ep, file }) => {
      let body = "";
      try {
        body = await fs.readFile(path.join(episodeDir(dir), file), "utf-8");
      } catch {
        // A listed file that will not read is a broken season, not a fatal one.
      }
      return { ep, file, title: episodeTitle(body), words: countWords(body) };
    }),
  );
}

/* ------------------------------------------------------------------ */
/* assembly                                                            */

/**
 * What a season dossier is supposed to carry. Every entry here is absent from
 * at least one of the four committed stories, which is the reason the list
 * exists — the screen names the gap instead of leaving a blank where an editor
 * would read "nothing to see".
 */
const REQUIRED = [
  "season",
  "cast",
  "timeline",
  "clearance",
  "never_narrate_as_fact",
  "fictionalization_map",
  "sources",
  "scores",
  "engine",
  "category",
  "sells",
] as const;

async function loadOne(dir: string): Promise<{ serial: Serial | null; notes: string[] }> {
  const notes: string[] = [];

  const dossierRead = await readJson("stories", dir, "dossier.json");
  if (!dossierRead.ok) {
    notes.push(
      dossierRead.reason === "missing"
        ? `${dir}: no dossier.json — not a commissioned season, skipped.`
        : `${dir}: dossier.json will not parse (${dossierRead.detail}) — skipped.`,
    );
    return { serial: null, notes };
  }

  const d = asRecord(dossierRead.value);
  const beatsRead = await readJson("stories", dir, "beats.json");
  const ledgerRead = await readJson("stories", dir, "promises.json");

  if (!beatsRead.ok && beatsRead.reason === "unreadable") {
    notes.push(`${dir}: beats.json will not parse — canon counts unavailable.`);
  }
  if (!ledgerRead.ok && ledgerRead.reason === "unreadable") {
    notes.push(`${dir}: promises.json will not parse — the ledger is not shown.`);
  }

  // The wrapper object round `beats[]` carries a different sibling key in every
  // file — `tier_note`, `story_id`, `story`. Only `beats` is load-bearing.
  const beats = beatsRead.ok ? list(asRecord(beatsRead.value).beats) : [];
  const beatsWithHiddenFrom = beats.filter(
    (b) => strList(asRecord(b).hidden_from).length > 0,
  ).length;

  const ledger = normaliseLedger(ledgerRead);
  // Written by the script writer from the second batch onward. Absent on the
  // four seasons that predate it, so its absence is normal, not a fault.
  const calendar = normaliseCalendar(await readJson("stories", dir, "calendar.json"));
  const episodes = await readEpisodes(dir);
  const spine = normaliseSpine(d.season);
  const cast = normaliseCast(d.cast);
  const scores = normaliseScores(d.hunt_scores ?? d.scores);
  const clearance = normaliseClearance(d.clearance);
  const neverNarrate = strList(d.never_narrate_as_fact);
  // The pitch was called `sells` in the first story, `selling` in the second,
  // and `why_this_sells` by the time the schema named it. All three mean the
  // hook a listener buys; two of the four stories carry none of them.
  const sells = str(d.sells) ?? str(d.selling) ?? str(d.why_this_sells);

  const missing = REQUIRED.filter((k) => {
    if (k === "scores") return !scores;
    if (k === "sells") return !sells;
    if (k === "clearance") return !clearance;
    if (k === "season") return spine.length === 0;
    if (k === "cast") return cast.length === 0;
    if (k === "never_narrate_as_fact") return neverNarrate.length === 0;
    if (k === "fictionalization_map")
      return normaliseFictionalization(d.fictionalization_map).length === 0;
    if (k === "sources") return strList(d.sources).length === 0;
    if (k === "timeline") return normaliseTimeline(d.timeline).length === 0;
    return !str(d[k]);
  }).map(String);

  if (!episodes.length) {
    notes.push(`${dir}: planned but not yet written — no episode files on disk.`);
  } else if (spine.length && episodes.length !== spine.length) {
    notes.push(
      `${dir}: the season plans ${spine.length} episodes and ${episodes.length} ` +
        "are written.",
    );
  }
  if (
    !ledger.absent &&
    ledger.declaredOpenCount !== null &&
    ledger.declaredOpenCount !== ledger.openCount
  ) {
    notes.push(
      `${dir}: the ledger declares ${ledger.declaredOpenCount} open and the rows ` +
        `count ${ledger.openCount}. The rows are shown.`,
    );
  }

  const serial: Serial = {
    id: dir,
    eventId: str(d.event_id),
    title: str(d.title) ?? dir,
    fantasy: str(d.fantasy),
    oneLine: str(d.one_line_summary) ?? str(d.one_line),
    category: str(d.category) ?? str(d.hunt_category),
    engine: str(d.engine),
    sells,
    whyThisWorks: str(d.why_this_works),
    protagonist: personBlock(d.protagonist),
    antagonist: personBlock(d.antagonist),
    clearance,
    scores,
    spine,
    cast,
    timeline: normaliseTimeline(d.timeline),
    neverNarrate,
    fictionalizationMap: normaliseFictionalization(d.fictionalization_map),
    sources: strList(d.sources),
    priorAdaptations: strList(asRecord(d.novelty).prior_adaptations),
    ledger,
    episodes,
    beatCount: beats.length,
    beatsWithHiddenFrom,
    calendar,
    episodeCount: episodes.length,
    castCount: cast.length,
    spineLength: spine.length,
    openPromises: ledger.openCount,
    totalPromises: ledger.promises.length,
    promisesAbsent: ledger.absent,
    neverNarrateCount: neverNarrate.length,
    missing,
    notes,
  };

  return { serial, notes };
}

/**
 * `protagonist` / `antagonist` are free-form objects whose keys differ by
 * story. Rendered as whatever labelled lines they turn out to hold rather than
 * pinned to a shape none of the four agree on.
 */
/**
 * A person from the dossier, as things worth reading about them.
 *
 * Identifier keys are dropped rather than rendered. The screen labels each key
 * by humanising it, so a `char_id` reaches a producer as the line "char id /
 * meera" — a field name and an internal handle, in a panel that is otherwise
 * prose. Anything ending in `_id` is a reference to a record elsewhere, never
 * something anyone reads, so the whole class goes rather than one key at a time.
 */
function personBlock(raw: unknown): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(asRecord(raw))) {
    const s = str(v) ?? (Array.isArray(v) ? strList(v).join("; ") : null);
    if (s && k !== "id" && !k.endsWith("_id")) out[k] = s;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Which seasons the slate shows, when you do not want all of them.
 *
 * `CANONFORGE_STORIES=evt_gandhinagar_tribunal` — comma-separated, unset shows
 * everything. For walking one story in front of an audience without deleting
 * the other seven or editing a file between rehearsal and stage.
 *
 * Deliberately a filter on the *list* and not on the loader: every season stays
 * reachable by its own URL, so a question about one of them is a link away
 * rather than a restart. An id here that is not on disk is ignored rather than
 * rendered as a missing show — a typo in an env var should not invent a season.
 */
function onlyShow(): Set<string> | null {
  const raw = (process.env.CANONFORGE_STORIES ?? "").trim();
  if (!raw) return null;
  const wanted = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return wanted.length ? new Set(wanted) : null;
}

/**
 * Every season on disk. What `loadSerial` and `loadEpisode` resolve against.
 *
 * Unfiltered on purpose — see `slateDirs` below. Both loaders share this, so
 * filtering here would 404 the seasons the slate is merely not listing, and a
 * question about one of them mid-demo would need a restart to answer.
 */
async function storyDirs(): Promise<{ dirs: string[]; error: string | null }> {
  try {
    const entries = await fs.readdir(path.join(DATA_DIR, "stories"), {
      withFileTypes: true,
    });
    return {
      // A leading underscore marks a scratch run — `_verify_ep1_3` is three
      // episodes generated to check the writer, not a season anyone commissioned.
      dirs: entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
        .map((e) => e.name)
        .sort(),
      error: null,
    };
  } catch {
    return { dirs: [], error: "no-dir" };
  }
}

/** The seasons the slate lists, which is the only place `CANONFORGE_STORIES` applies. */
async function slateDirs(): Promise<{ dirs: string[]; error: string | null }> {
  const all = await storyDirs();
  const only = onlyShow();
  if (!only) return all;
  return { ...all, dirs: all.dirs.filter((name) => only.has(name)) };
}

export async function loadSlate(): Promise<Slate> {
  const { dirs, error } = await slateDirs();
  if (error) {
    return {
      serials: [],
      warnings: [
        "No `data/stories/` directory. Nothing has been generated yet — run " +
          "`python tasks.py serial --event <id>` to commission a season.",
      ],
    };
  }

  const loaded = await Promise.all(dirs.map(loadOne));
  const serials = loaded
    .map((l) => l.serial)
    .filter((s): s is Serial => s !== null)
    // Most complete first: a season with episodes on disk is the one an editor
    // wants to open, and one that is only planned should not lead the slate.
    .sort((a, b) => b.episodeCount - a.episodeCount || a.title.localeCompare(b.title));

  const warnings = loaded.flatMap((l) => l.notes);
  if (!serials.length && dirs.length) {
    warnings.push("Every directory under `data/stories/` failed to load as a season.");
  }

  return { serials, warnings };
}

export async function loadSerial(id: string): Promise<Serial | null> {
  const { dirs } = await storyDirs();
  if (!dirs.includes(id)) return null;
  return (await loadOne(id)).serial;
}

export async function loadEpisode(id: string, ep: number): Promise<Episode | null> {
  const { dirs } = await storyDirs();
  if (!dirs.includes(id)) return null;

  const refs = await readEpisodes(id);
  const ref = refs.find((r) => r.ep === ep);
  if (!ref) return null;

  try {
    const body = await fs.readFile(path.join(episodeDir(id), ref.file), "utf-8");
    return { ...ref, body };
  } catch {
    return null;
  }
}
