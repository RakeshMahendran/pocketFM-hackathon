"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { NoveltyCheck, Replay, ReplayStep } from "@/lib/replay";

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
      <div className="label text-ochre">Novelty check</div>

      <p className="mt-3 font-serif text-lg leading-snug prose-col">
        That search was not hunting. It was the scout checking whether its own
        strongest find had already been made.
      </p>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-serif text-xl">{check.title}</span>
        {check.total !== null && (
          <span className="font-mono text-sm tabular-nums text-muted">
            {check.total}/50
            {isTopScore && " — the highest score in the run"}
          </span>
        )}
        <span className="label text-halt">Blocked</span>
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
        It scored at the top of the queue and still cannot be commissioned.
        Clearance is binding, so the rule cost the scout its best candidate.
      </p>

      {href && (
        <Link
          href={href}
          className="mt-4 inline-block label hover:text-ochre transition-colors"
        >
          Read the blocked brief →
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
          Query {String(step.ordinal).padStart(2, "0")}
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
          <div className="label">Issued in the same call</div>
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
                ` · ${group(step.newUrls)} not already seen`}
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
        ? "Reasoning — the response records these steps but stores no summary for them"
        : current?.kind === "open"
          ? "Opening a page directly"
          : current?.kind === "result"
            ? "Writing the structured result"
            : "Searching";

  return (
    <section className="mt-14 border-t border-rule-strong pt-8">
      <div className="flex items-end justify-between gap-8 flex-wrap">
        <div>
          <h2 className="label">Playback</h2>
          <p className="mt-2 text-sm text-muted prose-col">
            {done
              ? "The run is played out. Every query and URL above is read from the cached response."
              : started
                ? "Order and content are the recording's. Pacing is not — the response times the run end to end, not step by step, so playback spaces the steps evenly."
                : `${replay.durationSeconds ? `${replay.durationSeconds} seconds` : "The run"} of real work, compressed to about ${PLAYBACK_MS / 1000} seconds of playback.`}
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
              ? "Replay the hunt"
              : phase === "playing"
                ? "Replaying…"
                : "Replay again"}
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
              label="Reasoning steps"
              value={group(reasoningDone)}
              of={group(replay.reasoningSteps)}
            />
            <Stat
              label="Candidates"
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
              Playback {Math.round(elapsed / 1000)}s / {PLAYBACK_MS / 1000}s
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
                      <span className="label shrink-0 w-16">Open</span>
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
                      A result the scout went back to read in full. Nothing it
                      could not open is allowed to become a citation.
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
          <h2 className="label">What the run produced</h2>

          {replay.candidates === null ? (
            <p className="mt-4 text-sm text-caution prose-col">
              The recording's search history replayed, but its structured result
              would not parse, so the candidate tally cannot be shown. The
              sourcing queue reads <span className="font-mono">corpus.json</span>,
              which was written from this run.
            </p>
          ) : (
            <>
              <p className="mt-4 font-serif text-2xl leading-snug prose-col">
                {group(replay.candidates)} candidates, graded and cleared.
              </p>
              <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2">
                <span className="text-sm text-clear">
                  {replay.clearance.greenlight} greenlight
                </span>
                <span className="text-sm text-caution">
                  {replay.clearance.fictionalize_first} fictionalize first
                </span>
                <span className="text-sm text-halt">
                  {replay.clearance.blocked} blocked
                </span>
              </div>
              {replay.novelty.length > 0 && (
                <div className="mt-7">
                  <div className="label">
                    Refused because the event was already dramatised
                  </div>
                  <ul className="mt-2.5 space-y-1.5">
                    {replay.novelty.map((n, i) => (
                      <li key={i} className="text-sm text-muted prose-col">
                        <span className="text-paper">{n.title}</span>
                        {n.total !== null && (
                          <span className="font-mono text-xs text-faint tabular-nums">
                            {" "}
                            {n.total}/50
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
                  The scout staked the run on{" "}
                  <span className="text-paper font-serif text-base">
                    {replay.winner}
                  </span>
                  . That is advisory — the editor commissions.
                </p>
              )}
            </>
          )}

          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 label">
            <span>{group(replay.searches.length)} searches</span>
            <span>{group(replay.distinctUrls)} distinct pages opened</span>
            <span>{group(replay.reasoningSteps)} reasoning steps</span>
            {replay.usage && <span>{group(replay.usage.total)} tokens</span>}
            {replay.durationSeconds !== null && (
              <span>{replay.durationSeconds}s wall clock</span>
            )}
          </div>

          <Link
            href="/sourcing"
            className="mt-10 inline-block border border-rule-strong px-5 py-2.5 text-sm rounded-sm hover:border-ochre hover:text-ochre transition-colors"
          >
            Open the sourcing queue →
          </Link>
        </div>
      )}
    </section>
  );
}
