import { CHARACTER_VIEW, SPLIT_EXPLAINED } from "@/lib/words";

/**
 * How much of the season one character was in the room for, against how much
 * went on behind their back.
 *
 * This is the roster's whole argument in one line, and it has to be readable in
 * about a second — an editor scanning seventeen names is comparing shapes, not
 * doing arithmetic on pairs of numbers. Same approach as `SeasonSpine`: a div
 * and a percentage, no chart library.
 *
 * The ochre run is deliberately the smaller one on most rows. A character with
 * a sliver of ochre and a long dark tail is exactly the pitch — everything in
 * that tail is story the main show already paid to build and never told.
 */
export function KnowledgeSplit({
  witnessed,
  blind,
  explain = false,
  size = "sm",
}: {
  witnessed: number;
  blind: number;
  /** Prints the sentence that says what the two numbers mean. Once per screen. */
  explain?: boolean;
  size?: "sm" | "lg";
}) {
  const total = witnessed + blind;

  // Both flat means the roster could not be computed, not that this person was
  // present for nothing and excluded from nothing — which is impossible in a
  // season that has beats at all. Saying so beats drawing an empty bar.
  if (total === 0) {
    return (
      <p className="text-sm text-faint leading-relaxed prose-col">
        Nothing is recorded about which moments this character was there for, so
        there is no split to read.
      </p>
    );
  }

  const seen = (witnessed / total) * 100;
  const numbers = size === "lg" ? "text-3xl" : "text-xl";

  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <div>
          <div
            className={`font-mono ${numbers} leading-none tabular-nums text-ochre`}
          >
            {witnessed}
          </div>
          <div className="label mt-1.5" title={CHARACTER_VIEW.knows.plain}>
            {CHARACTER_VIEW.knows.label}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-mono ${numbers} leading-none tabular-nums`}>
            {blind}
          </div>
          <div className="label mt-1.5" title={CHARACTER_VIEW.blind.plain}>
            {CHARACTER_VIEW.blind.label}
          </div>
        </div>
      </div>

      <div
        className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-rule-strong"
        title={SPLIT_EXPLAINED}
      >
        <span className="block bg-ochre" style={{ width: `${seen}%` }} />
      </div>

      {explain && (
        <p className="text-sm text-muted leading-relaxed mt-3 prose-col">
          {SPLIT_EXPLAINED}
        </p>
      )}
    </div>
  );
}
