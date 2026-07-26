"use server";

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

import { redirect } from "next/navigation";

import { DATA_DIR } from "./data";

/**
 * Giving one character their own episode, from the console.
 *
 * This is the click the product is sold on: a name in a finished season,
 * pressed, and an episode written for them that provably cannot contradict the
 * season it came from. `src/spinoff_run.py` does the work in three stages —
 * work the character up, write the episode, check it — and writes its progress
 * to `data/spinoff_runs/<story>__<char>.json` after every one.
 *
 * The shape is `commission.ts`'s, deliberately and to the letter: a detached
 * process, a status file, a page that watches it. Both jobs are a dozen paid
 * model calls over several minutes, and a second mechanism for the same problem
 * is a second mechanism to keep working on the morning of a demo.
 *
 * Nothing here throws. A missing file, a half-written one, a machine with no
 * Python — each comes back as a null or a recorded failure, because a console
 * that 500s in front of a producer is worse than one that says what is missing.
 */

const REPO = path.join(/* turbopackIgnore: true */ process.cwd(), "..");

const RUN_DIR = "spinoff_runs";

export type SpinoffRunState = "running" | "done" | "failed";

export interface SpinoffRunStatus {
  storyId: string;
  charId: string;
  state: SpinoffRunState;
  /**
   * `promoting` / `writing` / `checking` / `done`, and `starting` for a run that
   * never reached Python. Left as a string rather than a union so a stage added
   * on the other side arrives as an unrecognised step — which the screen renders
   * as "not yet" — instead of being coerced into one it is not.
   */
  step: string | null;
  /** The run's own words for the step. Kept, but never the only thing shown. */
  label: string | null;
  /** The mainline moment the episode is built on. Null means the default one. */
  anchor: string | null;
  /**
   * True when a bible already existed and the expensive call was not repeated.
   * It must read as work already paid for, never as a stage that failed.
   */
  promotionSkipped: boolean;
  error: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
}

/* ------------------------------------------------------------------ */
/* helpers — local copies, as in `spinoffs.ts`, rather than reaching    */
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
 * Not a second copy of any gate. Whether a character can carry a show is
 * `promotable`, and whether a run may proceed is Python's — this only refuses
 * to build a path out of a string that cannot name one. The rule is `_key()`'s,
 * including the ban on `__`, so this looks for exactly the file Python would
 * write and never for a neighbouring run's.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function usableId(value: string): boolean {
  return SAFE_ID.test(value) && !value.includes("__");
}

function statusFile(storyId: string, charId: string): string {
  return path.join(DATA_DIR, RUN_DIR, `${storyId}__${charId}.json`);
}

/* ------------------------------------------------------------------ */
/* reading                                                             */

/** The run for one character, or null if nobody has ever started one. */
export async function readSpinoffRun(
  storyId: string,
  charId: string,
): Promise<SpinoffRunStatus | null> {
  if (!usableId(storyId) || !usableId(charId)) return null;

  let raw: string;
  try {
    raw = await fs.readFile(statusFile(storyId, charId), "utf-8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Caught mid-write. Not an error — the next poll gets a whole file.
    return null;
  }

  const r = asRecord(parsed);
  const state = str(r.state);

  return {
    storyId,
    charId,
    // Anything unrecognised is treated as still going, which is the reading
    // that keeps the page watching rather than declaring an answer it lacks.
    state: state === "done" || state === "failed" ? state : "running",
    step: str(r.step),
    label: str(r.label),
    anchor: str(r.anchor),
    promotionSkipped: r.promotion_skipped === true,
    error: str(r.error),
    startedAt: str(r.started_at),
    updatedAt: str(r.updated_at),
    finishedAt: str(r.finished_at),
  };
}

/**
 * The runs for a whole roster, in the order the ids were given.
 *
 * One small file per character and a season has a few dozen, so this is a
 * handful of reads — cheap enough to do on every render, which is what keeps a
 * row from offering to start a run that is already going.
 */
export async function readSpinoffRuns(
  storyId: string,
  charIds: string[],
): Promise<(SpinoffRunStatus | null)[]> {
  return Promise.all(charIds.map((id) => readSpinoffRun(storyId, id)));
}

/**
 * Whether the pipeline on this machine replays from cache instead of calling
 * the model. It changes what the button is about to cost, so the screen has to
 * be able to say which one it is offering.
 *
 * Read here rather than in each page so both screens answer it the same way,
 * and `async` because everything exported from a `"use server"` file must be.
 */
export async function spinoffRunIsOffline(): Promise<boolean> {
  const raw = process.env.OFFLINE ?? "0";
  return !["0", "", "false", "False"].includes(raw);
}

/* ------------------------------------------------------------------ */
/* starting                                                            */

/**
 * Record a run that never got as far as Python.
 *
 * Written in the shape `write_status()` uses, because the screen reading it
 * does not know or care which side wrote it — `state: "failed"` with an `error`
 * is already how a run that died halfway is shown. `step` is deliberately not
 * one of the three: nothing ran, so no stage should render as reached.
 */
async function recordStartFailure(
  storyId: string,
  charId: string,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const file = statusFile(storyId, charId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify(
        {
          story_id: storyId,
          char_id: charId,
          state: "failed",
          step: "starting",
          label: "Could not start",
          anchor: null,
          promotion_skipped: false,
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
 * Start the three stages, and go to the page that watches them.
 *
 * `detached` plus `unref` means the run outlives the request that started it.
 * The `'error'` listener is not optional: `spawn` reports a `python` it cannot
 * resolve asynchronously, and an `'error'` with no listener is rethrown by the
 * emitter with nothing above it to catch — the console would go down seconds
 * after somebody pressed the button. Waiting for exactly one of `'spawn'` or
 * `'error'` also means the failure is on disk before the redirect, so the
 * character page shows what happened instead of "nothing started".
 */
export async function startSpinoffRun(formData: FormData): Promise<void> {
  const storyId = String(formData.get("storyId") ?? "").trim();
  const charId = String(formData.get("charId") ?? "").trim();

  if (!storyId || !usableId(storyId)) redirect("/serials");
  const castHref = `/serials/${encodeURIComponent(storyId)}/cast`;
  // An id this shape cannot name a run file, so there is nowhere to record a
  // failure and nothing to explain to it: the only way to get here is a
  // hand-made POST, since every id on screen comes from the roster.
  if (!charId || !usableId(charId)) redirect(castHref);

  const existing = await readSpinoffRun(storyId, charId);
  // Already going: watch it rather than starting a second one over the top of
  // the same files.
  if (existing?.state !== "running") {
    const child = spawn(
      "python",
      ["-m", "src.spinoff_run", "--story", storyId, "--char", charId],
      { cwd: REPO, detached: true, stdio: "ignore", windowsHide: true },
    );
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
          charId,
          err.code === "ENOENT"
            ? "The machine running this console could not start the writer — it has no Python on its path. Nothing was written for this character. Whoever set this box up needs to look at it; pressing the button again will do the same thing."
            : `The writer could not be started: ${err.message}. Nothing was written for this character.`,
        );
        settled();
      });
    });
  }

  redirect(`${castHref}/${encodeURIComponent(charId)}`);
}
