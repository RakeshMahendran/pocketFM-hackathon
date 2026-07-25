/**
 * Mirrors the `_CANDIDATE` schema in src/discovery/search.py.
 *
 * That schema is strict, so a real corpus always carries every field. These
 * types are wider than it on purpose: the four story dossiers committed before
 * the pipeline existed are missing fields the schema now requires, and the
 * queue has to render them rather than crash on them.
 */

export type ClearanceStatus = "greenlight" | "fictionalize_first" | "blocked";
export type SpinoffPotential = "high" | "med" | "low";

/** Where a row came from. Shown in the UI — an assembled row is not real output. */
export type Origin = "corpus" | "commissioned" | "also-considered";

export interface CastMember {
  name_or_role: string;
  motive: string;
  spinoff_potential: SpinoffPotential | null;
}

export interface Scores {
  engine_longevity: number;
  hook_density: number;
  emotional_immediacy: number;
  conflict: number;
  cast_depth: number;
  total: number;
}

export const SCORE_LABELS: Record<keyof Omit<Scores, "total">, string> = {
  engine_longevity: "Engine longevity",
  hook_density: "Hook density",
  emotional_immediacy: "Emotional immediacy",
  conflict: "Conflict",
  cast_depth: "Cast depth",
};

export interface Clearance {
  status: ClearanceStatus;
  reasons: string[];
}

export interface Candidate {
  id: string;
  title: string;
  category: string | null;
  one_line: string;
  year: string | null;
  where: string | null;
  mechanism: string | null;
  engine: string | null;
  episode_estimate: number | null;
  cast: CastMember[];
  scores: Scores | null;
  clearance: Clearance | null;
  prior_adaptations: string[];
  sources: string[];
  domain: string | null;
  /** The scout's own pick. Advisory — the editor commissions. */
  winner: boolean;
  why_this_sells: string | null;
  /** Why this one lost. The most-read text on a rejected row after the title. */
  why_not: string | null;

  origin: Origin;
  /** Fields absent from the source data. The UI says so rather than inventing them. */
  missing: string[];
}

export interface Corpus {
  candidates: Candidate[];
  /** Whether this is real pipeline output or assembled from committed stories. */
  assembled: boolean;
  builtAt: string | null;
  /** Things the reader should know before trusting the screen. */
  warnings: string[];
}

export const CLEARANCE_ORDER: ClearanceStatus[] = [
  "greenlight",
  "fictionalize_first",
  "blocked",
];

/** Clearance is binding, not advisory. A blocked candidate cannot be commissioned. */
export function isCommissionable(c: Candidate): boolean {
  return c.clearance?.status !== "blocked";
}

export function totalOf(c: Candidate): number | null {
  return c.scores?.total ?? null;
}
