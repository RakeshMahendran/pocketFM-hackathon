/**
 * ===========================================================================
 * TEMPORARY HOME — every string in this file belongs in `lib/words.ts`.
 * ===========================================================================
 *
 * `words.ts` is the single source of truth for what the console says, and it is
 * owned by another track this session. So the wording for *direction* — the four
 * stages of the pipeline, and the one next thing on each screen — sits here,
 * written to the same rules, so moving it later is one cut and one import
 * change. `components/audioWords.ts` and `components/spinoffRunWords.ts` already
 * do exactly this for the audio and spin-off halves.
 *
 * Why this file exists at all: the console was never short of links. `/sourcing`
 * offers thirty-four, the roster eighteen and eight buttons, and every one of
 * them is presented at the same weight. What a producer could not tell was where
 * they were standing, which of the things in front of them was the next one, and
 * what pressing it would cost. Those three questions are all this file answers.
 *
 * The rules it is written to, from `words.ts` itself:
 *
 *  - The reader is a commissioning editor, not an engineer. No route, no id and
 *    no field name reaches the surface. Shows and people are named by their
 *    titles and their names.
 *  - What an action is about to spend has to be readable *before* it is pressed.
 *    Every next step here carries either the sentence saying it is free or the
 *    one saying it is not.
 *  - Nothing here invents a state the backend cannot produce, and nothing here
 *    offers an action the pipeline would refuse. Where a control is gated, the
 *    next step points *at* the gate rather than around it.
 *
 * Everything `words.ts` already says is imported rather than restated.
 */

import { NEXT_CLICK, SHOWS, STORY_LIST } from "@/lib/words";

// ---------------------------------------------------------------------------
// THE FOUR STAGES
//
// The pipeline an editor actually walks, which the console had nowhere on it.
// Named as the work rather than as the modules: nobody outside the repo says
// "discovery", "generation", "publish" or "spin-off writer".
// ---------------------------------------------------------------------------

export type StageKey = "find" | "make" | "release" | "spinoff";

export interface Stage {
  key: StageKey;
  /** Its place in the order. Shown, because the order is the whole point. */
  n: number;
  name: string;
  /** What happens in it, for the map on the front door. */
  means: string;
  /** Where the stage starts, when it can be reached without picking a show. */
  href: string | null;
  /** What to do instead, when it cannot. */
  needs: string | null;
}

export const STAGES: Stage[] = [
  {
    key: "find",
    n: 1,
    name: "Find real stories",
    means:
      "A search reads court records and news for real events strange enough to carry a series, rates each one, and says whether we are allowed to make it at all.",
    href: "/sourcing",
    needs: null,
  },
  {
    key: "make",
    n: 2,
    name: "Make the show",
    means:
      "Back one of them and say how long a season to order. The writer plans the season and writes it, along with a record of every moment in it — who was there, and who never finds out.",
    href: null,
    needs: `Open a story from ${STORY_LIST}, then order a season from its brief.`,
  },
  {
    key: "release",
    n: 3,
    name: "Put it in front of listeners",
    means:
      "Put the show live, then let episodes out one at a time and in order. Nothing goes out until the continuity check has passed on it again.",
    href: "/serials",
    needs: null,
  },
  {
    key: "spinoff",
    n: 4,
    name: "Give a side character their own show",
    means:
      "Take someone from the edge of a finished season and build a show out of what they were never told. It cannot contradict the season it came from, and the check is what proves it.",
    href: "/serials",
    needs: NEXT_CLICK,
  },
];

/** Above the strip. Two words, because the strip has to stay quiet. */
export const PATH_LABEL = "Where you are";

/** The link into a step, on the front door's map. Short, because it repeats. */
export const STAGE_ENTRY = "Start here";

/** For a reader who cannot see the highlight. */
export const PATH_DESCRIBED = "The four steps, and the one this screen is part of";

/**
 * Which stage a screen belongs to, from its route.
 *
 * Deliberately a lookup over path segments rather than a regex: the cast list
 * lives under a season, so `/serials/x/cast` has to beat `/serials/x/4`, and
 * that ordering should be readable rather than encoded in the greediness of a
 * pattern. A screen with no stage — the front door, the sign-in — returns null
 * and the strip highlights nothing, which is honest: you are not in the path
 * yet, you are looking at it.
 */
export function stageFor(pathname: string): StageKey | null {
  const seg = pathname.split("/").filter(Boolean);
  if (seg[0] === "scout" || seg[0] === "sourcing") return "find";
  if (seg[0] === "candidates" || seg[0] === "commissioning") return "make";
  if (seg[0] === "audio") return "release";
  if (seg[0] === "serials") return seg[2] === "cast" ? "spinoff" : "release";
  return null;
}

// ---------------------------------------------------------------------------
// THE ONE NEXT THING
// ---------------------------------------------------------------------------

/** Over the one action a screen wants you to take. */
export const NEXT_LABEL = "Next step";

/** Over a screen with nothing left to do on it, which still has to go somewhere. */
export const ONWARD_LABEL = "Where to go from here";

/** Over a step the pipeline would refuse. It has to read as a wall, not a door. */
export const HELD_LABEL = "Nothing goes out from here yet";

/**
 * The two cost sentences.
 *
 * A console where some buttons are a page load and others are four minutes and
 * a bill teaches people to hesitate over all of them. Said once each, and every
 * next step carries one.
 */
export const FREE_CLICK =
  "Opening this writes nothing and spends nothing. Every step that costs money says so before you press it.";

export const COMMISSION_COST =
  "Ordering a season takes a few minutes and costs real money. You choose the length first, and nothing is written until you do.";

// ---------------------------------------------------------------------------
// THE FRONT DOOR
// ---------------------------------------------------------------------------

export const PATH_HEADING = "How a show gets made here";

export const PATH_EXPLAINED =
  "Four steps, in this order. The line at the top of every screen says which one you are standing in.";

export const HOME_NEXT = {
  action: "Open the story list",
  plain: `Everything the last search turned up, best first, with the legal verdict on each one. Every show in ${SHOWS} started as a row on that list.`,
};

/** The five cards, demoted under a heading that says what they are. */
export const DETAIL_HEADING = "Each part, in its own words";

// ---------------------------------------------------------------------------
// THE SEARCH SCREEN
// ---------------------------------------------------------------------------

export function scoutNext(found: number): { action: string; plain: string } {
  return {
    action: `See all ${found} stories`,
    plain:
      "The list this search produced, best first. Choosing one from it is the first decision anybody makes here.",
  };
}

// ---------------------------------------------------------------------------
// THE STORY LIST
// ---------------------------------------------------------------------------

/**
 * Which story the list is pointing at, said as why it is that one.
 *
 * `top` is the search's own first place; without one, the screen falls to the
 * best-rated story we are allowed to make. Both are stated, because "the search
 * liked this" and "this is the best one you can legally touch" are different
 * recommendations and an editor should know which they are being given.
 */
export function sourcingNext(o: {
  title: string;
  top: boolean;
  made: boolean;
}): { action: string; plain: string } {
  const why = o.top
    ? "The search ranked this one first."
    : "The best-rated story on this list that we are allowed to make.";
  const then = o.made
    ? "A season has already been written from it, and the brief opens straight onto the show."
    : "The brief has what really happened, the best case against making it, and the button that orders a season.";
  return { action: `Open “${o.title}”`, plain: `${why} ${then}` };
}

// ---------------------------------------------------------------------------
// ONE STORY'S BRIEF
// ---------------------------------------------------------------------------

export const CANDIDATE_NEXT = {
  action: "Order a season",
  plain: `This is the decision the whole list exists for. Ordering one works out the episode-by-episode plan, writes the scripts, and records every moment in the season — then the show joins ${SHOWS}.`,
};

/**
 * A blocked story offers no way forward, and must not look as though it does.
 * The refusal itself is `CommissionAction`'s and stays where it is; this only
 * makes sure the reader is not left standing at a wall with nowhere to turn.
 */
export const CANDIDATE_BLOCKED = {
  action: "Back to the story list",
  plain:
    "Nothing on this page can be ordered, and nobody can overrule that. The stories we are allowed to make are at the top of the list.",
};

export const CANDIDATE_MADE = {
  action: "Read the season",
  plain:
    "This story has already been made. The season, the episodes as they came back, and everyone in it who could carry a show of their own are all on the show’s own screen.",
};

// ---------------------------------------------------------------------------
// THE SLATE
// ---------------------------------------------------------------------------

/** Counted people, said once so no screen writes "1 characters". */
export function characters(n: number): string {
  return `${n} ${n === 1 ? "character" : "characters"}`;
}

/**
 * The show on the slate with something waiting to happen to it.
 *
 * Seven rows, all drawn identically, and nothing on the screen said which of
 * them was mid-release. Deliberately says "live" rather than "the only live
 * one" — more than one show can be live at once, and a sentence that stops being
 * true the second time somebody presses publish is worse than no sentence.
 */
export function slateNext(o: {
  title: string;
  released: string;
  ep: number;
  castCount: number;
}): { action: string; plain: string } {
  return {
    action: `Open “${o.title}”`,
    plain: `Live with listeners on it — ${o.released}, and episode ${o.ep} is the one that can go out next. ${characters(
      o.castCount,
    )} in it are each a show that could be made out of what they were never told.`,
  };
}

export function slateNothingLive(o: {
  title: string;
  castCount: number;
}): { action: string; plain: string } {
  return {
    action: `Open “${o.title}”`,
    plain: `Nothing here is in front of listeners yet. This one is written and waiting: put the show live, then let episodes out one at a time. ${characters(
      o.castCount,
    )} in it could each carry a show of their own afterwards.`,
  };
}

// ---------------------------------------------------------------------------
// ONE SEASON  (the block dropped into /serials/[id])
// ---------------------------------------------------------------------------

/**
 * The season screen holds the release controls itself, and those controls are
 * gated — `publish_episode()` refuses on a failing check and the console has to
 * refuse in the same place. So the next step here never carries a release
 * button of its own. It names the episode and walks you to the control.
 */
export function goToEpisode(ep: number): string {
  return `Go to episode ${ep} in the list below`;
}

export const SEASON_ALL_OUT = {
  action: "Who else has a story",
  plain:
    "Every episode written is with listeners, so there is nothing left to release. The season is now worth more as a source than as a show: everyone at its edges is a season of their own, waiting on what they never found out.",
};

export const SEASON_GO_LIVE = {
  action: "Go to the release controls below",
  plain:
    "Nothing can go out while the show is not live. Putting it live releases nothing on its own — the episodes still go out one at a time afterwards.",
};

export const SEASON_NOTHING_WRITTEN = {
  action: "Back to the shows",
  plain:
    "No episodes have been written for this show, so there is nothing to put in front of anyone and nobody in it to build a second show around yet.",
};

// ---------------------------------------------------------------------------
// THE ROSTER
// ---------------------------------------------------------------------------

/**
 * Eighteen names and eight identical paid buttons, and no indication which one
 * to touch. The step being named here is the *free* one — opening somebody —
 * because the paid button lives on their own page with the full sentence about
 * what it spends, and that is the right order to meet them in.
 */
export function rosterNext(o: {
  name: string;
  witnessed: number;
  blind: number;
  written: number;
  /** A run already going for them. Their page is the only screen that watches it. */
  running: boolean;
}): { action: string; plain: string } {
  const gap = `Shut out of ${o.blind} moments of the season and there for ${o.witnessed}.`;
  const then = o.running
    ? "An episode is being written for them right now, and their page is the only screen that watches it happen."
    : o.written > 0
      ? "Their episode is already written and checked against the main show — it is on their page, and reading it costs nothing."
      : "Their page shows what they saw, what went on behind their back, and offers the button that writes their first episode.";
  return { action: `Open ${o.name}`, plain: `${gap} ${then}` };
}

export const ROSTER_NOBODY = {
  action: "Back to the show",
  plain:
    "Nobody in this season is shut out of enough of it to build a second show around. That is a fact about the season, not a fault — a cast who all saw everything leaves a writer nothing to find out.",
};

// ---------------------------------------------------------------------------
// ONE CHARACTER
// ---------------------------------------------------------------------------

export const CHARACTER_WRITE = {
  action: "Go to the writing controls below",
  plain:
    "Everything above is what this character knows. Below it is the button that turns that into an episode, and the check that proves the episode does not contradict the show they came from.",
};

/** The end of the path, and the only screen that has one. */
export function characterDone(o: {
  name: string;
  showTitle: string;
}): { action: string; plain: string } {
  return {
    action: "Pick somebody else",
    plain: `That is the whole path: a real event, a season, and now a second season built out of what ${o.name} was never told — checked line by line against the first and contradicting none of it. Everyone else in “${o.showTitle}” is another one.`,
  };
}

/** A character the season leaves too little of. Still has to go somewhere. */
export const CHARACTER_TOO_THIN = {
  action: "Pick somebody else",
  plain:
    "The season does not leave enough of this person for a writer to build from, so no episode can be written for them. The rest of the cast is one click back.",
};

// ---------------------------------------------------------------------------
// WHAT IS FOLDED AWAY, AND WHY IT IS STILL THERE
//
// The character screen ran to six thousand words, four and a half thousand of
// them two full scripts printed inline, and it is the screen the whole product
// is sold on. What decides anything is the verdict and the two counts beside it;
// the script is what somebody reads *after* they believe the verdict. So the
// scripts, the moment the episode is built on and the crossing points are folded
// — and the folding is announced, because a reader who thinks something was cut
// trusts the screen less than one who can see where it went.
// ---------------------------------------------------------------------------

export const FOLD_EXPLAINED =
  "Nothing here has been left out — the script, the moment it starts from and every place the two shows touch are one click each.";

/** One fold holding both of the ways an episode is pinned to the main show. */
export const ALIGNMENT_FOLD = "How it lines up with the main show";

/** The bible's five long fields. The pitch above them stays open. */
export const WRITER_FOLD = "What a writer would work from";

export function crossingCount(n: number): string {
  return `${n} ${n === 1 ? "moment in both shows" : "moments in both shows"}`;
}

// Counts on a closed summary line. Said here so no fold writes "1 moments".

export function bibleLineCount(n: number): string {
  return `${n} ${n === 1 ? "thing about them" : "things about them"}`;
}

export function momentCount(n: number): string {
  return `${n} ${n === 1 ? "moment" : "moments"}`;
}

export function stretchCount(n: number): string {
  return `${n} ${n === 1 ? "stretch" : "stretches"}`;
}

/** How many suspicions a clean verdict is made of, on the closed line. */
export function ruledOutCount(n: number): string {
  return `${n} ruled out`;
}

/** On the closed line of a script, so its length is known before opening it. */
export function scriptLength(minutes: number, words: number): string {
  return `~${minutes} min to listen · ${words.toLocaleString()} words`;
}

// ---------------------------------------------------------------------------
// ONE EPISODE
// ---------------------------------------------------------------------------

export function episodeNextOut(ep: number): { action: string; plain: string } {
  return {
    action: `Open episode ${ep}`,
    plain: `This one is already with listeners. Episode ${ep} is the next that can go out, and the button that does it is on that episode’s own screen.`,
  };
}

export function episodeEndOfSeason(showTitle: string): {
  action: string;
  plain: string;
} {
  return {
    action: "Who else has a story",
    plain: `That is the last episode written. Everyone standing at the edges of “${showTitle}” is a season of their own — built out of the parts of this one they never found out about.`,
  };
}
