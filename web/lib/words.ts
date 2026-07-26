/**
 * Everything the screen says, in the language of commissioning rather than the
 * language of the pipeline.
 *
 * `CLAUDE.md` fixes the codebase's nouns — corpus, scout, tier, grounded — and
 * they earn their place in code, where precision matters more than warmth. On
 * screen they are wrong: the reader is a commissioning editor deciding whether
 * to spend a production slot, not an engineer debugging a stage. "Assembled
 * from committed stories" told them nothing they could act on.
 *
 * The test for any string that reaches this file: would someone who has never
 * opened a terminal understand it without asking?
 *
 * One file so a rename cannot leave half the app speaking the old dialect.
 */

import type { Candidate, ClearanceStatus } from "./types";

// ---------------------------------------------------------------------------
// CLEARANCE — the only column that changes what an editor is allowed to do
// ---------------------------------------------------------------------------

export const CLEARANCE: Record<
  ClearanceStatus,
  { short: string; plain: string }
> = {
  greenlight: {
    short: "Safe to make",
    plain:
      "Everyone involved is either long dead or an institution. It can be made as it happened.",
  },
  fictionalize_first: {
    short: "Change the names",
    plain:
      "Real, recent, and involves living people who never asked to be in a show. Names and places have to change before it can be made.",
  },
  blocked: {
    short: "Can’t make this",
    plain:
      "This one is off the table. Changing the names would not fix the reason.",
  },
};

export const CLEARANCE_UNKNOWN = {
  short: "Not checked",
  plain: "Nobody has looked at whether this can legally be made yet.",
};

// ---------------------------------------------------------------------------
// SCORE — a number out of fifty means nothing on its own
// ---------------------------------------------------------------------------

/** The five things each story is marked on, said the way an editor would say them. */
export const MEASURES: Record<string, { label: string; asks: string }> = {
  engine_longevity: {
    label: "Won’t run out",
    asks: "Could this still be finding trouble at episode 150?",
  },
  hook_density: {
    label: "Twists already there",
    asks: "How many turns does the real story hand us for free?",
  },
  emotional_immediacy: {
    label: "Lands in 30 seconds",
    asks: "Does a listener feel it before anything is explained?",
  },
  conflict: {
    label: "A real opponent",
    asks: "Is someone pushing back, or is it just a problem to solve?",
  },
  cast_depth: {
    label: "Cast worth following",
    asks: "How many other people in it could carry their own show later?",
  },
};

export function verdict(total: number | null): {
  word: string;
  className: string;
} {
  if (total === null) return { word: "Not scored", className: "text-faint" };
  if (total >= 45) return { word: "Strong", className: "text-clear" };
  if (total >= 38) return { word: "Worth making", className: "text-paper" };
  return { word: "Thin", className: "text-muted" };
}

/** What the five bars are counted out of. Only shown where the bars are. */
export const SCALE_EXPLAINED = "Each one is marked out of 10.";

/** Why 38. Stated once, on screen, so the bar is not folklore. */
export const BAR_EXPLAINED =
  "Anything under 38 out of 50 is dropped before it reaches you.";

// ---------------------------------------------------------------------------
// STATE — where a story sits in the editor's own process
// ---------------------------------------------------------------------------

/** Shown on the one story the search ranked first. Same words in list and brief. */
export const TOP_PICK = "Top pick";

/** Already commissioned. Never the bare word "commissioned" on its own. */
export const IN_PRODUCTION = "Already being made";

export function stateOf(c: Candidate): { label: string; className: string } {
  // Made beats every other state. Once a story has become a show, that is the
  // only thing about it an editor needs to see at a glance.
  if (c.madeAs) return { label: "Made", className: "text-clear" };
  if (c.origin === "commissioned")
    return { label: IN_PRODUCTION, className: "text-clear" };
  if (c.origin === "also-considered")
    return { label: "Not chosen", className: "text-faint" };
  return c.winner
    ? { label: TOP_PICK, className: "text-ochre" }
    : { label: "New", className: "text-muted" };
}

/** "high spinoff" is not a sentence. What the mark actually means about a person. */
export const SPINOFF_POTENTIAL: Record<string, string> = {
  high: "Could carry a show",
  med: "Possible spin-off",
  low: "Background only",
};

// ---------------------------------------------------------------------------
// SECTION HEADINGS
// ---------------------------------------------------------------------------

/**
 * `why_not` is not a rejection reason. The hunt prompt asks for "why it lost,
 * or for the winner, the best case against it", and every story carries one —
 * including the one we picked and the ones already in production. Printed as
 * "why we didn't pick this" it contradicted the "Top pick" badge sitting two
 * inches above it. This wording is true of all thirteen.
 */
export const CASE_AGAINST = "The case against it";

export const HEADING = {
  mechanism: "What actually happened",
  engine: "Why it won’t run out of story",
  sells: "Why people will listen",
  whyNot: CASE_AGAINST,
  cast: "Who’s in it",
  score: "How it rated",
  clearanceReasons: "What the lawyers would say",
  novelty: "Has anyone made this before?",
  sources: "Where this came from",
  commission: "Make this one",
};

/** The one place technical detail is allowed to surface. Same words everywhere. */
export const FOR_THE_OPERATOR = "For whoever runs it";

// ---------------------------------------------------------------------------
// SCREEN NAMES
//
// Three people renamed these independently and the app ended up calling one
// screen the nav's "Stories", the sign-in's "story list" and, in seven places,
// the "sourcing queue". A reader cannot tell those are the same page. Naming
// them once is the only thing that stops it happening again.
// ---------------------------------------------------------------------------

/** In prose: "…still shows every story THE STORY LIST has found". */
export const STORY_LIST = "the story list";
/** As a heading or a back link. Matches the h1 on that screen. */
export const STORY_LIST_TITLE = "Stories worth making";

/** In prose. The slate, said plainly. */
export const SHOWS = "the shows we’re making";
/** As a heading or a back link. */
export const SHOWS_TITLE = "Shows we’re making";

/**
 * The line above the story list, naming the run that produced it. It is also
 * the only route back into the search from anywhere an editor normally stands,
 * so it is a link rather than a caption.
 */
export const SEARCH_RAN = {
  latest: "From the latest search",
  earlier: "From earlier searches",
  replay: "watch it search",
};

// ---------------------------------------------------------------------------
// CATEGORY — the eight hunt categories arrive SHOUTING
// ---------------------------------------------------------------------------

export function category(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.toLowerCase().replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ===========================================================================
// THE SPIN-OFF HALF
//
// Everything below names the second half of the product: taking someone out of
// a finished show and giving them their own. The pipeline calls these things
// knows / blind / gaps / promotion / anchor beat / leakage / core_canon, and in
// code those words are exact and worth keeping. On screen every one of them
// reads as a system word, and the reader is deciding whether to spend a slot on
// a spin-off — not inspecting a data structure.
//
// The value spaces are the ones the API actually returns (src/canon/views.py
// and src/validation/panel.py), so nothing here invents a state that cannot
// occur. Lookups take a raw string and fall back, because a screen should not
// crash on a check name someone added this morning.
// ===========================================================================

export type CharacterViewKey = "knows" | "blind" | "gaps";
export type AnchorKind = "witnessed" | "offscreen";
export type CheckName = "leakage" | "crossing" | "hook" | "refuter";
export type Severity = "error" | "warn";
export type VerdictStatus = "clean" | "violations" | "inconclusive" | "missing";
export type CanonTier = "core_canon" | "branch_canon";

/** One label, one sentence under it. The shape most of this section uses. */
export interface Said {
  label: string;
  plain: string;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// WHAT ONE CHARACTER KNOWS — the three views
//
// The whole spin-off claim rests on the middle one, so it gets the plainest
// words in the file. "Blind" describes the character as impaired; what is
// actually true is that nobody ever told them, which is the interesting part.
// ---------------------------------------------------------------------------

export const CHARACTER_VIEW: Record<CharacterViewKey, Said> = {
  knows: {
    label: "Was there for",
    plain:
      "The moments this character saw happen. Their own show can use any of it.",
  },
  blind: {
    label: "Never found out about",
    plain:
      "Things that happened in the main show without them. They cannot mention any of it, because as far as they know it never happened.",
  },
  gaps: {
    label: "Nobody wrote down where they were",
    plain:
      "Runs of the main show this character never appears in. Free space — nothing written into it can contradict anything.",
  },
};

export function characterView(raw: string | null): Said {
  const key = (raw ?? "").toLowerCase() as CharacterViewKey;
  return CHARACTER_VIEW[key] ?? { label: raw ?? "—", plain: "" };
}

/** Under the two counts on a character. The idea of the product in one line. */
export const SPLIT_EXPLAINED =
  "Out of every moment in the main show, this is how much they saw and how much went on behind their back.";

// ---------------------------------------------------------------------------
// THE ROSTER — who could carry a show, and why
//
// The counts are the pitch, not a statistic: someone shut out of far more than
// they saw is someone the main show has already paid to build and never told
// the story of. Said as a sentence, an editor can act on it; left as "11 / 46
// promotable" it is a database row.
//
// `SPINOFF_POTENTIAL` above is a different thing and both are shown: that is
// the scout guessing from a news story before anything is written, this is
// counted from the finished season's beats.
// ---------------------------------------------------------------------------

/** Sits under the roster once, like `BAR_EXPLAINED` sits under the scores. */
export const ROSTER_EXPLAINED =
  "A character shut out of more than they saw is a character with a story the main show never told.";

/** The measured verdict on one cast member. Rules mirror `views.promotable()`. */
export function rosterStanding(c: {
  witnessed: number;
  blind: number;
  promotable: boolean;
}): { label: string; why: string; className: string } {
  if (c.promotable) {
    return {
      label: "Could carry their own show",
      why: `Was there for ${plural(c.witnessed, "moment", "moments")} and shut out of ${c.blind}. That difference is the story.`,
      className: "text-ochre",
    };
  }
  // Two ways to fail, and they are opposites. Saying "not promotable" to both
  // tells an editor nothing about which one they are looking at.
  if (c.blind > c.witnessed) {
    return {
      label: "Too little to build on",
      why: `Only in ${plural(c.witnessed, "moment", "moments")} of the whole season — not enough for a writer to work from.`,
      className: "text-faint",
    };
  }
  return {
    label: "Was there for most of it",
    why: "Saw nearly everything the main show did, so there is almost nothing left for them to find out. That is the lead, not a spin-off.",
    className: "text-faint",
  };
}

// ---------------------------------------------------------------------------
// WORKING A CHARACTER UP — promotion, and what it produces
//
// One slow call, on click, and the screen has to say so before someone presses
// it twice. "Promotion" reads like a job title; the thing it does is read back
// everything this person saw and write them up properly.
// ---------------------------------------------------------------------------

export const PROMOTION = {
  action: "Work this character up",
  running: "Reading back everything they saw…",
  done: "Worked up already",
  plain:
    "One pass over every moment this character was there for, to write them up in enough depth for a writer to use. It takes a minute, and it only happens once.",
};

// "Bible" is not jargon here — "show bible" and "character bible" are what a
// commissioning team already calls these. Translating it out was the one change
// that made the product look like it had never met the industry.
export const BIBLE: Said = {
  label: "Character bible",
  plain:
    "What they want, how they speak, what they saw, and the list of things they must never be shown knowing.",
};

// ---------------------------------------------------------------------------
// WHERE AN EPISODE STARTS — the anchor
// ---------------------------------------------------------------------------

export const ANCHOR: Said = {
  label: "Starts from",
  plain:
    "The moment in the main show this episode is built on — the same moment, from their side of it.",
};

export const ANCHOR_PICK = "Pick the moment it starts from";

export const ANCHOR_KIND: Record<AnchorKind, Said> = {
  witnessed: {
    label: "They were there",
    plain:
      "The episode can play this moment out. What happens in it is already fixed by the main show.",
  },
  offscreen: {
    label: "They were not there",
    plain:
      "This happens to them without their knowing. The episode is set alongside it, and must not let them find out.",
  },
};

export function anchorKind(raw: string | null): Said {
  const key = (raw ?? "").toLowerCase() as AnchorKind;
  return ANCHOR_KIND[key] ?? { label: raw ?? "—", plain: "" };
}

// ---------------------------------------------------------------------------
// WRITTEN WITH THE LIMITS, AND WRITTEN WITHOUT
//
// The unconstrained version is a control, deliberately generated so the check
// has something to catch. If a producer reads it as the system having produced
// a broken episode by accident, the demonstration argues against itself — so
// the words say "on purpose" before they say anything else.
// ---------------------------------------------------------------------------

export const WRITING_MODE: Record<"constrained" | "unconstrained", Said> = {
  constrained: {
    label: "Written to what they know",
    plain:
      "The writer was handed the list of what this character saw and told not to go past it. Every episode meant for listeners is made this way.",
  },
  unconstrained: {
    label: "Control version — limits switched off",
    plain:
      "The same character and the same moment, written on purpose without the list, so you can see the check catch what it is supposed to catch. It is not meant to go out, and it failing is the system working.",
  },
};

export function writingMode(constrained: boolean): Said {
  return constrained
    ? WRITING_MODE.constrained
    : WRITING_MODE.unconstrained;
}

/** Above the two versions shown together. */
export const CONTROL_EXPLAINED =
  "Same character, same moment, written twice — once inside their limits, once with the limits off. Only one of them is supposed to pass.";

// ---------------------------------------------------------------------------
// THE CHECK — one stage, six passes, three of them hostile
// ---------------------------------------------------------------------------

export const CHECKER = "the continuity check";
export const CHECKER_TITLE = "Continuity check";

/** Why a green result is worth anything. Shown next to the verdict, once. */
export const CHECKER_EXPLAINED =
  "Six passes over the script: three looking for contradictions, and three more trying to prove the first three missed something.";

export const ATTEMPTS_HEADING = "What it tried, and could not make stick";
export const ATTEMPTS_EXPLAINED =
  "Each line is something the check suspected and then ruled out. This is what a clean result is made of.";

/**
 * What each script is read for.
 *
 * The first three are the readings; `refuter` is a finding raised by one of the
 * three passes whose job is to prove the first three missed something. It is
 * named here because it reaches the screen as a finding in its own right — the
 * committed data carries `check: "refuter"` at `error` severity — and without
 * copy for it, `checkName()` would print the raw field value to a producer.
 */
export const CHECKS: Record<CheckName, Said> = {
  leakage: {
    label: "Knows something they shouldn’t",
    plain:
      "The character says, uses, or acts on something nobody ever told them. This is the failure the whole thing exists to stop.",
  },
  crossing: {
    label: "Doesn’t match the main show",
    plain:
      "A moment both shows contain has to happen the same way in each. What it means to the character can differ completely; what happened cannot.",
  },
  hook: {
    label: "Ends like the main show",
    plain:
      "The episode finishes the way the main show already finished this moment, or ties it off instead of leaving the listener somewhere. Worth reading, not a contradiction.",
  },
  refuter: {
    label: "Caught on a second reading",
    plain:
      "The first three readings let this through, and one of the three trying to prove them wrong found it anyway. It counts exactly as much as the others.",
  },
};

export function checkName(raw: string | null): Said {
  const key = (raw ?? "").toLowerCase() as CheckName;
  return CHECKS[key] ?? { label: raw ?? "Flagged", plain: "" };
}

// ---------------------------------------------------------------------------
// SEVERITY — only one of these two is a contradiction
//
// The check marks every hook finding `warn` and everything else `error`. If the
// screen calls a warn a contradiction, an episode that is fine looks broken and
// the guarantee stops meaning anything. Never merge these two counts.
// ---------------------------------------------------------------------------

export const SEVERITY: Record<Severity, Said & { className: string }> = {
  error: {
    label: "Contradicts the main show",
    plain:
      "This cannot go out as written. It puts something in the character’s mouth that they were never told.",
    className: "text-halt",
  },
  warn: {
    label: "Worth reading first",
    plain:
      "Not a contradiction. A note for whoever reads the script before it goes out.",
    className: "text-caution",
  },
};

export function severity(raw: string | null): Said & { className: string } {
  return raw === "error" ? SEVERITY.error : SEVERITY.warn;
}

/** Counted things, said once so no screen writes "1 contradictions". */
export function contradictionCount(n: number): string {
  return plural(n, "contradiction", "contradictions");
}

export function noteCount(n: number): string {
  return plural(n, "note worth reading", "notes worth reading");
}

// ---------------------------------------------------------------------------
// THE VERDICT — what a producer is being told they can do
//
// "0 violations" is a test result. What a producer needs is whether this can go
// in front of listeners, so the clean case says that in a sentence and the
// failing case says exactly how many things stand in the way.
// ---------------------------------------------------------------------------

export function continuityVerdict(v: {
  status: string | null;
  n_errors: number;
  n_warnings?: number;
}): { label: string; plain: string; className: string; clean: boolean } {
  const notes = v.n_warnings ?? 0;
  const noteTail = notes
    ? ` ${notes === 1 ? "There is" : "There are"} ${noteCount(notes)} before it goes out.`
    : "";

  // Both of these are checked before the error count, because both arrive with
  // n_errors: 0 and would otherwise fall through to the clean sentence — an
  // episode nobody has checked would be reported as one that passed.
  if (v.status === "missing") {
    return {
      label: "Not checked yet",
      plain:
        "The continuity check has never been run over this episode, so there is nothing saying whether it contradicts the main show. It has not passed and it has not failed.",
      className: "text-caution",
      clean: false,
    };
  }

  if (v.status === "inconclusive") {
    return {
      label: "Couldn’t finish checking",
      plain:
        "Part of the check did not come back, so this episode has not been cleared either way. Run it again before doing anything with it.",
      className: "text-caution",
      clean: false,
    };
  }

  if (v.n_errors > 0) {
    return {
      label: "Contradicts the main show",
      plain: `${contradictionCount(v.n_errors)} in this episode ${
        v.n_errors === 1 ? "gives" : "give"
      } the character knowledge nobody ever gave them. It cannot go out as written.${noteTail}`,
      className: "text-halt",
      clean: false,
    };
  }

  return {
    label: "Nothing contradicts the main show",
    plain: `Checked line by line against the main show. Nothing in this episode contradicts it.${noteTail}`,
    className: "text-clear",
    clean: true,
  };
}

/** For a badge or a column head where the sentence above will not fit. */
export function verdictShort(v: {
  status: string | null;
  n_errors: number;
}): { word: string; className: string } {
  if (v.status === "missing")
    return { word: "Not checked", className: "text-caution" };
  if (v.status === "inconclusive")
    return { word: "Not finished", className: "text-caution" };
  if (v.n_errors > 0)
    return { word: "Contradicts", className: "text-halt" };
  return { word: "Clear", className: "text-clear" };
}

// ---------------------------------------------------------------------------
// THE TWO SHOWS — what a spin-off is allowed to do to the original
// ---------------------------------------------------------------------------

export const CANON_TIER: Record<CanonTier, Said> = {
  core_canon: {
    label: "The main show",
    plain:
      "The original season. Nothing a spin-off does can change a word of it.",
  },
  branch_canon: {
    label: "Spin-off",
    plain:
      "Written on top of the main show. It can lean on the main show; it can never rewrite it.",
  },
};

export function canonTier(raw: string | null): Said {
  const key = (raw ?? "").toLowerCase() as CanonTier;
  return CANON_TIER[key] ?? { label: raw ?? "—", plain: "" };
}

export const CROSSING_POINT: Said = {
  label: "Where the two shows touch",
  plain:
    "A moment that appears in both. What happened has to match exactly — what it means to each of them can be completely different, and usually is.",
};

// ---------------------------------------------------------------------------
// SPIN-OFF SCREEN NAMES AND HEADINGS
//
// Same reason as the naming block above: two screens, named once, so the nav,
// the back links and the prose cannot drift apart.
// ---------------------------------------------------------------------------

/** In prose: "…everyone THE CAST LIST found in the finished season". */
export const CAST_LIST = "the cast list";
/** As a heading or a back link. */
export const CAST_LIST_TITLE = "Who else has a story";

/** In prose. */
export const SPINOFF = "the spin-off";
/** As a heading or a back link. */
export const SPINOFF_TITLE = "Their own episode";

// ---------------------------------------------------------------------------
// THE FRONT DOOR — what the cards on /home promise
//
// Two cards read "Not built yet" long after the spin-off writer and the check
// had shipped, on the one screen that explains both halves of the product. Both
// halves are per-season — there is no bare route to a character — so the cards
// land on the slate and name the click that follows.
// ---------------------------------------------------------------------------

/** Every card that goes somewhere says the same word about itself. */
export const READY = "Ready";

/** Closes a card whose route needs one more choice before it pays off. */
export const NEXT_CLICK = "Open a show, then pick someone from its cast.";

export const SPINOFF_HEADING = {
  roster: "Who else has a story",
  knows: CHARACTER_VIEW.knows.label,
  blind: CHARACTER_VIEW.blind.label,
  gaps: CHARACTER_VIEW.gaps.label,
  anchor: "Where this episode starts",
  bible: BIBLE.label,
  script: "The episode",
  crossings: CROSSING_POINT.label,
  check: CHECKER_TITLE,
  control: "What happens without the limits",
  want: "What they’re after",
  voice: "How they talk",
};

// ===========================================================================
// PUTTING IT IN FRONT OF LISTENERS
//
// Two decisions, not one, because the platform earns per unlocked episode. A
// show going live means it exists for listeners at all; an episode going out is
// the thing that actually earns. Until now the console had one button doing
// both, so there are no words in this file for the half that pays.
//
// One rule of vocabulary holds the whole section together:
//
//     a SHOW is live or not live — an EPISODE is out or held back
//
// Never crossed. The panel's old "Not out yet" said the show-level thing in the
// episode-level words, which is precisely the sentence that stops making sense
// the first time a show is live with nothing released.
//
// Every state named here is one `src/publish.py` can actually be in: live with
// nothing out, `released_through()` as the last episode a listener can reach,
// the in-order rule, and the tail that comes off with a pull. Nothing here
// invents a state the backend cannot produce.
// ===========================================================================

export type ShowState = "live" | "draft";
export type EpisodeState = "out" | "held";

/**
 * How far a season has got, as the backend counts it.
 *
 * `releasedThrough` is `released_through()` — the last episode a listener can
 * reach in an unbroken run from episode 1, not the count of records in the
 * file. `written` is `episode_count()`, counted off disk. Kept apart because
 * they answer different questions and a season is usually written far ahead of
 * what is out.
 */
export interface SeasonRelease {
  live: boolean;
  releasedThrough: number;
  written: number;
}

/** The idea, said once, wherever the two decisions first appear together. */
export const TWO_DECISIONS_EXPLAINED =
  "Two separate decisions. Putting the show live means it exists for listeners at all; putting an episode out is the thing they actually unlock.";

/** Why the buttons only ever offer one episode. Sits under the episode list. */
export const ORDER_EXPLAINED =
  "Episodes go out in order and come back from the end, so a listener never arrives at a gap in the middle.";

/** The answer to “we published it last week, why is it checking again?”. */
export const CHECKED_EVERY_TIME =
  "The continuity check runs again on every episode, not just the first. Episodes go out days apart and a season can be edited in between, so the check is the last thing before listeners every time.";

/**
 * Same caveat the season panel already prints, kept here so the episode buttons
 * cannot end up promising more than the season button does. There is no Pocket
 * FM API on the other side of any of this.
 */
export const RELEASE_NOT_A_PUSH =
  "Putting an episode out records the decision here. It does not push anything to the app yet.";

// ---------------------------------------------------------------------------
// COUNTS — said once, so no screen writes “1 episodes”
// ---------------------------------------------------------------------------

export function episodeCount(n: number): string {
  return plural(n, "episode", "episodes");
}

export function heldCount(n: number): string {
  return `${plural(n, "episode", "episodes")} still held back`;
}

/**
 * What a refused release is counted in. `src/publish.py` says "continuity
 * problem" in its own refusal, and the fatal list mixes contradictions with
 * malformed records — `refusal()` in web/lib/publish.ts is what tells those two
 * apart in prose. This only counts them, so it must not call them all
 * contradictions.
 */
export function problemCount(n: number): string {
  return plural(n, "continuity problem", "continuity problems");
}

/**
 * "2 of 14 episodes out", and the two ends of that range said as a person would
 * say them rather than as "0 of 14" and "14 of 14".
 */
export function releaseProgress(out: number, written: number): string {
  if (written === 0) return "nothing written yet";
  if (out === 0) return "nothing out yet";
  if (out >= written)
    return written === 1
      ? "the only episode is out"
      : `all ${written} episodes out`;
  // Both ends are handled above, so this branch always has two or more written
  // and the plural is safe.
  return `${out} of ${written} episodes out`;
}

// ---------------------------------------------------------------------------
// THE SHOW — live, not live, and the pre-launch state in between
//
// "Live · nothing out yet" is the state that has to read as deliberate. It is
// where every show sits between the moment someone stands behind it and the
// moment episode 1 goes out, and a console that renders it in the colour of a
// failure teaches a producer to distrust the one screen they act from.
// ---------------------------------------------------------------------------

export const SHOW_LIVE: Said = {
  label: "Live",
  plain:
    "The show exists for listeners. Episodes still go out one at a time from here.",
};

export const SHOW_DRAFT: Said = {
  label: "Not live yet",
  plain:
    "Nobody outside the team can see this show. Nothing goes out until it is live.",
};

/** The real pre-launch state, and it is not an error. */
export const PRE_LAUNCH: Said = {
  label: "Live · nothing out yet",
  plain:
    "The show is live and no episode has gone out. That is where every show starts — episode 1 goes whenever you are ready.",
};

export const SHOW_STATE: Record<ShowState, Said> = {
  live: SHOW_LIVE,
  draft: SHOW_DRAFT,
};

export function showState(live: boolean): Said {
  return live ? SHOW_LIVE : SHOW_DRAFT;
}

/**
 * The one line at the top of a season: where the show stands, and how much of
 * it a listener can hear. Three states and each says something different about
 * what to do next.
 */
export function seasonStanding(s: SeasonRelease): {
  label: string;
  plain: string;
  className: string;
} {
  if (!s.live) {
    return {
      label: SHOW_DRAFT.label,
      plain: `${
        s.written === 0
          ? "Nothing written yet"
          : `${episodeCount(s.written)} written`
      } and nothing in front of listeners. ${TWO_DECISIONS_EXPLAINED}`,
      className: "text-muted",
    };
  }

  if (s.releasedThrough === 0) {
    return {
      label: PRE_LAUNCH.label,
      plain: `${PRE_LAUNCH.plain}${
        s.written > 0 ? ` ${episodeCount(s.written)} are written and waiting.` : ""
      }`,
      className: "text-ochre",
    };
  }

  const heard =
    s.releasedThrough === 1
      ? "Listeners can hear episode 1."
      : `Listeners can hear episodes 1 to ${s.releasedThrough}.`;
  const rest =
    s.releasedThrough >= s.written
      ? " Everything written is out."
      : ` Episode ${s.releasedThrough + 1} goes out next.`;

  return {
    label: `Live · ${releaseProgress(s.releasedThrough, s.written)}`,
    plain: `${heard}${rest}`,
    className: "text-clear",
  };
}

// ---------------------------------------------------------------------------
// ONE EPISODE — out, or held back
//
// "Published" and "unpublished" describe what the file says. "Out" and "held
// back" describe what a listener can do, which is the thing being decided.
// ---------------------------------------------------------------------------

export const EPISODE_OUT: Said = {
  label: "Out",
  plain: "Listeners can unlock this one. It stays out until somebody pulls it.",
};

export const EPISODE_HELD: Said = {
  label: "Held back",
  plain:
    "Written, but not in front of listeners. Nothing happens to it until someone puts it out.",
};

export const EPISODE_RELEASE: Record<EpisodeState, Said> = {
  out: EPISODE_OUT,
  held: EPISODE_HELD,
};

export function episodeRelease(out: boolean): Said {
  return out ? EPISODE_OUT : EPISODE_HELD;
}

/**
 * Why an episode is where it is, and whether the button should be there.
 *
 * The four ways an episode can be unreleasable are four different pieces of
 * news, and `publish_episode()` refuses each of them in its own words. Flattened
 * into one greyed-out button they all read as "broken".
 */
export type EpisodeStandingKind =
  | "out"
  | "next"
  | "waiting"
  | "show-not-live"
  | "unwritten";

export function episodeStanding(
  ep: number,
  s: SeasonRelease,
): {
  kind: EpisodeStandingKind;
  label: string;
  plain: string;
  className: string;
  canRelease: boolean;
} {
  if (ep < 1 || ep > s.written) {
    return {
      kind: "unwritten",
      label: "Not written",
      plain: `This show has ${episodeCount(s.written)}, so there is no episode ${ep} to put out.`,
      className: "text-faint",
      canRelease: false,
    };
  }

  if (ep <= s.releasedThrough) {
    return {
      kind: "out",
      label: EPISODE_OUT.label,
      plain: EPISODE_OUT.plain,
      className: "text-clear",
      canRelease: false,
    };
  }

  if (!s.live) {
    return {
      kind: "show-not-live",
      label: EPISODE_HELD.label,
      plain:
        "The show is not live, so no episode can go out. Put the show live first, then release them one at a time.",
      className: "text-faint",
      canRelease: false,
    };
  }

  if (ep === s.releasedThrough + 1) {
    return {
      kind: "next",
      label: "Ready to go out",
      // Episode 1 has nothing before it, so "everything before it is already
      // out" is a claim about episodes that do not exist — and it made the
      // episode list and the season panel say different things about the same
      // episode, which is worse than either sentence on its own.
      plain:
        ep === 1
          ? `The first one. Nothing is out yet, so this is where listeners start. ${CHECKED_EVERY_TIME}`
          : `Everything before it is already out, so this one can go next. ${CHECKED_EVERY_TIME}`,
      className: "text-ochre",
      canRelease: true,
    };
  }

  return {
    kind: "waiting",
    label: EPISODE_HELD.label,
    plain: `Episode ${ep - 1} is still held back. ${ORDER_EXPLAINED}`,
    className: "text-faint",
    canRelease: false,
  };
}

// ---------------------------------------------------------------------------
// THE NEXT ONE OUT — and the button that does it
// ---------------------------------------------------------------------------

/** The button. Always names the episode, so nobody releases the wrong one. */
export function releaseAction(ep: number): string {
  return `Put episode ${ep} out`;
}

export const RELEASING = "Putting it out…";

/**
 * What the season offers next. A union rather than a nullable episode number,
 * because "nothing to release" has three quite different reasons and a screen
 * showing no button should say which one it is looking at.
 */
export type NextRelease =
  | { kind: "ready"; ep: number; label: string; action: string; plain: string }
  | { kind: "all-out"; label: string; plain: string }
  | { kind: "show-not-live"; label: string; plain: string }
  | { kind: "none-written"; label: string; plain: string };

export function nextRelease(s: SeasonRelease): NextRelease {
  if (s.written === 0) {
    return {
      kind: "none-written",
      label: "Nothing written yet",
      plain:
        "No episodes have been written for this show, so there is nothing to put in front of anyone.",
    };
  }
  if (!s.live) {
    return {
      kind: "show-not-live",
      label: "Nothing can go out yet",
      plain: `${SHOW_DRAFT.plain} ${TWO_DECISIONS_EXPLAINED}`,
    };
  }
  if (s.releasedThrough >= s.written) {
    return {
      kind: "all-out",
      label: "The whole season is out",
      plain: `All ${episodeCount(s.written)} are with listeners. There is nothing left to release until more is written.`,
    };
  }

  const ep = s.releasedThrough + 1;
  return {
    kind: "ready",
    ep,
    label: `Episode ${ep} is next`,
    action: releaseAction(ep),
    plain:
      ep === 1
        ? `The first one. Nothing is out yet, so this is the episode that opens the show. ${CHECKED_EVERY_TIME}`
        : `Episode ${ep - 1} is already out, so this one can follow it. ${CHECKED_EVERY_TIME}`,
  };
}

// ---------------------------------------------------------------------------
// PULLING SOMETHING BACK
//
// The consequence has to be readable before the click, not discovered after it.
// `unpublish_episode()` takes the tail with it every time; a producer who thinks
// they are pulling one episode and takes six off the app will not trust the
// console again.
// ---------------------------------------------------------------------------

export const PULL_EPISODE: Said = {
  label: "Pull it back",
  plain:
    "Pulling is never refused the way releasing is — it is always allowed. Everything after it comes off too, so a listener is never left at a gap. Nothing is deleted, and it can go back out in order.",
};

export function pullAction(ep: number): string {
  return `Pull episode ${ep} back`;
}

/** Exactly what comes off, named. Show this beside the button, not after it. */
export function pullWarning(ep: number, releasedThrough: number): string {
  const after = Math.max(0, releasedThrough - ep);
  if (after === 0) {
    return `Episode ${ep} comes off. It is the last one out, so nothing else changes.`;
  }
  if (after === 1) {
    return `Episode ${ep} comes off, and so does episode ${ep + 1} behind it — a listener is never left at a gap. Both can go back out in order afterwards.`;
  }
  return `Episode ${ep} comes off, and so do the ${after} episodes after it (${ep + 1}–${releasedThrough}) — a listener is never left at a gap. They can go back out in order afterwards.`;
}

/**
 * Taking the whole show down. Same words the season panel already uses, kept
 * here so the show-level and episode-level pulls stop being worded separately.
 */
export const TAKE_DOWN: Said = {
  label: "Take it back to draft",
  plain:
    "The show stops existing for listeners, and every episode that is out comes off with it. Nothing is deleted — the scripts stay written, and it can go live again.",
};

// ---------------------------------------------------------------------------
// WHO STOOD BEHIND IT — the audit line
//
// The name is the whole reason this is recorded: writing a season is the
// machine's, deciding it can go out is a person's. Dates are formatted here
// rather than left to the browser, so the same string renders on the server and
// on the client.
// ---------------------------------------------------------------------------

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07-25T23:57:03+00:00" → "25 Jul 2026". Null if it is not a date. */
export function releaseDay(at: string | null): string | null {
  if (!at) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(at);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** `who` is a person's name, already resolved — never an account id. */
export interface Stamp {
  who: string | null;
  at: string | null;
}

function stamped(verb: string, s: Stamp, bare: string): string {
  const day = releaseDay(s.at);
  if (s.who && day) return `${verb} by ${s.who} on ${day}.`;
  if (s.who) return `${verb} by ${s.who}.`;
  if (day) return `${verb} on ${day}.`;
  // `--by` is optional in the pipeline, so an episode released from a terminal
  // can genuinely have no name against it. Said plainly rather than dressed up.
  return bare;
}

export function episodeAudit(s: Stamp): string {
  return stamped("Put out", s, "Out, with nobody’s name recorded against it.");
}

export function showAudit(s: Stamp): string {
  return stamped("Put live", s, "Live, with nobody’s name recorded against it.");
}

// ---------------------------------------------------------------------------
// WHEN A RELEASE IS REFUSED
//
// Same event, same words as the season panel: the continuity check is failing
// and nothing goes out until it isn't. What changed is only that it now stands
// in front of every episode instead of in front of the season once. Deliberately
// no second vocabulary — `refusal()` in web/lib/publish.ts is still what says
// which kind of fault it is, and this only frames it.
// ---------------------------------------------------------------------------

/** The panel's existing label, exported so the two places cannot drift. */
export const CANNOT_GO_OUT = "Can’t go out";

export const RELEASE_REFUSED: Said = {
  label: CANNOT_GO_OUT,
  plain: `${CHECKER_TITLE} is failing on this season, so nothing more goes out — not this episode, not by anyone. ${CHECKED_EVERY_TIME}`,
};

/** The refusal against one episode, with the count the check reported. */
export function releaseRefused(ep: number, problems: number): Said {
  return {
    label: CANNOT_GO_OUT,
    plain: `Episode ${ep} cannot go out: ${problemCount(problems)} in the season ${
      problems === 1 ? "stands" : "stand"
    } in front of it. Continuity is what these shows are sold on, and a rule that bends under deadline is not a rule.`,
  };
}

/** The other refusal, and it is not the check's. The show simply is not live. */
export const RELEASE_NEEDS_LIVE: Said = {
  label: "Put the show live first",
  plain:
    "No episode can go out while the show is not live. Putting it live does not release anything on its own — the episodes still go out one at a time.",
};

// ---------------------------------------------------------------------------
// RELEASE SCREEN NAMES AND HEADINGS
// ---------------------------------------------------------------------------

/** In prose: "…every episode THE EPISODE LIST has written". */
export const EPISODE_LIST = "the episode list";
/** As a heading or a back link. */
export const EPISODE_LIST_TITLE = "What’s out";

export const RELEASE_HEADING = {
  show: "Is it live?",
  episodes: EPISODE_LIST_TITLE,
  next: "Next to go out",
  pull: PULL_EPISODE.label,
  refusal: CANNOT_GO_OUT,
  order: "How episodes go out",
};
