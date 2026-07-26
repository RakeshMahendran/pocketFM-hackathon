import { promises as fs } from "fs";
import path from "path";

import { DATA_DIR } from "./data";

/**
 * What was actually produced as audio for one episode, read off disk.
 *
 * The pipeline writes its finished mixes to `data/stories/<story>/audio/`, which
 * is outside `web/public/` and therefore not servable as a static file. Every
 * track here carries a `url` pointing at the route handler in
 * `web/app/audio/[story]/[file]/route.ts`, which is the only thing that reads
 * these bytes.
 *
 * Two things make this a reader rather than a name-builder:
 *
 *  - **The filename stem is the dossier's `event_id`, not the story directory.**
 *    `evt_kadamballi_2022_ep01.mp3` lives in `story1_denied_identity/`. There is
 *    no rule connecting the two, so the directory is scanned and the episode
 *    number is taken from the name.
 *  - **`audio_path` inside a manifest is an absolute path from the machine that
 *    ran the synthesis.** It is never used. Files are resolved by name, inside
 *    the story's own audio directory, and nowhere else.
 *
 * Nothing here throws. A story with no audio, an unreadable manifest, a
 * directory that does not exist — each comes back as an empty result, because
 * "this episode has no audio yet" is a normal state for every season but two.
 *
 * No user-facing wording lives in this file. It reports raw values and counts;
 * `components/audioWords.ts` is what turns `hi-en` into "Hindi-English".
 */

/* ------------------------------------------------------------------ */
/* types                                                               */

/** One finished mix. A language, with or without the spot effects laid in. */
export interface AudioTrack {
  /** Where the browser fetches it. Always the route handler, never a file path. */
  url: string;
  /** Raw code as the pipeline writes it — `en`, `hi-en`. Never rendered as-is. */
  language: string;
  soundEffects: boolean;
  bytes: number;
  /** From the manifest's last `end_ms`. Null when no manifest sits beside it. */
  durationMs: number | null;
}

/** One value and how many lines carry it. */
export interface Tally {
  value: string;
  count: number;
}

/**
 * Whether the performance was decided, and what it was decided to be.
 *
 * `src/audio/director.py` is the only stage that sets emotion, intensity and
 * pace, and it runs after the episode is written — an opening cannot be pitched
 * against an ending the writer has not reached yet. Its docstring names the
 * failure this type exists to expose: an episode that reaches synthesis without
 * it is `neutral 0.5` on every line, "which is not neutral — it is flat".
 *
 * So a flat episode must never render as a directed one. 71 identical lines
 * presented as craft is a claim the demo cannot survive being asked about.
 */
export interface Direction {
  directed: boolean;
  /**
   * How we know.
   *
   *  - `recorded` — the episode file carries the director's own `directed` flag.
   *    Authoritative; nothing else is needed.
   *  - `marks-vary` — no flag, but the marks themselves differ line to line,
   *    which only a review pass produces. The four seasons on disk predate the
   *    flag, so this is the live case today.
   *  - `flat` — every line sits on the same emotion, pace and intensity. That is
   *    the default the converter writes, not a decision anybody took.
   */
  basis: "recorded" | "marks-vary" | "flat";
  lineCount: number;
  /** Most-used first. The evidence that the stage did something. */
  emotions: Tally[];
  paces: Tally[];
  /** How many distinct levels the lines are set at. 1 means nobody set any. */
  intensitySettings: number;
  /**
   * Distinct voices, and distinct speaking parts. Casting, not direction —
   * kept apart deliberately, because the undirected episode on disk has twelve
   * voices in it and a voice count alone would read as evidence of craft.
   */
  voices: number;
  speakers: number;
}

/** The director's own before-and-after on the same material. */
export interface Comparison {
  asWritten: string;
  reshaped: string;
}

export interface EpisodeAudio {
  storyId: string;
  ep: number;
  /** Every mix found for this episode. Base language first, plain before effects. */
  tracks: AudioTrack[];
  /** Distinct language codes across `tracks`, in the same order. */
  languages: string[];
  comparison: Comparison | null;
  /** Null when there is no manifest to read the performance out of. */
  direction: Direction | null;
  /**
   * Audio files in the directory this reader could not place — a language token
   * it does not know, an episode it cannot number. Counted rather than guessed
   * at, so a file that exists is never silently disowned.
   */
  unplaced: number;
}

/* ------------------------------------------------------------------ */
/* paths                                                               */

/**
 * The languages `src/audio/language.py` lets a line be written in. A suffix
 * token outside this set means the file is something this reader has not been
 * taught, and mislabelling a mix is worse than declining to offer it.
 */
const LANGUAGES = new Set(["en", "hi", "hi-en", "ta", "ta-en"]);

/** The language a file with no language token is in. */
export const BASE_LANGUAGE = "en";

const STORIES = path.join(DATA_DIR, "stories");

/**
 * A story id safe to put in a filesystem path.
 *
 * Both callers take this off a URL. Directory names on disk are plain slugs, so
 * anything carrying a separator, a dot segment, or a null byte is refused
 * outright rather than normalised into something that might resolve.
 */
function safeSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value.length < 256 &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    value !== "." &&
    value !== ".."
  );
}

function audioDir(storyId: string): string {
  return path.join(STORIES, storyId, "audio");
}

/**
 * The absolute path of one audio file, or null if it is not one.
 *
 * The containment check is the point of this function, and it is why the route
 * handler imports it rather than rebuilding the path itself: a resolved path
 * that is not a direct child of this story's audio directory is refused, so a
 * traversal in either segment cannot reach a file. `resolve` is what makes that
 * true — comparing the unresolved strings would pass `a/../../b` straight
 * through.
 */
export function resolveAudioFile(storyId: string, file: string): string | null {
  if (!safeSegment(storyId) || !safeSegment(file)) return null;
  // Only ever mp3. The manifests and episode files in the same directory are
  // read server-side and have no business being reachable over HTTP.
  if (!file.toLowerCase().endsWith(".mp3")) return null;

  const dir = path.resolve(audioDir(storyId));
  const full = path.resolve(dir, file);
  // A direct child, not merely a descendant: there are no subdirectories of
  // finished audio, and `_director_test/` beside them is working material.
  if (path.dirname(full) !== dir) return null;
  return full;
}

function urlFor(storyId: string, file: string): string {
  return `/audio/${encodeURIComponent(storyId)}/${encodeURIComponent(file)}`;
}

/* ------------------------------------------------------------------ */
/* filenames                                                           */

/**
 * `<event_id>_ep01[_<language>][_sfx].mp3`, and the manifest that matches it.
 *
 * The stem before `_ep` is the dossier's event id and is deliberately not
 * checked against anything — it does not match the directory name, and pinning
 * it to one would mean a season renamed upstream loses its audio.
 */
const MP3 = /^(.+)_ep(\d+)((?:_[A-Za-z0-9-]+)*)\.mp3$/i;
const MANIFEST = /^(.+)_ep(\d+)((?:_[A-Za-z0-9-]+)*)_manifest\.json$/i;

/**
 * The director's A/B pair. Literal names, written by hand beside one episode:
 * the same material as the writer left it, and as the director reshaped it.
 */
const AB_AS_WRITTEN = "ab_a_as_written.mp3";
const AB_RESHAPED = "ab_b_reshaped.mp3";

interface Parsed {
  ep: number;
  language: string;
  soundEffects: boolean;
}

/** Null when a suffix token is not one this reader recognises. */
function parseSuffix(ep: number, rest: string): Parsed | null {
  let language = BASE_LANGUAGE;
  let soundEffects = false;

  for (const token of rest.split("_").filter(Boolean)) {
    const t = token.toLowerCase();
    if (t === "sfx") soundEffects = true;
    else if (LANGUAGES.has(t)) language = t;
    else return null;
  }
  return { ep, language, soundEffects };
}

function parse(name: string, pattern: RegExp): Parsed | null {
  const m = pattern.exec(name);
  if (!m) return null;
  const ep = Number(m[2]);
  if (!Number.isFinite(ep)) return null;
  return parseSuffix(ep, m[3] ?? "");
}

/* ------------------------------------------------------------------ */
/* the manifest                                                        */

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

async function readJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    // Missing and malformed collapse to the same answer: no manifest means no
    // duration and no direction, and the screen says so either way.
    return null;
  }
}

function tally(values: (string | null)[]): Tally[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** The last moment any line finishes. The episode's running time. */
function durationOf(lines: Record<string, unknown>[]): number | null {
  const ends = lines.map((l) => num(l.end_ms)).filter((n): n is number => n !== null);
  return ends.length ? Math.max(...ends) : null;
}

/**
 * Read the performance out of a manifest, and decide whether it is one.
 *
 * `recorded` wins whenever the episode file carries the flag, because that is
 * the director stating it about its own run. Otherwise the marks are the
 * evidence: variety across emotion, pace or intensity is something only a review
 * pass produces, and its absence is the flat case `director.py` warns about.
 */
function directionOf(
  manifest: unknown,
  flagged: boolean,
): Direction | null {
  const lines = (Array.isArray(asRecord(manifest).lines)
    ? (asRecord(manifest).lines as unknown[])
    : []
  ).map(asRecord);
  if (!lines.length) return null;

  const emotions = tally(lines.map((l) => str(l.emotion)));
  const paces = tally(lines.map((l) => str(l.pace)));
  const intensitySettings = new Set(
    lines.map((l) => num(l.intensity)).filter((n): n is number => n !== null),
  ).size;

  const varies =
    emotions.length > 1 || paces.length > 1 || intensitySettings > 1;

  return {
    directed: flagged || varies,
    basis: flagged ? "recorded" : varies ? "marks-vary" : "flat",
    lineCount: lines.length,
    emotions,
    paces,
    intensitySettings,
    voices: new Set(lines.map((l) => str(l.voice_id)).filter(Boolean)).size,
    speakers: new Set(lines.map((l) => str(l.speaker)).filter(Boolean)).size,
  };
}

/* ------------------------------------------------------------------ */
/* assembly                                                            */

const EMPTY = (storyId: string, ep: number): EpisodeAudio => ({
  storyId,
  ep,
  tracks: [],
  languages: [],
  comparison: null,
  direction: null,
  unplaced: 0,
});

/**
 * Everything produced as audio for one episode of one story.
 *
 * Never throws and never partially fails: a directory that will not list, a
 * manifest that will not parse and a season nobody has voiced all come back as
 * an empty result the caller renders as "nothing yet".
 */
export async function loadEpisodeAudio(
  storyId: string,
  ep: number,
): Promise<EpisodeAudio> {
  if (!safeSegment(storyId) || !Number.isFinite(ep)) return EMPTY(storyId, ep);

  const dir = audioDir(storyId);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return EMPTY(storyId, ep);
  }

  /* --- the mixes ------------------------------------------------- */

  let unplaced = 0;
  const mine: { name: string; parsed: Parsed }[] = [];
  const episodesPresent = new Set<number>();

  for (const name of names) {
    if (!name.toLowerCase().endsWith(".mp3")) continue;
    const lower = name.toLowerCase();
    if (lower === AB_AS_WRITTEN || lower === AB_RESHAPED) continue;

    const parsed = parse(name, MP3);
    if (!parsed) {
      unplaced += 1;
      continue;
    }
    episodesPresent.add(parsed.ep);
    if (parsed.ep === ep) mine.push({ name, parsed });
  }

  const sized = await Promise.all(
    mine.map(async ({ name, parsed }) => {
      try {
        const s = await fs.stat(path.join(dir, name));
        return { name, parsed, bytes: s.size };
      } catch {
        // Listed but not statable. Offering a player for a file we cannot
        // measure would hand the browser a 404 on click.
        return null;
      }
    }),
  );

  /* --- the manifests --------------------------------------------- */

  // One manifest per language, holding the line-by-line record of how the
  // episode was performed and when each line lands.
  const manifests = new Map<string, Record<string, unknown>[]>();
  for (const name of names) {
    const parsed = parse(name, MANIFEST);
    if (!parsed || parsed.ep !== ep) continue;
    const raw = asRecord(await readJson(path.join(dir, name)));
    const lines = Array.isArray(raw.lines) ? (raw.lines as unknown[]).map(asRecord) : [];
    if (lines.length) manifests.set(parsed.language, lines);
  }

  const tracks: AudioTrack[] = sized
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map(({ name, parsed, bytes }) => ({
      url: urlFor(storyId, name),
      language: parsed.language,
      soundEffects: parsed.soundEffects,
      bytes,
      durationMs: durationOf(manifests.get(parsed.language) ?? []),
    }))
    // Base language first, then plain before effects, so the default offered is
    // the one the season was written in.
    .sort(
      (a, b) =>
        Number(b.language === BASE_LANGUAGE) - Number(a.language === BASE_LANGUAGE) ||
        a.language.localeCompare(b.language) ||
        Number(a.soundEffects) - Number(b.soundEffects),
    );

  /* --- the director's A/B pair ------------------------------------ */

  const present = new Set(names.map((n) => n.toLowerCase()));
  const hasPair = present.has(AB_AS_WRITTEN) && present.has(AB_RESHAPED);
  // The pair carries no episode number, so it belongs to the directory rather
  // than to a numbered episode. It is attached only when the directory holds
  // audio for exactly one episode — otherwise this would be claiming the
  // comparison demonstrates an episode it may not have come from.
  const pairIsOurs = hasPair && episodesPresent.size === 1 && episodesPresent.has(ep);

  const original = names.find((n) => n.toLowerCase() === AB_AS_WRITTEN);
  const reshaped = names.find((n) => n.toLowerCase() === AB_RESHAPED);

  /* --- how it was performed --------------------------------------- */

  // Direction is a property of the episode, not of a mix, so it is read from
  // one manifest: the base language when there is one, otherwise whichever
  // language exists. The flag is the director's own, and outranks inference.
  const forDirection =
    manifests.get(BASE_LANGUAGE) ?? [...manifests.values()][0] ?? [];
  const flagged = await directedFlag(dir, ep);

  return {
    storyId,
    ep,
    tracks,
    languages: [...new Set(tracks.map((t) => t.language))],
    comparison:
      pairIsOurs && original && reshaped
        ? { asWritten: urlFor(storyId, original), reshaped: urlFor(storyId, reshaped) }
        : null,
    direction: forDirection.length
      ? directionOf({ lines: forDirection }, flagged)
      : null,
    unplaced,
  };
}

/**
 * The director's own mark on the episode file — `episode["directed"] = True`,
 * written by `director.py` when a review pass completes.
 *
 * Absent on everything committed today, because those episodes were voiced
 * before the flag existed. Read anyway: when it does appear it is the stage
 * speaking for itself, and inference should stand down in front of it.
 */
async function directedFlag(dir: string, ep: number): Promise<boolean> {
  const raw = await readJson(path.join(dir, `ep${String(ep).padStart(2, "0")}.json`));
  return asRecord(raw).directed === true;
}

