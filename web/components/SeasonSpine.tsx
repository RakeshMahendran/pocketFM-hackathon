import Link from "next/link";

import { listenMinutes } from "@/components/EpisodeScript";
import { HOOK_ABBR, HOOK_TYPES, type EpisodeRef, type SpineEntry } from "@/lib/serials";

/**
 * The hook ladder and the status curve, drawn once.
 *
 * This is the answer to the only question a commissioning editor has about a
 * generated season: does it have shape? Fourteen paragraphs of episode summary
 * cannot be read for shape — a rising bar with a hook label under it can be
 * read for it in about two seconds. Everything else on the season page is
 * detail hung off this.
 *
 * Deliberately not a chart library: fourteen divs and a percentage height.
 */

/** Bars are read against each other, so the tallest sets the scale. */
function scaleOf(spine: SpineEntry[]): number {
  return Math.max(1, ...spine.map((s) => s.status ?? 0));
}

function Bar({ entry, scale }: { entry: SpineEntry; scale: number }) {
  if (entry.status === null) {
    return (
      <span className="block w-full h-full border-b border-dashed border-rule-strong" />
    );
  }
  const pct = (entry.status / scale) * 100;
  return (
    <span
      className="block w-full bg-ochre rounded-t-[1px]"
      // Opacity tracks standing as well as height: the last episode should look
      // like the last episode even at a glance across the whole strip.
      style={{ height: `${pct}%`, opacity: 0.3 + 0.7 * (entry.status / scale) }}
    />
  );
}

function Column({
  entry,
  scale,
  href,
}: {
  entry: SpineEntry;
  scale: number;
  href: string | null;
}) {
  const hook = entry.hookType ?? entry.hookRaw;
  const abbr = entry.hookType
    ? HOOK_ABBR[entry.hookType]
    : (entry.hookRaw?.slice(0, 3).toUpperCase() ?? "—");

  const inner = (
    <>
      <span className="flex-1 flex items-end w-full px-1.5">
        <Bar entry={entry} scale={scale} />
      </span>
      <span className="font-mono text-[0.6875rem] text-muted tabular-nums mt-2">
        {String(entry.ep).padStart(2, "0")}
      </span>
      <span
        className={`font-mono text-[0.625rem] tracking-wider mt-1 ${
          entry.hookRepeats ? "text-caution" : "text-faint"
        }`}
      >
        {abbr}
      </span>
      <span className="h-2 mt-1 flex items-center">
        {entry.paysOff && (
          <span className="w-1 h-1 rounded-full bg-ochre" aria-hidden="true" />
        )}
      </span>
    </>
  );

  const title = [
    `Episode ${entry.ep}${hook ? ` — ${hook}` : ""}`,
    entry.status !== null ? `status ${entry.status}` : null,
    entry.hookRepeats ? "hook type already used this season" : null,
    entry.turn,
    entry.paysOff ? `Pays off: ${entry.paysOff}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const className =
    "flex flex-col items-center h-full pt-2 border-l border-rule first:border-l-0";

  return href ? (
    <Link href={href} title={title} className={`${className} hover:bg-raised transition-colors`}>
      {inner}
    </Link>
  ) : (
    <div title={title} className={className}>
      {inner}
    </div>
  );
}

function Ladder({
  spine,
  episodes,
  id,
}: {
  spine: SpineEntry[];
  episodes: Map<number, EpisodeRef>;
  id: string;
}) {
  return (
    <ol className="mt-10 border-t border-rule">
      {spine.map((e) => {
        const written = episodes.get(e.ep);
        return (
        <li
          key={e.ep}
          className="border-b border-rule py-5 grid sm:grid-cols-[3.5rem_1fr] gap-x-5 gap-y-2"
        >
          <div className="pt-0.5">
            {written ? (
              <Link
                href={`/serials/${id}/${e.ep}`}
                className="font-mono text-sm text-muted hover:text-ochre transition-colors tabular-nums"
              >
                {String(e.ep).padStart(2, "0")}
              </Link>
            ) : (
              <span className="font-mono text-sm text-faint tabular-nums">
                {String(e.ep).padStart(2, "0")}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={`label ${e.hookRepeats ? "text-caution" : "text-ochre"}`}
                title={e.hookRepeats ? "Hook type already used this season" : undefined}
              >
                {e.hookType ?? e.hookRaw ?? "hook not stated"}
              </span>
              {e.status !== null && (
                <span className="label">standing {e.status}</span>
              )}
              {!written && <span className="label text-caution">not written</span>}
            </div>

            {written && (
              <h3 className="mt-2">
                <Link
                  href={`/serials/${id}/${e.ep}`}
                  className="font-serif text-xl tracking-tight hover:text-ochre transition-colors"
                >
                  {written.title ?? `Episode ${e.ep}`}
                </Link>
                <span className="label ml-3 whitespace-nowrap">
                  ~{listenMinutes(written.words)} min
                </span>
              </h3>
            )}

            {e.turn ? (
              <p className="font-serif text-[1.0625rem] leading-relaxed mt-2 prose-col">
                {e.turn}
              </p>
            ) : (
              <p className="text-sm text-faint mt-2">No turn recorded for this episode.</p>
            )}

            {e.endsOn && (
              <p className="text-sm text-muted leading-relaxed mt-3 prose-col border-l border-rule-strong pl-4">
                <span className="label block mb-1">Ends on</span>
                {e.endsOn}
              </p>
            )}

            {e.paysOff && (
              <p className="text-sm text-muted leading-relaxed mt-3 prose-col border-l border-ochre/50 pl-4">
                <span className="label block mb-1 text-ochre">Pays off</span>
                {e.paysOff}
              </p>
            )}
          </div>
        </li>
        );
      })}
    </ol>
  );
}

export function SeasonSpine({
  id,
  spine,
  episodes,
}: {
  id: string;
  spine: SpineEntry[];
  episodes: EpisodeRef[];
}) {
  // No plan is not the same as no season: episodes can exist without one, and
  // they are still the thing worth reading. Only the shape is unavailable.
  if (!spine.length) {
    return (
      <div>
        <p className="text-sm text-muted leading-relaxed prose-col">
          This dossier records no <span className="font-mono">season</span> plan,
          so there is no hook ladder and no status curve to read.
          {episodes.length > 0 && " The episodes below were written without one."}
        </p>
        {episodes.length > 0 && (
          <ul className="mt-6 border-t border-rule">
            {episodes.map((e) => (
              <li key={e.ep} className="border-b border-rule py-4 flex gap-5 items-baseline">
                <span className="font-mono text-sm text-faint tabular-nums w-8">
                  {String(e.ep).padStart(2, "0")}
                </span>
                <Link
                  href={`/serials/${id}/${e.ep}`}
                  className="font-serif text-lg hover:text-ochre transition-colors"
                >
                  {e.title ?? `Episode ${e.ep}`}
                </Link>
                <span className="label ml-auto">~{listenMinutes(e.words)} min</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const scale = scaleOf(spine);
  const written = new Map(episodes.map((e) => [e.ep, e]));
  const distinctHooks = new Set(spine.map((e) => e.hookType).filter(Boolean)).size;
  const repeats = spine.filter((e) => e.hookRepeats).length;
  const payoffs = spine.filter((e) => e.paysOff).length;
  const opens = spine[0]?.status;
  const closes = spine[spine.length - 1]?.status;
  const planned = new Set(spine.map((e) => e.ep));
  const unplanned = episodes.filter((e) => !planned.has(e.ep));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-6 flex-wrap">
        <p className="text-sm text-muted leading-relaxed max-w-xl">
          Bar height is the protagonist&rsquo;s standing, {opens ?? "—"} at the open
          and {closes ?? "—"} at the close. Under each column is the hook the
          episode ends on; a dot marks an episode that settles an earlier debt.
        </p>
        <div className="label whitespace-nowrap">
          {distinctHooks} of {HOOK_TYPES.length} hook types · {repeats} repeated ·{" "}
          {payoffs} payoffs
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <div
          className="grid h-44 border border-rule bg-surface"
          style={{
            gridTemplateColumns: `repeat(${spine.length}, minmax(3.25rem, 1fr))`,
            minWidth: `${spine.length * 3.25}rem`,
          }}
        >
          {spine.map((e) => (
            <Column
              key={e.ep}
              entry={e}
              scale={scale}
              href={written.has(e.ep) ? `/serials/${id}/${e.ep}` : null}
            />
          ))}
        </div>
      </div>

      {repeats > 0 && (
        <p className="label mt-3 text-caution">
          Amber hooks repeat a type used earlier in the season.
        </p>
      )}

      {unplanned.length > 0 && (
        <p className="label mt-3 text-caution">
          Written but absent from the plan:{" "}
          {unplanned.map((e) => `ep${e.ep}`).join(", ")}
        </p>
      )}

      <Ladder spine={spine} episodes={written} id={id} />
    </div>
  );
}
