"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { NoveltyCheck, Replay, ReplayStep } from "@/lib/replay";
import { CLEARANCE, HEADING, STORY_LIST, verdict } from "@/lib/words";

/**
 * Plays the recorded hunt back.
 *
 * The 133-second run is compressed to roughly twenty-four. Order and content
 * are the recording's; pacing is not, because the response stores only when the
 * run began and ended. So the steps are spaced by an arbitrary weighting and
 * the screen says so — the alternative is a progress bar that implies timings
 * nobody measured.
 *
 * Nothing here is a simulation of work. Every query, URL and count is read off
 * the cached response; playback only decides when to show them.
 */

const PLAYBACK_MS = 24_000;

/** Relative screen time per step. A search needs reading time; a beat does not. */
const WEIGHT: Record<ReplayStep["kind"], number> = {
  reasoning: 0.35,
  search: 3,
  open: 1,
  result: 1.6,
};

/** URLs start landing a quarter of the way into a search, once the query has been read. */
const URL_DELAY = 0.25;

function group(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function Stat({
  label,
  value,
  of,
}: {
  label: string;
  value: string;
  of?: string;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-1.5 font-mono text-2xl tabular-nums leading-none">
        {value}
        {of && <span className="text-faint text-base"> / {of}</span>}
      </div>
    </div>
  );
}

function NoveltyMoment({
  check,
  href,
  isTopScore,
}: {
  check: NoveltyCheck;
  href: string | null;
  isTopScore: boolean;
}) {
  return (
    <div className="border-l-2 border-ochre pl-5 py-1">
      <div className="label text-ochre">{HEADING.novelty}</div>

      <p className="mt-3 font-serif text-lg leading-snug prose-col">
        That search was not looking for a story. It was checking whether the best
        story it had found had already been made by somebody else.
      </p>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-serif text-xl">{check.title}</span>
        {check.total !== null && (
          <span className="text-sm text-muted">
            <span className={verdict(check.total).className}>
              {verdict(check.total).word}
            </span>
            <span className="font-mono tabular-nums">
              {" "}
              — {check.total} out of 50
            </span>
            {isTopScore && ", the best in the whole search"}
          </span>
        )}
        <span className="label text-halt" title={CLEARANCE.blocked.plain}>
          {CLEARANCE.blocked.short}
        </span>
      </div>

      {check.priorAdaptations.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {check.priorAdaptations.map((p, i) => (
            <li key={i} className="text-sm text-muted flex gap-2 prose-col">
              <span aria-hidden>—</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}

      {check.reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {check.reasons.map((r, i) => (
            <li key={i} className="text-sm text-faint flex gap-2 prose-col">
              <span aria-hidden>—</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-sm text-muted prose-col">
        It rated higher than anything else in the queue and still cannot be made.
        That rule is not a suggestion — it cost this search its own best story.
      </p>

      {href && (
        <Link
          href={href}
          className="mt-4 inline-block label hover:text-ochre transition-colors"
        >
          Read why we cannot make it →
        </Link>
      )}
    </div>
  );
}

function SearchRow({
  step,
  shown,
  finished,
  novelty,
  noveltyHref,
  isTopScore,
}: {
  step: Extract<ReplayStep, { kind: "search" }>;
  shown: number;
  finished: boolean;
  novelty: NoveltyCheck | null;
  noveltyHref: string | null;
  isTopScore: boolean;
}) {
  const tail = step.urls.slice(Math.max(0, shown - 3), shown);

  return (
    <li className="border-t border-rule py-6">
      <div className="flex items-baseline gap-4">
        <span className="label shrink-0 w-16 tabular-nums">
          Search {String(step.ordinal).padStart(2, "0")}
        </span>
        <p className="font-mono text-sm text-paper flex-1 min-w-0 break-words leading-relaxed">
          {step.query}
        </p>
        <span className="label shrink-0 tabular-nums">
          {group(shown)} / {group(step.urls.length)} pages
        </span>
      </div>

      {step.alsoIssued.length > 0 && (
        <div className="mt-4 pl-20">
          <div className="label">Searched for at the same time</div>
          <div className="mt-1.5 space-y-1">
            {step.alsoIssued.map((q, i) => (
              <p key={i} className="font-mono text-xs text-faint break-words">
                {q}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 pl-20">
        {finished ? (
          <details className="group">
            <summary className="label cursor-pointer hover:text-ochre transition-colors list-none">
              {group(step.urls.length)} pages opened
              {step.newUrls < step.urls.length &&
                ` · ${group(step.newUrls)} it had not seen before`}
              <span className="group-open:hidden"> ▸</span>
              <span className="hidden group-open:inline"> ▾</span>
            </summary>
            <ul className="mt-2 max-h-64 overflow-y-auto space-y-0.5 pr-2">
              {step.urls.map((u, i) => (
                <li key={i}>
                  <a
                    href={u}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-mono text-xs text-faint hover:text-ochre transition-colors break-all"
                  >
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <div
            className="h-[3.75rem] overflow-hidden font-mono text-xs text-faint leading-5"
            aria-hidden
          >
            {tail.map((u, i) => (
              <div key={i} className="truncate">
                {u}
              </div>
            ))}
          </div>
        )}
      </div>

      {novelty && (
        <div className="mt-6 pl-20">
          <NoveltyMoment
            check={novelty}
            href={noveltyHref}
            isTopScore={isTopScore}
          />
        </div>
      )}
    </li>
  );
}

export function ScoutReplay({
  replay,
  noveltyHref,
}: {
  replay: Replay;
  /** Brief for the blocked candidate, if the corpus still carries that row. */
  noveltyHref: string | null;
}) {
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);

  const cues = useMemo(() => {
    const units = replay.steps.reduce((sum, s) => sum + WEIGHT[s.kind], 0) || 1;
    let at = 0;
    return replay.steps.map((s) => {
      const start = at;
      at += (WEIGHT[s.kind] / units) * PLAYBACK_MS;
      return { start, end: at };
    });
  }, [replay.steps]);

  useEffect(() => {
    if (phase !== "playing") return;
    const started = performance.now();
    // 60ms rather than a frame loop: these are counters and a query log, not an
    // animation, and sixteen updates a second is more than the eye resolves.
    const id = setInterval(() => {
      const e = performance.now() - started;
      if (e >= PLAYBACK_MS) {
        setElapsed(PLAYBACK_MS);
        setPhase("done");
        return;
      }
      setElapsed(e);
    }, 60);
    return () => clearInterval(id);
  }, [phase]);

  function run() {
    setElapsed(0);
    // Someone who has asked the OS to stop animating things should not be made
    // to sit through twenty-four seconds of one.
    const still =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      setElapsed(PLAYBACK_MS);
      setPhase("done");
      return;
    }
    setPhase("playing");
  }

  function skip() {
    setElapsed(PLAYBACK_MS);
    setPhase("done");
  }

  const started = phase !== "idle";
  const done = phase === "done";

  // Once the playback is over every step is complete by definition. Reading the
  // clock instead would leave the last step a rounding error short of done.
  const clock = done ? Number.POSITIVE_INFINITY : elapsed;

  const progressOf = (i: number) => {
    const { start, end } = cues[i];
    return end > start ? clamp01((clock - start) / (end - start)) : 1;
  };

  const urlsShown = (i: number, of: number) =>
    Math.round(clamp01((progressOf(i) - URL_DELAY) / (1 - URL_DELAY)) * of);

  let pages = 0;
  let searchesDone = 0;
  let reasoningDone = 0;
  const visible: number[] = [];

  replay.steps.forEach((s, i) => {
    const p = progressOf(i);
    if (p <= 0) return;
    if (s.kind === "search") {
      visible.push(i);
      if (s.urls.length) {
        pages += (urlsShown(i, s.urls.length) / s.urls.length) * s.newUrls;
      }
      if (p >= 1) searchesDone += 1;
    } else if (s.kind === "reasoning" && p > 0.5) {
      reasoningDone += 1;
    } else if (s.kind === "open") {
      visible.push(i);
    }
  });

  const totalPages = replay.searches.reduce((n, s) => n + s.newUrls, 0);
  const current = replay.steps[cues.findIndex((c) => clock < c.end)];
  const novelty = replay.novelty[0] ?? null;

  const status =
    !started || done
      ? null
      : current?.kind === "reasoning"
        ? "Thinking — the recording notes that it stopped to think here, but does not keep what it thought"
        : current?.kind === "open"
          ? "Opening a page to read it properly"
          : current?.kind === "result"
            ? "Writing up what it found"
            : "Searching";

  // No heading of its own. The page above already says what this is and what
  // pressing play will show — two headings back to back saying the same thing
  // read as a mistake.
  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-8 flex-wrap">
        <div>
          <p className="text-sm text-muted prose-col">
            {done
              ? "That is the whole search. Every line searched for and every page opened above is read straight from the recording — none of it was made up for this screen."
              : started
                ? "What happens, and the order it happens in, is exactly what the recording holds. The timing is not: the recording only knows when the whole search started and finished, not how long each step took, so the steps are spaced evenly here."
                : `${replay.durationSeconds ? `${replay.durationSeconds} seconds of real searching` : "The real search"}, squeezed into about ${PLAYBACK_MS / 1000} seconds to watch.`}
          </p>
        </div>

        <div className="flex items-center gap-5 shrink-0">
          {phase === "playing" && (
            <button
              onClick={skip}
              className="label hover:text-ochre transition-colors"
            >
              Skip to the end
            </button>
          )}
          <button
            onClick={run}
            disabled={phase === "playing"}
            className="border border-ochre/50 text-ochre px-5 py-2.5 text-sm rounded-sm hover:bg-ochre/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {phase === "idle"
              ? "Play the search"
              : phase === "playing"
                ? "Playing…"
                : "Play it again"}
          </button>
        </div>
      </div>

      {started && (
        <>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-6 border-y border-rule py-6">
            <Stat
              label="Searches"
              value={group(searchesDone)}
              of={group(replay.searches.length)}
            />
            <Stat
              label="Pages opened"
              value={group(pages)}
              of={group(totalPages)}
            />
            <Stat
              label="Thinking steps"
              value={group(reasoningDone)}
              of={group(replay.reasoningSteps)}
            />
            <Stat
              label="Stories found"
              value={done && replay.candidates !== null ? group(replay.candidates) : "—"}
            />
          </div>

          <div className="mt-4 flex items-center gap-4">
            <span
              className="h-px flex-1 bg-rule relative overflow-hidden"
              role="presentation"
            >
              <span
                className="absolute inset-y-0 left-0 bg-ochre/70"
                style={{ width: `${(elapsed / PLAYBACK_MS) * 100}%` }}
              />
            </span>
            <span className="label tabular-nums shrink-0">
              {Math.round(elapsed / 1000)}s of {PLAYBACK_MS / 1000}s watched
            </span>
          </div>

          {status && (
            <p className="mt-4 text-sm text-faint" aria-live="polite">
              {status}
            </p>
          )}

          <ol className="mt-8">
            {visible.map((i) => {
              const s = replay.steps[i];
              if (s.kind === "open") {
                return (
                  <li key={i} className="border-t border-rule py-6">
                    <div className="flex items-baseline gap-4">
                      <span className="label shrink-0 w-16">Read</span>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-mono text-sm text-muted hover:text-ochre transition-colors flex-1 min-w-0 break-all"
                      >
                        {s.url}
                      </a>
                    </div>
                    <p className="mt-3 pl-20 text-sm text-faint prose-col">
                      A page it went back to read in full. If it could not open
                      a page, that page is not allowed to be used as a source.
                    </p>
                  </li>
                );
              }
              if (s.kind !== "search") return null;
              return (
                <SearchRow
                  key={i}
                  step={s}
                  shown={urlsShown(i, s.urls.length)}
                  finished={done}
                  novelty={
                    novelty && novelty.ordinal === s.ordinal && progressOf(i) >= 1
                      ? novelty
                      : null
                  }
                  noveltyHref={noveltyHref}
                  isTopScore={
                    novelty?.total !== null &&
                    novelty?.total === replay.topScore
                  }
                />
              );
            })}
          </ol>
        </>
      )}

      {done && (
        <div className="mt-10 border-t border-rule-strong pt-8">
          <h2 className="label">What the search came back with</h2>

          {replay.candidates === null ? (
            <p className="mt-4 text-sm text-caution prose-col">
              The searching played back fine, but the write-up at the end of the
              recording is damaged, so we cannot show how many stories it found.
              The stories this search produced are still in {STORY_LIST}.
            </p>
          ) : (
            <>
              <p className="mt-4 font-serif text-2xl leading-snug prose-col">
                {group(replay.candidates)} stories found, rated, and checked
                against what we are allowed to make.
              </p>
              <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2">
                <span
                  className="text-sm text-clear"
                  title={CLEARANCE.greenlight.plain}
                >
                  {replay.clearance.greenlight} safe to make
                </span>
                <span
                  className="text-sm text-caution"
                  title={CLEARANCE.fictionalize_first.plain}
                >
                  {replay.clearance.fictionalize_first} need the names changed
                </span>
                <span
                  className="text-sm text-halt"
                  title={CLEARANCE.blocked.plain}
                >
                  {replay.clearance.blocked} we cannot make
                </span>
              </div>
              {replay.novelty.length > 0 && (
                <div className="mt-7">
                  <div className="label">
                    Turned down because somebody has already made it
                  </div>
                  <ul className="mt-2.5 space-y-1.5">
                    {replay.novelty.map((n, i) => (
                      <li key={i} className="text-sm text-muted prose-col">
                        <span className="text-paper">{n.title}</span>
                        {n.total !== null && (
                          <span className="text-xs text-faint">
                            {" "}
                            {verdict(n.total).word},{" "}
                            <span className="font-mono tabular-nums">
                              {n.total} out of 50
                            </span>
                          </span>
                        )}
                        {" — "}
                        {n.priorAdaptations[0]}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {replay.winner && (
                <p className="mt-6 text-sm text-muted prose-col">
                  Out of everything it found, its own pick was{" "}
                  <span className="text-paper font-serif text-base">
                    {replay.winner}
                  </span>
                  . That is a recommendation, nothing more — you decide what
                  gets made.
                </p>
              )}
            </>
          )}

          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 label">
            <span>{group(replay.searches.length)} searches</span>
            <span>{group(replay.distinctUrls)} different pages opened</span>
            <span>{group(replay.reasoningSteps)} thinking steps</span>
            {replay.durationSeconds !== null && (
              <span>{replay.durationSeconds} seconds start to finish</span>
            )}
          </div>

          {/*
            Not deleted, just not first: the usage figures are how the run gets
            costed, and somebody does need them. They are simply not what an
            editor reads a search summary for.
          */}
          {replay.usage && (
            <details className="mt-4">
              <summary className="label cursor-pointer hover:text-ochre transition-colors">
                For whoever runs it
              </summary>
              <p className="mt-2 font-mono text-xs text-faint tabular-nums">
                {group(replay.usage.total)} tokens · {group(replay.usage.input)}{" "}
                in · {group(replay.usage.output)} out
              </p>
            </details>
          )}

          <Link
            href="/sourcing"
            className="mt-10 inline-block border border-rule-strong px-5 py-2.5 text-sm rounded-sm hover:border-ochre hover:text-ochre transition-colors"
          >
            Open {STORY_LIST} →
          </Link>
        </div>
      )}
    </section>
  );
}
