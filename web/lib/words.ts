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

export const HEADING = {
  mechanism: "What actually happened",
  engine: "Why it won’t run out of story",
  sells: "Why people will listen",
  whyNot: "Why we didn’t pick this one",
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

// ---------------------------------------------------------------------------
// CATEGORY — the eight hunt categories arrive SHOUTING
// ---------------------------------------------------------------------------

export function category(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.toLowerCase().replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
