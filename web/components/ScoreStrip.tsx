import { SCORE_LABELS, type Scores } from "@/lib/types";

/**
 * The five sub-scores as one word-sized mark.
 *
 * The order is fixed and must stay fixed. A strip sorted by value inside each
 * row would look tidier and would destroy the only thing this earns its space
 * for: slot 3 is scannable down thirty rows precisely because slot 3 is the
 * same measure in every one of them. `tests/e2e/sourcing-cinema.spec.ts` asserts
 * the order for that reason.
 *
 * Geometry from Stephen Few's bullet-graph spec — a track, a fill, and nothing
 * else. No border, no ticks, no axis, no label per row: the axes are named once
 * in the header and again on hover, never thirty times.
 *
 * `engine_longevity` leads because it is the one axis allowed to refuse a
 * winner outright in `src/discovery/search.py:_check_winner()`, and the
 * tie-break in `_rank()`.
 */

export const AXES = [
  "engine_longevity",
  "hook_density",
  "emotional_immediacy",
  "conflict",
  "cast_depth",
] as const;

/** Short names for the `data-axis` hook and the column header. */
const SLUG: Record<(typeof AXES)[number], string> = {
  engine_longevity: "engine",
  hook_density: "hook",
  emotional_immediacy: "feeling",
  conflict: "conflict",
  cast_depth: "cast",
};

export const AXIS_ORDER = AXES.map((a) => SLUG[a]);

const MAX = 10;

export function ScoreStrip({
  scores,
  sortedBy = null,
  size = "sm",
}: {
  scores: Scores | null;
  /** The axis the list is ordered on. The only thing here that gets the accent. */
  sortedBy?: (typeof AXES)[number] | null;
  size?: "sm" | "lg";
}) {
  const h = size === "lg" ? 26 : 19;
  const w = size === "lg" ? 7 : 5;

  return (
    <div
      className="flex items-end justify-end"
      style={{ gap: w - 1, height: h }}
      role="img"
      aria-label={
        scores
          ? AXES.map((a) => `${SCORE_LABELS[a]} ${scores[a] ?? 0} of ${MAX}`).join(", ")
          : "not scored"
      }
    >
      {AXES.map((axis) => {
        const v = scores?.[axis] ?? 0;
        // Floor the fill so a real score never renders as an empty slot — a
        // zero-height bar is indistinguishable from a missing one.
        const fill = Math.max(v > 0 ? 3 : 0, Math.round((v / MAX) * h));
        return (
          <span
            key={axis}
            data-testid="axis"
            data-axis={SLUG[axis]}
            title={`${SCORE_LABELS[axis]} · ${v} of ${MAX}`}
            className="flex items-end rounded-[2px] bg-white/10"
            style={{ width: w, height: h }}
          >
            <span
              className={`rounded-[2px] ${
                axis === sortedBy ? "bg-gold" : "bg-warm-paper"
              }`}
              style={{ width: w, height: fill }}
            />
          </span>
        );
      })}
    </div>
  );
}
