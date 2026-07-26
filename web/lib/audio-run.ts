"use server";

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

import { redirect } from "next/navigation";

import { DATA_DIR } from "./data";

/**
 * Recording one episode, from the console.
 *
 * The console could already commission a season and give a side character their
 * own episode. Recording was the one stage of the pipeline with no control at
 * all — it lived at a terminal — so five of the seven seasons on disk showed
 * "Not recorded yet" and offered the reader nothing to do about it.
 *
 * `src/audio_run.py` does the work in three stages and writes its progress to
 * `data/audio_runs/<story>__ep<NN>.json` as it goes. The shape here is
 * `spinoff-run.ts`'s, deliberately and to the letter: a detached process, a
 * status file, a page that watches it. All three jobs are minutes of paid work
 * behind one click, and a second mechanism for the same problem is a second
 * mechanism to keep working on the morning of a demo.
 *
 * Nothing here throws. A missing file, a half-written one, a machine with no
 * Python — each comes back as a null or a recorded failure, because a console
 * that 500s in front of a producer is worse than one that says what is missing.
 */

const REPO = path.join(/* turbopackIgnore: true */ process.cwd(), "..");

/**
 * Is this episode already recorded?
 *
 * The filename stem is the dossier's `event_id`, not the story directory, so the
 * only reliable part is the `_epNN` tail — `evt_kadamballi_2022_ep01.mp3` and
 * its `_sfx` and `_hi-en` variants all carry it. Matches `recordings()` in
 * `src/audio_run.py`, which is what actually decides whether a replay can run.
 *
 * False is the safe answer: it records, which is what it did before.
 */
async function hasRecording(storyId: string, ep: number): Promise<boolean> {
  const tail = `_ep${String(ep).padStart(2, "0")}`;
  try {
    const names = await fs.readdir(
      path.join(DATA_DIR, "stories", storyId, "audio"),
    );
    return names.some((n) => {
      if (!n.endsWith(".mp3")) return false;
      const stem = n.slice(0, -".mp3".length);
      return stem.endsWith(tail) || stem.includes(`${tail}_`);
    });
  } catch {
    return false;
  }
}

const RUN_DIR = "audio_runs";

export type AudioRunState = "running" | "done" | "failed";

export interface AudioRunStatus {
  storyId: string;
  ep: number;
  state: AudioRunState;
  /**
   * `converting` / `voicing` / `mastering` / `done`, and `starting` for a run
   * that never reached Python. Left as a string rather than a union so a stage
   * added on the other side arrives as an unrecognised step — which the screen
   * renders as "not yet" — instead of being coerced into one it is not.
   */
  step: string | null;
  /** The run's own words for the stage. Kept, but never the only thing shown. */
  label: string | null;
  /** The language asked for. Null means the season's own. Never rendered raw. */
  language: string | null;
  /**
   * The last line the build itself logged, so a run that stalls shows where
   * rather than only spinning. Written for whoever maintains the pipeline, so
   * `buildSaid()` in `components/audioWords.ts` is what makes it fit to read.
   */
  detail: string | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
}

/* ------------------------------------------------------------------ */
/* helpers — local copies, as in `spinoff-run.ts`, rather than reaching  */
/* into a module another track owns                                    */

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Whether an id can name a run file at all.
 *
 * The rule is `_key()`'s in `src/audio_run.py`, including the ban on `__`, so
 * this looks for exactly the file Python would write and never for a
 * neighbouring run's. Not a second copy of any gate: whether a season can be
 * recorded is the build's business, this only refuses to make a path out of a
 * string that cannot name one.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function usableId(value: string): boolean {
  return SAFE_ID.test(value) && !value.includes("__");
}

function usableEp(ep: number): boolean {
  return Number.isInteger(ep) && ep >= 1 && ep < 1000;
}

/**
 * The five `src/audio/build.py` accepts.
 *
 * Kept here rather than imported from `components/audioWords.ts` on purpose:
 * what a form is allowed to send ends up as an argument to a paid process, and
 * that is a question for the module that spawns it, not for the one that decides
 * how to spell a language on screen.
 */
const LANGUAGES = new Set(["en", "hi-en", "hi", "ta", "ta-en"]);

/** `<story>__ep<NN>.json`, episode zero-padded to two, as Python writes it. */
function statusFile(storyId: string, ep: number): string {
  return path.join(
    DATA_DIR,
    RUN_DIR,
    `${storyId}__ep${String(ep).padStart(2, "0")}.json`,
  );
}

/* ------------------------------------------------------------------ */
/* reading                                                             */

/** The run for one episode, or null if nobody has ever started one. */
export async function readAudioRun(
  storyId: string,
  ep: number,
): Promise<AudioRunStatus | null> {
  if (!usableId(storyId) || !usableEp(ep)) return null;

  let raw: string;
  try {
    raw = await fs.readFile(statusFile(storyId, ep), "utf-8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Caught mid-write. Not an error — the next refresh gets a whole file.
    return null;
  }

  const r = asRecord(parsed);
  const state = str(r.state);
  const language = str(r.language);

  return {
    storyId,
    ep,
    // Anything unrecognised is treated as still going, which is the reading
    // that keeps the page watching rather than declaring an answer it lacks.
    state: state === "done" || state === "failed" ? state : "running",
    step: str(r.step),
    label: str(r.label),
    // A language the pipeline does not know cannot be named on screen, and a
    // raw token must never reach it, so it is dropped rather than passed on.
    language: language && LANGUAGES.has(language) ? language : null,
    detail: str(r.detail),
    error: str(r.error),
    startedAt: str(r.started_at),
    updatedAt: str(r.updated_at),
    finishedAt: str(r.finished_at),
  };
}

/**
 * Whether the pipeline on this machine replays from `data/cache/voice/` instead
 * of calling the provider. It changes what the button is about to cost, so the
 * screen has to be able to say which one it is offering.
 *
 * Read here rather than in the component so it is answered the same way
 * wherever the control appears, and `async` because everything exported from a
 * `"use server"` file must be.
 */
export async function audioRunIsOffline(): Promise<boolean> {
  const raw = process.env.OFFLINE ?? "0";
  return !["0", "", "false", "False"].includes(raw);
}

/* ------------------------------------------------------------------ */
/* starting                                                            */

/**
 * Record a run that never got as far as Python.
 *
 * Written in the shape `write_status()` uses, because the screen reading it does
 * not know or care which side wrote it — `state: "failed"` with an `error` is
 * already how a run that died halfway is shown. `step` is deliberately not one
 * of the three: nothing ran, so no stage should render as reached.
 */
/**
 * Claim the run before the process is asked for.
 *
 * Written by this module rather than by Python, because the whole point is to
 * exist during the seconds before Python can write anything. `run()` merges its
 * own fields over this file on its first status write, so the handover is a
 * normal update rather than a special case.
 */
async function recordStarting(
  storyId: string,
  ep: number,
  language: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const file = statusFile(storyId, ep);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify(
        {
          story_id: storyId,
          ep,
          state: "running",
          step: "converting",
          label: "Reading the script and deciding the performance",
          language,
          detail: null,
          error: null,
          started_at: now,
          updated_at: now,
          finished_at: null,
        },
        null,
        2,
      ),
      "utf-8",
    );
  } catch {
    // A status we could not write is not a reason to refuse the recording. The
    // screen falls back to its pre-run state, which is only wrong until Python
    // writes its own.
  }
}

async function recordStartFailure(
  storyId: string,
  ep: number,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const file = statusFile(storyId, ep);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify(
        {
          story_id: storyId,
          ep,
          state: "failed",
          step: "starting",
          label: "Could not start",
          language: null,
          detail: null,
          error: reason,
          started_at: now,
          updated_at: now,
          finished_at: now,
        },
        null,
        2,
      ),
      "utf-8",
    );
  } catch {
    // A machine that cannot start Python may also be one that cannot write
    // here. The screen falls back to "nothing started", which is at least true.
  }
}

/**
 * Start the three stages, and come back to the episode that is being recorded.
 *
 * `detached` plus `unref` means the run outlives the request that started it.
 * The `'error'` listener is not optional: `spawn` reports a `python` it cannot
 * resolve asynchronously, and an `'error'` with no listener is rethrown by the
 * emitter with nothing above it to catch — the console would go down seconds
 * after somebody pressed the button. Waiting for exactly one of `'spawn'` or
 * `'error'` also means the failure is on disk before the redirect, so the
 * episode page shows what happened instead of "nothing started".
 */
export async function startAudioRun(formData: FormData): Promise<void> {
  const storyId = String(formData.get("storyId") ?? "").trim();
  const ep = Number(String(formData.get("ep") ?? "").trim());
  const asked = String(formData.get("language") ?? "").trim();

  // An id this shape cannot name a run file, so there is nowhere to record a
  // failure and nothing to explain it to: the only way to get here is a
  // hand-made POST, since every id on screen comes from a season on disk.
  if (!storyId || !usableId(storyId)) redirect("/serials");
  const seasonHref = `/serials/${encodeURIComponent(storyId)}`;
  if (!usableEp(ep)) redirect(seasonHref);

  // Anything but the five is dropped rather than refused. The season's own
  // language is what the build uses when none is given, so a missing or
  // unrecognised choice lands on the right answer instead of a dead end.
  const language = LANGUAGES.has(asked) ? asked : null;

  const existing = await readAudioRun(storyId, ep);
  // Already recording: watch it rather than starting a second one writing over
  // the same files.
  if (existing?.state !== "running") {
    const argv = ["-m", "src.audio_run", "--story", storyId, "--ep", String(ep)];
    if (language) argv.push("--language", language);

    /*
     * A recording already on disk is replayed, not synthesised again.
     *
     * Every press ran the full studio — minutes of synthesis and real credits
     * to arrive at an mp3 that was already sitting there. `--replay` walks the
     * same three stages against it and generates nothing.
     *
     * Only when there is something to replay: with no recording, `--replay`
     * refuses rather than miming progress over nothing, so the flag is never
     * passed on a genuine first take.
     */
    if (await hasRecording(storyId, ep)) argv.push("--replay");

    // Claimed before the spawn, not after it.
    //
    // `'spawn'` fires the moment the process exists, but Python then has to
    // import its way to the first write — a second or two. The redirect landed
    // inside that gap, found no status, and rendered "Not recorded yet" with
    // the button again, so the obvious thing to do was press it a second time.
    // Python overwrites this record as soon as it has one of its own.
    await recordStarting(storyId, ep, language);

    const child = spawn("python", argv, {
      cwd: REPO,
      // `detached` on Windows means CREATE_NEW_CONSOLE, and `windowsHide` does
      // not apply to it — so every press threw a console window in the user's
      // face. Detaching is what lets the run outlive the request on POSIX;
      // `unref` alone does that here, and the dev server outlives the run
      // anyway.
      detached: process.platform !== "win32",
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    let running = false;
    await new Promise<void>((settled) => {
      child.once("spawn", () => {
        running = true;
        settled();
      });
      child.once("error", async (err: NodeJS.ErrnoException) => {
        // The listener stays armed after a successful spawn, since an 'error'
        // can still arrive later — but by then Python owns the status file and
        // overwriting it would report a live run as dead.
        if (running) return;
        await recordStartFailure(
          storyId,
          ep,
          err.code === "ENOENT"
            ? "The machine running this console could not start the studio — it has no Python on its path. Nothing was recorded. Whoever set this box up needs to look at it; pressing the button again will do the same thing."
            : `The studio could not be started: ${err.message}. Nothing was recorded.`,
        );
        settled();
      });
    });
  }

  redirect(`${seasonHref}/${ep}`);
}
