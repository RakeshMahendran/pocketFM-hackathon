"use server";

import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

import { revalidatePath } from "next/cache";

import { DATA_DIR } from "./data";
import { getEditor } from "./session";

const run = promisify(execFile);
const REPO = path.join(/* turbopackIgnore: true */ process.cwd(), "..");

/**
 * Publishing, and the check that stands in front of it.
 *
 * Unlike commissioning this is fast — grading a beat sheet is arithmetic, no
 * model call — so it runs synchronously and the reader gets an answer rather
 * than a progress page.
 *
 * The check is deliberately re-run by Python rather than reimplemented here.
 * `validate_output` is the definition of what a sound season is; a second
 * implementation in TypeScript would drift from it, and the drift would show up
 * as a season the console calls fine and the pipeline refuses.
 *
 * What is done here instead is translation. The checker writes for whoever
 * repairs the data — beat ids, field names, the two legal shapes of
 * `source_ref` — and nobody on the commissioning side has seen any of those
 * words. Every shape it can produce is said below as the thing it would tell an
 * editor, the same way the slate rewrites the loader's notes.
 */

/** One episode that has gone out, as `publish.json` recorded the decision. */
export interface EpisodeRelease {
  ep: number;
  /** Editor id, as `--by` wrote it. Null on a release recorded without one. */
  by: string | null;
  at: string | null;
}

/**
 * Two decisions, not one, because the platform earns per unlocked episode.
 *
 * `live` says the show exists for listeners at all; the episode fields say what
 * they can actually reach. A show live with nothing out is a real pre-launch
 * state, so `live: true` with an empty `episodes` is not a broken read.
 *
 * `live` / `by` / `at` keep their old meaning — they are the season decision,
 * not the newest episode one — because components already read them.
 */
export interface PublishState {
  live: boolean;
  by: string | null;
  at: string | null;
  /** Episodes written, counted off disk. Nothing to do with how many are out. */
  episodeCount: number;
  /** Every per-episode record on file, ascending. */
  episodes: EpisodeRelease[];
  /**
   * The last episode a listener can reach: the unbroken run from episode 1,
   * counted exactly as `released_through` counts it. A hole punched into the
   * file by hand reads as "out up to the hole" rather than offering an episode
   * nobody can get to.
   */
  releasedThrough: number;
  /**
   * The one episode `publish_episode` would accept next, or null when there is
   * none — not live, nothing written, or everything already out.
   *
   * This is an affordance, not a rule. Python decides what it will accept; this
   * only lets the screen avoid offering a button it knows would be refused.
   */
  nextRelease: number | null;
}

/**
 * What kind of fault a finding is.
 *
 * Only `contradiction` means two statements in the canon cannot both be true.
 * `bookkeeping` is a malformed record — a name that is not a character, a
 * moment that points at no source. Both block, and they block for different
 * reasons, so the screen must not call the second one the first: a producer
 * told the season contradicts itself concludes the writing is broken when the
 * data entry is. Same rule the validator panel keeps for `error` versus `warn`.
 */
export type FaultKind = "contradiction" | "bookkeeping" | "reading" | "unclassified";

export interface Finding {
  /** What the producer reads. Always populated. */
  said: string;
  /** The checker's own line. Rendered only when nothing could rewrite it. */
  raw: string;
  kind: FaultKind;
}

export interface Checks {
  /**
   * Null when the check ran to completion. Otherwise why it could not, in
   * words a producer can act on — and the panel refuses to publish on it. A
   * check that did not run has to read as a refusal rather than as a clean
   * season, or the guarantee is decorative exactly when the machine is broken.
   */
  unavailable: string | null;
  fatal: Finding[];
  advisory: Finding[];
}

const NOT_RUN =
  "The continuity check could not be run on this machine, so nothing is standing behind this season yet. Until it runs there is no result to trust, and an unanswered check is not a passed one.";

const NO_WORDS_FOR_IT =
  "The continuity check found something this screen has no plain words for yet. In its own words:";

/**
 * The seven generators in `validate_output`, said as an editor would hear them.
 *
 * `untraceable_beats`, `unknown_participants` and `contradictory_beats` are the
 * fatal three; `unstated_ignorance`, `present_but_unstated`, `thin_characters`
 * and `alleged_as_fact` are advisory. The empty beat sheet `validate_output`
 * appends itself is the eighth shape. Anything matching none of them is still
 * shown, under a lead-in saying so — a producer reading nothing is worse off
 * than a producer reading jargon.
 *
 * Beat ids are dropped rather than translated. `b014, b030` names nothing an
 * editor can look up, and the counts beside it carry the whole point.
 *
 * The separator is matched as ` \S+ ` rather than as a literal em dash. Python
 * logs to stderr in the console codepage on Windows, so the dash can arrive as
 * a replacement character; `PYTHONIOENCODING` below stops that at the source,
 * and matching by shape means a rewrite still fires if it ever comes back.
 */
const REWRITES: [RegExp, string, FaultKind][] = [
  [
    /^(\d+) different source_ref formats across (\d+) beats, none of them '.+?#<timeline_id>' or 'fictionalized': (.+), \.\.\.$/,
    "$2 moments do not say where they came from. Each one has to point at a line in the research or be marked as invented; instead there are $1 different labels, among them $3. Without it nobody can answer which parts of this really happened.",
    "bookkeeping",
  ],
  [
    /^source_ref '(.*)' on (\d+) beats \([^)]*\) is not '.+?#<timeline_id>' or 'fictionalized'(.*)$/,
    "$2 moments are filed under “$1”, which points at nothing: a moment has to name the line of research it came from, or be marked as invented.$3",
    "bookkeeping",
  ],
  [
    /^'(.+)' is a participant on (\d+) beats \([^)]*\) but is not a cast char_id$/,
    "“$1” is recorded as being in $2 scenes, but there is nobody by that name in the cast. Anything named in a scene becomes a character everywhere after this — with its own record of what it knows, offered as someone who could carry a spin-off.",
    "bookkeeping",
  ],
  [
    /^(\S+): \[(.+)\] are both witnessed_by and hidden_from \S+ knows and blind cannot both hold$/,
    "One scene records $2 as both having seen it and never finding out. Both cannot be true of the same person, and the spin-offs are generated from that record.",
    "contradiction",
  ],
  [
    /^the beat sheet is empty \S+ there is no canon to query$/,
    "Nothing that happens in this season has been recorded, so there is nothing to check and nothing a spin-off could be built from.",
    "bookkeeping",
  ],
  [
    /^(\S+) \(ep(.+?)\) asserts nobody's ignorance: hidden_from is empty and (\d+) of (\d+) cast members are not even present$/,
    "A moment in episode $2 records nobody as being kept in the dark by it, though $3 of the $4 characters are not even in the scene. Right for something that happens in public, a hole anywhere else — only reading it settles which.",
    "reading",
  ],
  [
    /^(\d+) of (\d+) beats leave someone standing in the scene with no stated knowledge of it \S+ present, but in neither witnessed_by nor hidden_from \(.*\)$/,
    "$1 of $2 moments put someone in the scene without saying whether they take it in. Anyone left like that counts as not knowing, which is how a spin-off lead ends up blind to their own scenes.",
    "reading",
  ],
  [
    /^(\d+) cast members appear in no beat at all \(([^)]*)\) \S+ nothing to promote, and the character panel would offer them anyway$/,
    "Cast with no scenes at all: $2. There is nothing there to build a spin-off from, and the character list would offer them anyway.",
    "reading",
  ],
  [
    /^(\d+) of (\d+) cast members have their status stated on fewer than half of (\d+) beats \S+ (.+)\. A spinoff lead needs this at zero unstated$/,
    "For $1 of $2 characters, whether they know a thing or not is recorded on fewer than half of the season’s $3 moments — $4. Any of them could be picked to carry a spin-off, and a lead needs it recorded everywhere.",
    "reading",
  ],
  [
    /^(\S+) is sourced to (\S+) \((alleged|disputed)\) \S+ hard rule 3 allows it only as something a character claims: "(.*)"$/,
    "A moment is drawn from something the record only has as $3, so it can reach the script as an accusation a character makes and never as something the show states: “$4”",
    "reading",
  ],
];

/**
 * Second pass. The repair hints `untraceable_beats` tacks onto a sentence, and
 * the counts it writes in passing, are their own small phrases rather than
 * whole messages — so they are rewritten after the sentence they hang off.
 */
const TIDY: [RegExp, string][] = [
  [
    /\. Timeline entry '(.+?)' exists; write it as '.+?'/,
    " The research does have a line called “$1”; this points at it wrongly.",
  ],
  [
    /\. Right entry, wrong event id: this dossier is '.+?'/,
    " It names the right line of research, but under the wrong story.",
  ],
  [
    /\. Invention is marked with the literal 'fictionalized'/,
    " It looks like invention that was marked in the wrong words.",
  ],
  // `(missing)` is the checker's stand-in for an empty field, not a label
  // anybody typed, so it is not quoted back as though it were one.
  [
    /filed under “\(missing\)”, which points at nothing: a/,
    "filed under nothing at all. A",
  ],
  [/\((\d+) unstated\)/g, "($1 unrecorded)"],
  // The checker writes "1 beats" throughout; a screen an editor reads cannot.
  [/\bin 1 scenes\b/, "in one scene"],
  [/^1 moments are filed under/, "One moment is filed under"],
  [/^1 of (\d+) moments put someone/, "One of $1 moments puts someone"],
  [/\b1 of the (\d+) characters are not\b/, "1 of the $1 characters is not"],
];

/** One checker line, said plainly. Never drops it — the worst case is verbatim. */
function plainly(raw: string): Finding {
  for (const [pattern, says, kind] of REWRITES) {
    if (!pattern.test(raw)) continue;
    let said = raw.replace(pattern, says);
    for (const [from, to] of TIDY) said = said.replace(from, to);
    return { said, raw, kind };
  }
  return { said: NO_WORDS_FOR_IT, raw, kind: "unclassified" };
}

/**
 * The checker's own last line: `story: N fatal, M advisory`.
 *
 * It is the only proof the check actually ran. Nothing else distinguishes a
 * clean season from a Python that could not be started, a season directory that
 * does not exist, or a run killed by the timeout — all three produce no ERROR
 * and no WARN lines, which read as a pass.
 */
const SUMMARY = /INFO\s+.*: (\d+) fatal, (\d+) advisory/;

/**
 * `^ep(\d+)\.md$`, deliberately case-sensitive.
 *
 * `episode_count` in src/publish.py matches exactly this, and the count is what
 * Python compares an episode number against before it will release one. A
 * looser pattern here would offer an episode 15 that the backend then refuses,
 * which is the one thing the disabled-control rule is meant to avoid. Note this
 * is stricter than `serials.ts`, which matches case-insensitively.
 */
const EP_FILE = /^ep(\d+)\.md$/;

/**
 * Counted off disk only when the caller has no count already.
 *
 * A page rendering a season has loaded it, and `Serial.episodeCount` is the
 * same number; passing it in spends one fewer directory read per render. The
 * fallback exists so this function is still correct when called on its own —
 * `serials.ts` is not editable from here and exports no cheap counter.
 */
async function countEpisodes(storyId: string): Promise<number> {
  try {
    const names = await fs.readdir(
      path.join(DATA_DIR, "stories", storyId, "episodes"),
    );
    return names.filter((n) => EP_FILE.test(n)).length;
  } catch {
    // No `episodes/` at all: planned, never written. Zero, not an error.
    return 0;
  }
}

/**
 * The `episodes` map, read the way `released()` reads it.
 *
 * Absent entirely on every file written before episodes had their own state, so
 * a missing key is "none out" rather than a fault. A key that is not an episode
 * number is somebody's hand edit and is skipped alone — losing every recorded
 * decision to one bad key is the worse failure.
 */
function releases(raw: unknown): EpisodeRelease[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: EpisodeRelease[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const ep = Number(key);
    if (!Number.isInteger(ep) || ep < 1) continue;
    const r =
      value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    out.push({
      ep,
      by: typeof r.by === "string" ? r.by : null,
      at: typeof r.at === "string" ? r.at : null,
    });
  }
  return out.sort((a, b) => a.ep - b.ep);
}

/** The unbroken run from episode 1. Mirrors `released_through`. */
function unbrokenRun(eps: EpisodeRelease[]): number {
  const out = new Set(eps.map((e) => e.ep));
  let n = 0;
  while (out.has(n + 1)) n += 1;
  return n;
}

/**
 * `episodeCount` is optional: pass `Serial.episodeCount` where the season is
 * already loaded, and this reads one file instead of a file and a directory.
 */
export async function readPublishState(
  storyId: string,
  episodeCount?: number,
): Promise<PublishState> {
  const total =
    typeof episodeCount === "number" && Number.isFinite(episodeCount) && episodeCount >= 0
      ? Math.floor(episodeCount)
      : await countEpisodes(storyId);

  // A season is a draft until somebody says so, and a draft has nothing out
  // whatever is written. Also where an unreadable file lands: a state file that
  // will not parse must not read as a live show.
  const draft: PublishState = {
    live: false,
    by: null,
    at: null,
    episodeCount: total,
    episodes: [],
    releasedThrough: 0,
    nextRelease: null,
  };

  let r: Record<string, unknown>;
  try {
    const raw = JSON.parse(
      await fs.readFile(
        path.join(DATA_DIR, "stories", storyId, "publish.json"),
        "utf-8",
      ),
    );
    r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    return draft;
  }

  if (r.state !== "live") return draft;

  const episodes = releases(r.episodes);
  const releasedThrough = unbrokenRun(episodes);

  return {
    live: true,
    by: typeof r.by === "string" ? r.by : null,
    at: typeof r.at === "string" ? r.at : null,
    episodeCount: total,
    episodes,
    releasedThrough,
    // Episodes go out in order, so there is only ever one candidate. Null once
    // the season is fully out, and null when nothing is written to release.
    nextRelease: releasedThrough < total ? releasedThrough + 1 : null,
  };
}

/** Reads the checker's log. Exit code 1 means fatal problems, not a crash. */
export async function readChecks(storyId: string): Promise<Checks> {
  let output = "";
  try {
    const { stdout, stderr } = await run(
      "python",
      ["-m", "src.publish", "--story", storyId, "--check"],
      {
        cwd: REPO,
        timeout: 30_000,
        // The checker writes em dashes. Without this Python encodes stderr in
        // the console codepage on Windows and Node decodes it as UTF-8, so
        // every dash reaches the screen as a replacement character.
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      },
    );
    output = `${stdout}\n${stderr}`;
  } catch (err) {
    // A rejection is the ordinary case: exit 1 means fatal problems were found
    // and the log is on stderr. It is also what an unresolvable `python` looks
    // like — and promisified execFile attaches empty strings rather than
    // nothing for ENOENT, so a failure to start cannot be told apart here. The
    // summary line below is what tells them apart.
    const e = err as { stdout?: string; stderr?: string };
    output = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
  }

  const summary = output.match(SUMMARY);
  if (!summary) return { unavailable: NOT_RUN, fatal: [], advisory: [] };

  const fatal: Finding[] = [];
  const advisory: Finding[] = [];
  for (const line of output.split(/\r?\n/)) {
    const isFatal = line.match(/ERROR\s+FATAL\s+(.+)$/);
    if (isFatal) fatal.push(plainly(isFatal[1].trim()));
    const isAdvisory = line.match(/WARN\s+advisory\s+(.+)$/);
    if (isAdvisory) advisory.push(plainly(isAdvisory[1].trim()));
  }

  // The checker counts its own findings. If fewer lines were scraped than it
  // says it wrote, the difference is said rather than lost — a count that
  // quietly shrinks on the way to the screen is the same failure as a check
  // that quietly passes.
  const short = Number(summary[1]) - fatal.length;
  if (short > 0) {
    fatal.push({
      said: `The check reported ${short} further problem${short === 1 ? "" : "s"} that this screen could not read. Treat the season as unsound until someone has looked at the check itself.`,
      raw: "",
      kind: "unclassified",
    });
  }

  return { unavailable: null, fatal, advisory };
}

/**
 * Every screen a release decision moves.
 *
 * The episode pages are refreshed by route pattern rather than one literal
 * path, because no release decision touches a single episode: pulling episode 3
 * pulls everything after it, and taking the season back to draft pulls all of
 * them. Refreshing only the episode named on the form would leave the tail
 * showing itself as out.
 */
function revalidateSeason(storyId: string): void {
  revalidatePath(`/serials/${storyId}`);
  revalidatePath("/serials");
  revalidatePath("/serials/[id]/[ep]", "page");
}

/** The `ep` field off a form, or null if it is not an episode number. */
function episodeArg(formData: FormData): number | null {
  const n = Number(String(formData.get("ep") ?? "").trim());
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export async function publishSeason(formData: FormData): Promise<void> {
  const storyId = String(formData.get("storyId") ?? "").trim();
  if (!storyId) return;

  const editor = await getEditor();
  const args = ["-m", "src.publish", "--story", storyId];
  if (editor) args.push("--by", editor.id);

  try {
    await run("python", args, { cwd: REPO, timeout: 60_000 });
  } catch {
    // A refusal is not an error page. The screen already shows the same checks
    // this would report, so re-rendering says why on its own. `publish()`
    // re-runs them before it writes, so a request that arrives without the
    // button being shown is refused there rather than trusted here.
  }
  revalidateSeason(storyId);
}

export async function unpublishSeason(formData: FormData): Promise<void> {
  const storyId = String(formData.get("storyId") ?? "").trim();
  if (!storyId) return;
  try {
    await run("python", ["-m", "src.publish", "--story", storyId, "--unpublish"], {
      cwd: REPO,
      timeout: 30_000,
    });
  } catch {
    // Pulling something back is never gated, so a failure here is a broken
    // install rather than a refusal. The state file is the truth either way.
  }
  revalidateSeason(storyId);
}

/**
 * Put one episode in front of listeners.
 *
 * Same timeout as the season: `publish_episode` re-runs the season's fatal
 * checks on every release, not only the first, so this is as slow as the first
 * publish and for the same reason.
 *
 * Three things can refuse it — the show is not live, the episode before it is
 * not out, the season's checks now fail — and all three are refused in Python.
 * None of them is decided again here. The screen re-renders against the state
 * file and the checks afterwards, which is what says why.
 */
export async function publishEpisode(formData: FormData): Promise<void> {
  const storyId = String(formData.get("storyId") ?? "").trim();
  const ep = episodeArg(formData);
  if (!storyId || ep === null) return;

  const editor = await getEditor();
  const args = [
    "-m",
    "src.publish",
    "--story",
    storyId,
    "--episode",
    String(ep),
  ];
  if (editor) args.push("--by", editor.id);

  try {
    await run("python", args, { cwd: REPO, timeout: 60_000 });
  } catch {
    // Refusals arrive here as exit 1. Not an error page, for the same reason
    // publishSeason's are not: the next render reads the state file and the
    // checks, and says what actually stands in the way.
  }
  revalidateSeason(storyId);
}

/**
 * Pull one episode, and with it every episode after it.
 *
 * The tail comes too — that is `unpublish_episode`'s rule, not this one's, and
 * it is why the screen must say so before the click rather than reimplement it
 * after. Pulling is never gated, so a failure here is a broken install.
 */
export async function unpublishEpisode(formData: FormData): Promise<void> {
  const storyId = String(formData.get("storyId") ?? "").trim();
  const ep = episodeArg(formData);
  if (!storyId || ep === null) return;

  try {
    await run(
      "python",
      ["-m", "src.publish", "--story", storyId, "--episode", String(ep), "--unpublish"],
      { cwd: REPO, timeout: 30_000 },
    );
  } catch {
    // Nothing gates a pull, so the state file is the truth either way.
  }
  revalidateSeason(storyId);
}
