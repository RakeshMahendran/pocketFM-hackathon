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
    short: "Can't make this",
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

/** The rubric's five measures, said the way an editor would say them. */
export const MEASURES: Record<string, { label: string; asks: string }> = {
  engine_longevity: {
    label: "Won't run out",
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
    label: "Two sides",
    asks: "Is there an opponent, not just a problem?",
  },
  cast_depth: {
    label: "People to spin off",
    asks: "How many others could carry their own show later?",
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

/** Why 38. Stated once, on screen, so the bar is not folklore. */
export const BAR_EXPLAINED =
  "Anything under 38 out of 50 is dropped before it reaches you.";

// ---------------------------------------------------------------------------
// STATE — where a story sits in the editor's own process
// ---------------------------------------------------------------------------

export function stateOf(c: Candidate): { label: string; className: string } {
  if (c.origin === "commissioned")
    return { label: "Already being made", className: "text-clear" };
  if (c.origin === "also-considered")
    return { label: "Not chosen", className: "text-faint" };
  return c.winner
    ? { label: "Recommended", className: "text-ochre" }
    : { label: "New", className: "text-muted" };
}

// ---------------------------------------------------------------------------
// SECTION HEADINGS
// ---------------------------------------------------------------------------

export const HEADING = {
  mechanism: "What actually happened",
  engine: "Why it won't run out of story",
  sells: "The feeling a listener recognises",
  whyNot: "Why we didn't pick this one",
  cast: "Who's in it",
  score: "How it rated",
  clearanceReasons: "What the lawyers would say",
  novelty: "Has anyone made this before?",
  sources: "Where this came from",
  commission: "Make this one",
};

// ---------------------------------------------------------------------------
// CATEGORY — the eight hunt categories arrive SHOUTING
// ---------------------------------------------------------------------------

export function category(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.toLowerCase().replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
