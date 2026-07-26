/**
 * ===========================================================================
 * TEMPORARY HOME — every string in this file belongs in `lib/words.ts`.
 * ===========================================================================
 *
 * `words.ts` is the single source of truth for what the console says, and it is
 * being edited by another track right now. Rather than reach into a file
 * somebody else has open, the wording for *starting* a spin-off sits here,
 * written to the same rules, so moving it later is one cut and one import
 * change. `components/audioWords.ts` does exactly this for the audio half.
 *
 * Everything `words.ts` already says is imported rather than restated: the
 * three steps borrow their meaning from `PROMOTION.plain`,
 * `WRITING_MODE.constrained.plain` and `CHECKER_EXPLAINED`, which are the
 * sentences the rest of the console already uses for those three ideas.
 *
 * The rules it is written to, from `words.ts` itself:
 *
 *  - The reader is a commissioning editor, not an engineer. No step key, no
 *    character id, no filename reaches the surface — `promoting`, `writing`,
 *    `checking` and `story1_denied_identity__ratnamma.json` all stay in
 *    `lib/spinoff-run.ts`, where precision matters, and are translated here.
 *  - What a button is about to spend has to be readable before it is pressed.
 *    This one is minutes of real model calls, so it says so — unless the
 *    machine is replaying from what has already been generated, in which case
 *    saying so would be false and would teach a producer to ignore the warning.
 */

import {
  CHECKER_EXPLAINED,
  PROMOTION,
  WRITING_MODE,
  episodeCount,
} from "@/lib/words";

// ---------------------------------------------------------------------------
// THE THREE STEPS
//
// `src/spinoff_run.py` reports its own label for the step it is on, and those
// labels are already plain English. They are restated here because the screen
// shows all three at once — the two not running have no label coming from
// anywhere — and a list where one row is worded by the backend and two by the
// console would read as three different voices.
// ---------------------------------------------------------------------------

export interface RunStep {
  /** Matches the `step` the run writes. Never rendered. */
  key: string;
  label: string;
  /** What that step means, for whoever is watching it happen. */
  means: string;
}

export const RUN_STEPS: RunStep[] = [
  {
    key: "promoting",
    label: "Working the character up",
    means: PROMOTION.plain,
  },
  {
    key: "writing",
    label: "Writing their episode",
    means: WRITING_MODE.constrained.plain,
  },
  {
    key: "checking",
    label: "Checking it against the main show",
    means: CHECKER_EXPLAINED,
  },
];

/** Against the step being worked on right now. */
export const STEP_UNDER_WAY = "under way";

/** Against the step a failed run got as far as. */
export const STEP_STOPPED = "stopped here";

/**
 * Against a first step that was skipped because a bible already existed.
 * `promotion_skipped` must read as work already paid for, never as a stage that
 * fell over, so it borrows the roster's existing words for the same fact.
 */
export const STEP_ALREADY_DONE = PROMOTION.done;

// ---------------------------------------------------------------------------
// BEFORE IT IS PRESSED
// ---------------------------------------------------------------------------

/** Between the click and the page it lands on. Starting is quick; the run is not. */
export const STARTING = "Starting…";

/** The button on a character's own page. */
export function startAction(o: { hasBible: boolean; written: number }): string {
  if (o.written > 0) return "Write it again";
  return o.hasBible
    ? "Write their episode"
    : `${PROMOTION.action} and write their episode`;
}

/** The button on a roster row, where there is no space for a sentence. */
export function rowAction(hasBible: boolean): string {
  return hasBible ? "Write their episode" : "Work them up and write their episode";
}

/**
 * What the button is about to do, said before it is pressed.
 *
 * Two things a producer needs and cannot see: that this is minutes rather than
 * a page load, and that a character already worked up is not worked up twice.
 */
export function whatItWillDo(o: {
  hasBible: boolean;
  written: number;
  offline: boolean;
}): string {
  const work =
    o.written > 0
      ? "It starts from the same moment in the main show as the episode already below, so it replaces that one rather than adding another."
      : o.hasBible
        ? "Their episode gets written from what they saw, then checked against the main show."
        : "This reads back everything they were there for, writes their first episode from it, then checks that episode against the main show.";

  // Additive, not a third alternative. A character with an episode already
  // written necessarily has a bible too, and the old branching meant exactly
  // those characters — the ones on the demo path — were told it "costs real
  // money" with no mention that the expensive pass is skipped. Overstating a
  // cost is a smaller sin than understating one, but it is still wrong, and it
  // hides the saving the pipeline was built to make.
  const spared = o.hasBible
    ? " They have already been worked up, so that pass is not paid for a second time."
    : "";

  return `${work}${spared} ${o.offline ? COSTS_NOTHING : COSTS_MONEY}`;
}

/** The honest version on a machine wired to the model. */
export const COSTS_MONEY =
  "It takes a few minutes and costs real money to run. You can leave the page while it works — nothing is lost if you close it.";

/** The honest version on a machine replaying what has already been generated. */
export const COSTS_NOTHING =
  "This machine replays work that has already been generated rather than calling the model, so it costs nothing and comes back almost at once.";

/** Said once above a roster, since twenty rows cannot each carry a sentence. */
export function rosterCost(offline: boolean): string {
  return `Starting one of these reads back everything that character was there for, writes their first episode from it, and checks that episode against the main show. ${
    offline ? COSTS_NOTHING : COSTS_MONEY
  }`;
}

// ---------------------------------------------------------------------------
// WHILE IT RUNS, AND AFTER
// ---------------------------------------------------------------------------

export const RUN_HEADING = {
  running: "Being written now",
  failed: "It stopped part-way",
  done: "Written and checked",
};

/** Why the screen is moving on its own. Same promise the season page makes. */
export const RUN_UNDER_WAY =
  "This takes a few minutes. The page keeps itself up to date, so you can leave it open or come back later — nothing is lost if you close it.";

export const RUN_DONE =
  "Their episode is written, and the continuity check has been run over it. It is below.";

export const WHAT_WENT_WRONG = "What went wrong";

/**
 * The reassurance that has to come with any failure here: a spin-off writes
 * `branch_canon` and nothing else, so a run that fell over cannot have moved a
 * word of the season it was written against.
 */
export const RUN_FAILED =
  "Nothing in the main show was touched, and nothing half-written was kept. Starting it again runs it from the top and skips anything that was already finished.";

export const TRY_AGAIN = "Start it again";

// ---------------------------------------------------------------------------
// ON A ROSTER ROW
// ---------------------------------------------------------------------------

export const ROW_RUNNING = "Being written now →";
export const ROW_FAILED = "It stopped part-way →";

export function rowOpen(written: number): string {
  return `Open ${written === 1 ? "their episode" : `their ${episodeCount(written)}`} →`;
}

/*
 * There is deliberately no wording here for a character who cannot carry a
 * show. `rosterStanding()` in `words.ts` already says which of the two ways
 * they fail — shut out of too little, or there for nearly all of it — and both
 * screens already print it. A third sentence would eventually disagree with it.
 */
