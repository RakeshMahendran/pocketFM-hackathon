import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

import { DATA_DIR } from "./data";
import type { ClearanceStatus } from "./types";

/**
 * The spin-off half of the product, read server-side.
 *
 * Two sources, because the pipeline keeps them in two places for good reasons:
 *
 *  - **The cast is computed, not stored.** `knows` / `blind` are derived from
 *    the beat store every time they are asked for, so there is no `cast.json`
 *    to read and a cached copy would go stale the moment a season is rewritten.
 *    `src.canon.views.promotable` is the definition of who can carry a serial;
 *    reimplementing its rule here would drift from it, and the drift would show
 *    as a character the console offers and the generator refuses. So the module
 *    is invoked, exactly as `publish.ts` invokes the checker.
 *  - **Spin-offs are files**, under `data/spinoffs/`, one per generation run.
 *    Those are read directly.
 *
 * Nothing here throws. Python not installed, story never seeded, half-written
 * JSON — each degrades to an empty list or a null, and the screen says what is
 * missing. A console that 500s because a demo machine has no `python` on PATH
 * is worse than one that says the roster could not be computed.
 */

const run = promisify(execFile);
// `..` escapes the web root; the trace is opted out of rather than the path
// contorted, same as `DATA_DIR`. See the note in `data.ts`.
const REPO = path.join(/* turbopackIgnore: true */ process.cwd(), "..");
const SPINOFF_DIR = path.join(DATA_DIR, "spinoffs");

/* ------------------------------------------------------------------ */
/* types                                                               */

/** A violation the panel raised. `warn` is a note; only `error` contradicts. */
export interface Violation {
  check: string;
  severity: "error" | "warn";
  quote: string | null;
  /** The mainline beat leaked, when the check could name one. */
  beatId: string | null;
  why: string | null;
  /** Which panel members raised it. `deterministic` means no model was involved. */
  source: string | null;
}

export interface PanelAttempt {
  member: string;
  /** What that member tried to break and could not. */
  notes: string[];
}

export interface Verdict {
  /**
   * `missing` = never validated, which is not the same as clean and must never
   * render as it. `inconclusive` = a panel member failed to answer; a member
   * that did not report is not a member that found nothing.
   */
  status: "clean" | "violations" | "inconclusive" | "missing";
  /** Every finding in file order, errors and warns together. */
  violations: Violation[];
  errors: Violation[];
  warnings: Violation[];
  /** The number the UI calls "contradictions". Warns are excluded on purpose. */
  errorCount: number;
  warnCount: number;
  /** The file's own count, kept so a disagreement can be shown rather than hidden. */
  declaredErrorCount: number | null;
  /** The subset caught by SQL rather than by a model. The unarguable ones. */
  deterministic: Violation[];
  /** Panel members that did not report. */
  inconclusive: string[];
  /** Turns "we found nothing" into "we looked, here is where". */
  attemptsThatFailed: PanelAttempt[];
  membersRun: number | null;
  membersExpected: number | null;
}

/** The mainline beat a spin-off episode was generated from. */
export interface AnchorBeat {
  beatId: string;
  ep: number | null;
  seq: number | null;
  worldTime: string | null;
  location: string | null;
  whatHappened: string | null;
  fact: string | null;
  valence: number | null;
  kind: string | null;
}

/** A beat the spin-off wrote back. Always `branch_canon` — core is immutable. */
export interface SpinoffBeat {
  beatId: string;
  ep: number | null;
  seq: number | null;
  worldTime: string | null;
  location: string | null;
  present: string[];
  witnessedBy: string[];
  /** Who does not know this happened. The field the whole product rests on. */
  hiddenFrom: string[];
  whatHappened: string | null;
  /** A timeline entry, another beat, or the literal `fictionalized`. */
  sourceRef: string | null;
  /** The mainline beat this one re-renders, when it is a crossing. */
  crossingOf: string | null;
  tier: string | null;
  pov: string | null;
  note: string | null;
}

/** The same moment in both serials: facts identical, meaning free to differ. */
export interface Crossing {
  mainlineBeatId: string | null;
  renderedAs: string | null;
  objectiveFactsKept: string | null;
}

export interface LedgerWindow {
  window: string | null;
  what: string | null;
}

/** What promotion produced: the character as a lead rather than a bystander. */
export interface Bible {
  want: string | null;
  wound: string | null;
  voice: string | null;
  engine: string | null;
  reframe: string | null;
  stance: string | null;
  genre: string | null;
  pitch: string | null;
  /** The gaps, filled: what they were doing while the mainline looked elsewhere. */
  offscreenLedger: LedgerWindow[];
}

export interface CharacterBible {
  charId: string;
  name: string;
  role: string | null;
  promotable: boolean;
  /** Which real person the character derives from, and what legal treatment applies. */
  mapsTo: string | null;
  composite: boolean;
  clearance: ClearanceStatus | null;
  /** The cheap stub promotion was given, kept so the expensive call can be judged. */
  facts: string[];
  voiceSamples: string[];
  stubWant: string | null;
  bible: Bible;
}

export interface CastRow {
  charId: string;
  name: string;
  role: string | null;
  want: string | null;
  /** Beats they witnessed. */
  witnessed: number;
  /** Beats they are excluded from — the number that sells the roster. */
  blind: number;
  promotable: boolean;
  /** Anchors already generated for them, so the roster can badge without re-reading. */
  anchors: string[];
  hasBible: boolean;
}

export interface Roster {
  storyId: string;
  rows: CastRow[];
  /**
   * Why the roster is empty, when it is. Empty and broken look identical to a
   * reader otherwise.
   */
  warning: string | null;
}

export interface Character extends CastRow {
  storyId: string;
  bible: CharacterBible | null;
}

/** One generation run — the constrained episode, or its unconstrained twin. */
export interface SpinoffRun {
  storyId: string;
  charId: string;
  anchorBeatId: string;
  /**
   * `false` marks the leak twin: the same episode generated with the constraint
   * set removed, to prove the checker bites. Never show it as product.
   */
  constrained: boolean;
  file: string;
  title: string | null;
  logline: string | null;
  generatedAt: string | null;
  model: string | null;
  words: number;
  beatCount: number;
  crossingCount: number;
  /** Mainline beats the episode leans on. */
  cites: string[];
  flags: string[];
  /** How many beats the writer was allowed, and how many it was walled off from. */
  allowedCount: number | null;
  forbiddenCount: number | null;
  verdict: Verdict;
}

export interface SpinoffBody extends SpinoffRun {
  script: string;
  anchor: AnchorBeat | null;
  bible: Bible | null;
  beats: SpinoffBeat[];
  crossings: Crossing[];
}

/**
 * A row on the list screen. The constrained run is flattened in rather than
 * nested so the common case reads without optional chaining; `constrained`
 * still states plainly what is being looked at, so a directory holding only a
 * leak twin is listed honestly instead of being dressed up as product.
 */
export interface SpinoffListing extends SpinoffRun {
  charName: string | null;
  leak: SpinoffRun | null;
}

export interface Spinoff extends SpinoffBody {
  leak: SpinoffBody | null;
}

/* ------------------------------------------------------------------ */
/* parsing helpers                                                     */
/* Deliberately local copies of the ones in `serials.ts`, which does not */
/* export them. A shared module is the right fix and belongs to nobody   */
/* right now; duplicating five one-liners beats editing a file another   */
/* track owns.                                                          */

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

function countWords(body: string): number {
  return body.split(/\s+/).filter(Boolean).length;
}

async function readJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    // Missing and malformed collapse to the same answer here: everything below
    // treats an unreadable artefact as an absent one and says so on screen.
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* file names                                                          */

interface ParsedName {
  storyId: string;
  charId: string;
  /** Empty on bible files, which have no anchor. */
  anchorBeatId: string;
  leak: boolean;
  validation: boolean;
  bible: boolean;
}

/**
 * `<story>__<char>__<anchor>[__leak][__validation].json`, plus
 * `<story>__<char>__bible.json`.
 *
 * `data/spinoffs/` also holds `leak_proof.json`, written by `tasks.py leak` and
 * belonging to no story — it has no `__` at all and falls out on the segment
 * count. Anything else with a suffix this does not recognise is skipped rather
 * than guessed at: a file whose name we cannot read is a file whose contents we
 * should not attribute to a character.
 */
function parseName(file: string): ParsedName | null {
  if (!file.endsWith(".json")) return null;
  const parts = file.slice(0, -".json".length).split("__");
  if (parts.length < 3) return null;

  const [storyId, charId, third, ...rest] = parts;
  if (!storyId || !charId || !third) return null;

  let leak = false;
  let validation = false;
  for (const tag of rest) {
    if (tag === "leak") leak = true;
    else if (tag === "validation") validation = true;
    else return null;
  }

  const bible = third === "bible";
  if (bible && (leak || validation)) return null;

  return {
    storyId,
    charId,
    anchorBeatId: bible ? "" : third,
    leak,
    validation,
    bible,
  };
}

async function spinoffFiles(): Promise<{ name: string; parsed: ParsedName }[]> {
  let names: string[];
  try {
    names = await fs.readdir(SPINOFF_DIR);
  } catch {
    // No directory at all: nothing has been promoted yet, which is a normal
    // state for a freshly cloned repo.
    return [];
  }
  return names
    .map((name) => ({ name, parsed: parseName(name) }))
    .filter((f): f is { name: string; parsed: ParsedName } => f.parsed !== null);
}

/* ------------------------------------------------------------------ */
/* validation                                                          */

const MISSING_VERDICT: Verdict = {
  status: "missing",
  violations: [],
  errors: [],
  warnings: [],
  errorCount: 0,
  warnCount: 0,
  declaredErrorCount: null,
  deterministic: [],
  inconclusive: [],
  attemptsThatFailed: [],
  membersRun: null,
  membersExpected: null,
};

function normaliseViolation(raw: unknown): Violation {
  const r = asRecord(raw);
  // Anything not explicitly `warn` counts as an error. Erring towards the
  // louder reading is the safe direction for a continuity checker.
  const severity = str(r.severity)?.toLowerCase() === "warn" ? "warn" : "error";
  return {
    check: str(r.check) ?? "unnamed check",
    severity,
    quote: str(r.quote),
    beatId: str(r.beat_id),
    why: str(r.why),
    source: str(r.source),
  };
}

function normaliseVerdict(raw: unknown): Verdict {
  if (raw === null) return MISSING_VERDICT;
  const r = asRecord(raw);
  if (!("status" in r) && !("violations" in r)) return MISSING_VERDICT;

  const violations = list(r.violations).map(normaliseViolation);
  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warn");
  const inconclusive = strList(r.inconclusive);

  // Derived from the rows, not read off `status`, and with the same precedence
  // `run.py` uses: a member that did not answer outranks a clean sweep. The
  // file's own error count is kept alongside so the two can be compared.
  const status: Verdict["status"] = inconclusive.length
    ? "inconclusive"
    : errors.length
      ? "violations"
      : "clean";

  const attemptsThatFailed = Object.entries(asRecord(r.attempts_that_failed))
    .map(([member, notes]) => ({ member, notes: strList(notes) }))
    .filter((a) => a.notes.length);

  return {
    status,
    violations,
    errors,
    warnings,
    errorCount: errors.length,
    warnCount: warnings.length,
    declaredErrorCount: int(r.n_errors),
    deterministic: list(r.deterministic_errors).map(normaliseViolation),
    inconclusive,
    attemptsThatFailed,
    membersRun: int(r.members_run),
    membersExpected: int(r.members_expected),
  };
}

/* ------------------------------------------------------------------ */
/* spin-off files                                                      */

function normaliseBible(raw: unknown): Bible | null {
  const r = asRecord(raw);
  if (!Object.keys(r).length) return null;
  return {
    want: str(r.want),
    wound: str(r.wound),
    voice: str(r.voice),
    engine: str(r.engine),
    reframe: str(r.reframe),
    stance: str(r.stance),
    genre: str(r.genre),
    pitch: str(r.pitch),
    offscreenLedger: list(r.offscreen_ledger).map((e) => {
      const w = asRecord(e);
      return { window: str(w.window), what: str(w.what) };
    }),
  };
}

function normaliseAnchor(raw: unknown): AnchorBeat | null {
  const r = asRecord(raw);
  const beatId = str(r.beat_id);
  if (!beatId) return null;
  return {
    beatId,
    ep: int(r.ep),
    seq: int(r.seq),
    worldTime: str(r.world_time),
    location: str(r.location),
    whatHappened: str(r.what_happened),
    fact: str(r.fact),
    valence: int(r.valence),
    kind: str(r.kind),
  };
}

function normaliseBeat(raw: unknown, i: number): SpinoffBeat {
  const r = asRecord(raw);
  return {
    beatId: str(r.beat_id) ?? `x${i + 1}`,
    ep: int(r.ep),
    seq: int(r.seq),
    worldTime: str(r.world_time),
    location: str(r.location),
    present: strList(r.present),
    witnessedBy: strList(r.witnessed_by),
    hiddenFrom: strList(r.hidden_from),
    whatHappened: str(r.what_happened),
    sourceRef: str(r.source_ref),
    crossingOf: str(r.crossing_of),
    tier: str(r.tier),
    pov: str(r.pov),
    note: str(r.note),
  };
}

/** Only the two counts. The constraint set itself is the writer's business. */
function constraintCounts(raw: unknown): {
  allowedCount: number | null;
  forbiddenCount: number | null;
} {
  const r = asRecord(raw);
  if (!Object.keys(r).length) return { allowedCount: null, forbiddenCount: null };
  const count = (ids: unknown, full: unknown): number | null => {
    if (Array.isArray(ids)) return ids.length;
    if (Array.isArray(full)) return full.length;
    return null;
  };
  return {
    allowedCount: count(r.allowed_ids, r.allowed),
    forbiddenCount: count(r.forbidden_ids, r.forbidden),
  };
}

/**
 * One generated file plus the verdict that sits beside it.
 *
 * The identity of a run comes from its filename rather than from the JSON
 * inside it. The two agree today, but the filename is what the reader clicked
 * and what the validator paired its report with, so it wins.
 */
async function loadRun(
  name: string,
  parsed: ParsedName,
): Promise<SpinoffBody | null> {
  const raw = await readJson(path.join(SPINOFF_DIR, name));
  if (raw === null) return null;
  const r = asRecord(raw);

  const episode = asRecord(r.episode);
  const script = str(episode.script) ?? "";
  const beats = list(r.beats).map(normaliseBeat);
  const crossings: Crossing[] = list(r.crossings).map((c) => {
    const x = asRecord(c);
    return {
      mainlineBeatId: str(x.mainline_beat_id),
      renderedAs: str(x.rendered_as),
      objectiveFactsKept: str(x.objective_facts_kept),
    };
  });

  const verdictName = `${name.slice(0, -".json".length)}__validation.json`;
  const verdict = normaliseVerdict(await readJson(path.join(SPINOFF_DIR, verdictName)));

  return {
    storyId: parsed.storyId,
    charId: parsed.charId,
    anchorBeatId: parsed.anchorBeatId,
    // The filename says leak; the file also carries `constrained`. Either one
    // being false makes it a leak twin.
    constrained: !parsed.leak && r.constrained !== false,
    file: name,
    title: str(episode.title),
    logline: str(episode.logline),
    generatedAt: str(r.generated_at),
    model: str(r.model),
    words: countWords(script),
    beatCount: beats.length,
    crossingCount: crossings.length,
    cites: strList(r.cites),
    flags: strList(r.flags),
    ...constraintCounts(r.forbidden),
    verdict,
    script,
    anchor: normaliseAnchor(r.anchor),
    bible: normaliseBible(r.bible),
    beats,
    crossings,
  };
}

/** Strips the body. The list screen wants counts and a verdict, not scripts. */
function toRun(body: SpinoffBody): SpinoffRun {
  const { script: _script, anchor: _anchor, bible: _bible, beats: _beats,
    crossings: _crossings, ...run } = body;
  return run;
}

/* ------------------------------------------------------------------ */
/* the cast                                                            */

/**
 * The roster, computed by Python on demand.
 *
 * `tasks.py cast` does not forward `--json`, so the module is called directly.
 * Thirty seconds is generous for what is a query over 46 beats, but the first
 * call also pays for the Lakebase token mint.
 */
async function runCast(storyId: string): Promise<{
  rows: Omit<CastRow, "anchors" | "hasBible">[];
  warning: string | null;
}> {
  let stdout: string;
  try {
    ({ stdout } = await run(
      "python",
      ["-m", "src.canon.cast", "--story", storyId, "--json"],
      { cwd: REPO, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    ));
  } catch {
    // Exit 1 is what the module returns for an unknown story, and a missing
    // interpreter lands here too. Neither is worth two different screens: the
    // reader's next move is the same, which is to ask whoever seeded the story.
    return {
      rows: [],
      warning:
        "The cast could not be worked out for this story. Nothing has been " +
        "seeded for it yet, or the pipeline is not runnable on this machine.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      rows: [],
      warning: "The cast came back in a form this screen could not read.",
    };
  }

  const rows = list(parsed).map((entry, i) => {
    const r = asRecord(entry);
    const charId = str(r.char_id) ?? `character-${i + 1}`;
    return {
      charId,
      name: str(r.name) ?? charId,
      role: str(r.role),
      want: str(r.want),
      witnessed: int(r.witnessed) ?? 0,
      blind: int(r.blind) ?? 0,
      promotable: r.promotable === true,
    };
  });

  return {
    rows,
    warning: rows.length ? null : "This story has no cast recorded against it.",
  };
}

/* ------------------------------------------------------------------ */
/* exported reads                                                      */

/**
 * The roster, with each character's generated work joined in.
 *
 * Python's order is kept exactly: promotable first, then most witnessed. That
 * ordering is an editorial judgement made in `views.promotable`, and re-sorting
 * here would quietly overrule it.
 */
export async function loadRoster(storyId: string): Promise<Roster> {
  const [{ rows, warning }, files] = await Promise.all([
    runCast(storyId),
    spinoffFiles(),
  ]);

  const mine = files.filter((f) => f.parsed.storyId === storyId);
  const anchors = new Map<string, string[]>();
  const bibles = new Set<string>();
  for (const { parsed } of mine) {
    if (parsed.bible) {
      bibles.add(parsed.charId);
    } else if (!parsed.validation && !parsed.leak) {
      anchors.set(parsed.charId, [
        ...(anchors.get(parsed.charId) ?? []),
        parsed.anchorBeatId,
      ]);
    }
  }

  return {
    storyId,
    rows: rows.map((r) => ({
      ...r,
      anchors: (anchors.get(r.charId) ?? []).sort(),
      hasBible: bibles.has(r.charId),
    })),
    warning,
  };
}

/** The roster rows alone. Empty when the cast cannot be computed — never throws. */
export async function loadCast(storyId: string): Promise<CastRow[]> {
  return (await loadRoster(storyId)).rows;
}

function normaliseCharacterBible(raw: unknown, charId: string): CharacterBible | null {
  const r = asRecord(raw);
  const bible = normaliseBible(r.bible);
  if (!bible) return null;
  const anchor = asRecord(r.real_anchor);
  const stub = asRecord(r.stub);
  const clearance = str(anchor.clearance);
  const valid: ClearanceStatus[] = ["greenlight", "fictionalize_first", "blocked"];

  return {
    charId: str(r.char_id) ?? charId,
    name: str(r.name) ?? charId,
    role: str(r.role),
    promotable: r.promotable === true,
    // `invented` is a real value here and means the character maps to nobody.
    mapsTo: str(anchor.maps_to),
    composite: anchor.composite === true,
    clearance: clearance && valid.includes(clearance as ClearanceStatus)
      ? (clearance as ClearanceStatus)
      : null,
    facts: strList(stub.facts),
    voiceSamples: strList(stub.voice_samples),
    stubWant: str(stub.want),
    bible,
  };
}

/**
 * One character: their roster row, and the bible promotion produced for them.
 *
 * A character with a bible on disk is returned even when the roster cannot be
 * computed. Work that has already been paid for should stay reachable when the
 * live query behind the roster is down — that is precisely when someone needs
 * to look at it.
 */
export async function loadCharacter(
  storyId: string,
  charId: string,
): Promise<Character | null> {
  const [roster, files] = await Promise.all([loadRoster(storyId), spinoffFiles()]);
  const row = roster.rows.find((r) => r.charId === charId) ?? null;

  const bibleFile = files.find(
    (f) => f.parsed.bible && f.parsed.storyId === storyId && f.parsed.charId === charId,
  );
  const bible = bibleFile
    ? normaliseCharacterBible(
        await readJson(path.join(SPINOFF_DIR, bibleFile.name)),
        charId,
      )
    : null;

  if (row) return { ...row, storyId, bible };
  if (!bible) return null;

  // No roster row: counts are unknown rather than zero, but `witnessed` and
  // `blind` are numbers on screen. Zero reads as "excluded from nothing", which
  // is wrong, so the caller can tell the difference by the counts being flat.
  return {
    storyId,
    charId,
    name: bible.name,
    role: bible.role,
    want: bible.bible.want ?? bible.stubWant,
    witnessed: 0,
    blind: 0,
    promotable: bible.promotable,
    anchors: files
      .filter(
        (f) =>
          !f.parsed.bible &&
          !f.parsed.validation &&
          !f.parsed.leak &&
          f.parsed.storyId === storyId &&
          f.parsed.charId === charId,
      )
      .map((f) => f.parsed.anchorBeatId)
      .sort(),
    hasBible: true,
    bible,
  };
}

/** `char_id` -> the cased name promotion recorded, for every bible on disk. */
async function displayNames(storyId: string): Promise<Map<string, string>> {
  const bibles = (await spinoffFiles()).filter(
    (f) => f.parsed.bible && f.parsed.storyId === storyId,
  );
  const named = await Promise.all(
    bibles.map(async (f) => {
      const r = asRecord(await readJson(path.join(SPINOFF_DIR, f.name)));
      return [f.parsed.charId, str(r.name)] as const;
    }),
  );
  return new Map(
    named.filter((n): n is readonly [string, string] => n[1] !== null),
  );
}

/**
 * Every spin-off generated for a story, leak twin attached.
 *
 * Sorted by character then anchor rather than by generation time, so the list
 * reads in the same order as the roster it was reached from and does not
 * reshuffle itself every time somebody regenerates one episode.
 */
export async function listSpinoffs(storyId: string): Promise<SpinoffListing[]> {
  const files = (await spinoffFiles()).filter(
    (f) => f.parsed.storyId === storyId && !f.parsed.bible && !f.parsed.validation,
  );

  const bodies = (
    await Promise.all(files.map((f) => loadRun(f.name, f.parsed)))
  ).filter((b): b is SpinoffBody => b !== null);

  const leaks = new Map<string, SpinoffRun>();
  const runs: SpinoffBody[] = [];
  for (const b of bodies) {
    if (b.constrained) runs.push(b);
    else leaks.set(`${b.charId} ${b.anchorBeatId}`, toRun(b));
  }

  // A leak twin with no constrained sibling still gets listed, on its own row,
  // still labelled unconstrained. Hiding it would leave a file on disk that the
  // console never mentions.
  const orphanLeaks = [...leaks.entries()]
    .filter(([key]) => !runs.some((r) => `${r.charId} ${r.anchorBeatId}` === key))
    .map(([, leak]) => leak);

  // The display name comes off the bible rather than the roster: listing five
  // files should not cost a Python process, and the only characters on this
  // screen are ones that were promoted, so a bible always exists for them.
  const names = await displayNames(storyId);

  return [
    ...runs.map((r) => ({
      ...toRun(r),
      charName: names.get(r.charId) ?? null,
      leak: leaks.get(`${r.charId} ${r.anchorBeatId}`) ?? null,
    })),
    ...orphanLeaks.map((r) => ({
      ...r,
      charName: names.get(r.charId) ?? null,
      leak: null,
    })),
  ].sort(
    (a, b) =>
      a.charId.localeCompare(b.charId) ||
      demonstrates(b) - demonstrates(a) ||
      a.anchorBeatId.localeCompare(b.anchorBeatId),
  );
}

/**
 * How much a run proves, for ordering only.
 *
 * A pair where the constrained arm is clean and the control failed is the whole
 * claim in one screen. A pair where both came out clean shows nothing — the
 * control simply did not leak that time — and reading it first invites the
 * reader to conclude the limits do nothing.
 *
 * Ratnamma has both: b014 is 0 against 0, b033 is 0 against 5. Alphabetical
 * order put the empty comparison first and pushed the real one several screens
 * down. Derived from the verdicts on disk, so it is still deterministic and
 * still does not reshuffle unless a verdict actually changes.
 */
function demonstrates(r: SpinoffListing): number {
  if (!r.leak) return 0;
  const clean = r.verdict.status === "clean" && r.verdict.errorCount === 0;
  return clean && r.leak.verdict.errorCount > 0 ? 2 : 1;
}

/**
 * One spin-off in full: script, beats, crossings, its verdict, and the
 * unconstrained twin with its own verdict.
 *
 * Both halves come back together because the claim is a comparison — the same
 * episode, generated twice, clean once. Either half alone is an assertion.
 */
export async function loadSpinoff(
  storyId: string,
  charId: string,
  anchorBeatId: string,
): Promise<Spinoff | null> {
  const base = `${storyId}__${charId}__${anchorBeatId}`;
  const parsed = parseName(`${base}.json`);
  const leakParsed = parseName(`${base}__leak.json`);
  // A slug carrying `__` would parse as a different file than it names. There
  // is no such id today; refusing is cheaper than reading the wrong episode.
  if (!parsed || !leakParsed) return null;
  if (
    parsed.storyId !== storyId ||
    parsed.charId !== charId ||
    parsed.anchorBeatId !== anchorBeatId ||
    parsed.bible
  ) {
    return null;
  }

  const [body, leak] = await Promise.all([
    loadRun(`${base}.json`, parsed),
    loadRun(`${base}__leak.json`, leakParsed),
  ]);
  if (!body) return null;

  return { ...body, leak };
}
