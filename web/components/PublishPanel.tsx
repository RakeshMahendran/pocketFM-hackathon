import Link from "next/link";

import { goToEpisode } from "@/components/pathWords";
import {
  EPISODE_LIST_ANCHOR,
  editorName,
  refusedRelease,
} from "@/components/ReleaseControls";
import {
  publishSeason,
  unpublishSeason,
  type Checks,
  type Finding,
  type PublishState,
} from "@/lib/publish";
import {
  CANNOT_GO_OUT,
  EPISODE_LIST_TITLE,
  RELEASE_HEADING,
  RELEASE_NEEDS_LIVE,
  RELEASE_NOT_A_PUSH,
  SHOW_DRAFT,
  TAKE_DOWN,
  type SeasonRelease,
  nextRelease,
  seasonStanding,
  showAudit,
} from "@/lib/words";

/**
 * The two decisions this page exists to support, in one panel.
 *
 * A show going live means it exists for listeners at all; an episode going out
 * is the thing that actually earns. This panel used to conflate them — it took
 * the number of episodes WRITTEN and reported it as the number out, so a season
 * with three episodes in front of listeners announced fourteen. Every count here
 * now comes from `seasonStanding()`, which is handed `releasedThrough` and
 * `written` separately and cannot mix them up.
 *
 * Three refusals, and they are not the same news. A season whose continuity
 * checks fail cannot be published by anyone — the same rule as a `blocked` story
 * that cannot be commissioned, at the other end of the pipeline. A season whose
 * checks could not be run cannot be published either: an unanswered check is not
 * a passed one, and a screen that reassures on a result it never got is worse
 * than one that refuses. The third is not a refusal at all — a live show with
 * nothing out yet is where every show starts, and rendering it in the colour of
 * a failure teaches a producer to distrust the one screen they act from.
 *
 * Advisories are shown above the button rather than hidden behind it: only a
 * person reading the prose can settle them, so they should be read before
 * somebody puts their name to it — and `publish_episode()` re-runs them on every
 * release, so they belong beside the episode button too, not only the season's.
 */

/**
 * What the season is being refused for.
 *
 * Only a contradictory-beat finding is a contradiction. The other fatal class
 * is a malformed record — a name in a scene that belongs to no character, a
 * moment pointing at no source — and telling a producer the season contradicts
 * itself when the fault is data entry sends them to re-read scripts that are
 * fine. Same rule the validator panel keeps between `error` and `warn`.
 */
function refusal(fatal: Finding[]): string {
  const contradicts = fatal.some((f) => f.kind === "contradiction");
  const alsoRecord = fatal.some((f) => f.kind !== "contradiction");
  if (contradicts && alsoRecord) {
    return "This season contradicts itself, and the record underneath it has gaps besides — who was in which scene, and where each moment came from.";
  }
  if (contradicts) return "This season contradicts itself.";
  return "The record underneath this season has gaps: who was in which scene, and where each moment came from. The writing may be perfectly sound; what was written down about it is not.";
}

/** One finding. Anything the screen could not put into words is shown as it came. */
function Said({ f }: { f: Finding }) {
  return (
    <span className="prose-col">
      {f.said}
      {f.kind === "unclassified" && f.raw && (
        <span className="block mt-1 font-mono text-xs break-words">{f.raw}</span>
      )}
    </span>
  );
}

/** Roughly 6 minutes an episode, per the length rules the writer works to. */
function listeningTime(episodes: number): string {
  const minutes = episodes * 6;
  if (minutes < 60) return `about ${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `about ${h}h ${m}m` : `about ${h}h`;
}

/**
 * The advisories, wherever a decision is about to be made on them.
 *
 * Shown on both sides of the panel because both decisions carry them: the
 * season's were recorded when someone stood behind it, and the check runs again
 * before every single episode.
 */
function Advisories({ checks }: { checks: Checks }) {
  if (checks.advisory.length === 0) return null;
  return (
    <div className="mt-4 border-l-2 border-caution/60 pl-4">
      <div className="label text-caution">
        Worth reading first — {checks.advisory.length}
      </div>
      <ul className="mt-2 space-y-1.5">
        {checks.advisory.slice(0, 4).map((a, i) => (
          <li key={i} className="text-sm text-faint">
            <Said f={a} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-faint">
        These need someone to read the scripts to settle, so they do not stop
        you — but they are your call, not the checker’s.
      </p>
    </div>
  );
}

export function PublishPanel({
  storyId,
  state,
  checks,
}: {
  storyId: string;
  state: PublishState;
  checks: Checks;
}) {
  // The one place the two numbers meet, and they are kept apart: `written` is
  // counted off disk, `releasedThrough` is the unbroken run a listener can
  // reach. Everything the panel says is derived from this pair.
  const season: SeasonRelease = {
    live: state.live,
    releasedThrough: state.releasedThrough,
    written: state.episodeCount,
  };
  const standing = seasonStanding(season);
  const next = nextRelease(season);

  const unavailable = checks.unavailable;
  const blocked = unavailable !== null || checks.fatal.length > 0;

  if (state.live) {
    const preLaunch = state.releasedThrough === 0;
    // Only asked when there is an episode to ask about: a season already fully
    // out has nothing for the check to stand in front of.
    const refused = next.kind === "ready" ? refusedRelease(checks, next.ep) : null;
    return (
      <div
        className={`border rounded-sm p-5 ${
          // Pre-launch is deliberate, not broken, so it is marked as a state
          // waiting on someone rather than one that failed.
          preLaunch ? "border-ochre/40 bg-ochre/5" : "border-clear/40 bg-clear/5"
        }`}
      >
        <div className={`label ${standing.className}`}>{standing.label}</div>
        <p className="mt-2 text-sm text-muted prose-col leading-relaxed">
          {standing.plain}
        </p>
        <p className="mt-2 label">
          {showAudit({ who: editorName(state.by), at: state.at })}
        </p>

        {/*
          This panel says what the state IS; the episode row owns the act of
          changing it. Both used to render a live "Put episode 4 out" — two
          controls for one action on one screen, and a reader cannot tell
          whether they are the same button. The row wins because it sits beside
          the episode it releases, so the button is never ambiguous about which
          one it means.
          `next.plain` and RELEASE_NOT_A_PUSH are dropped with it: the row
          prints both already, and a rule stated twice on one page is the thing
          that made these screens exhausting to read.
        */}
        <div className="mt-5 border-t border-rule pt-4">
          <div className="label">{RELEASE_HEADING.next}</div>
          {refused ? (
            <>
              <div className="label mt-2 text-halt">{refused.label}</div>
              <p className="mt-1.5 text-sm text-muted prose-col leading-relaxed">
                {refused.plain}
              </p>
            </>
          ) : (
            <>
              <div
                className={`label mt-2 ${next.kind === "ready" ? "text-ochre" : ""}`}
              >
                {next.label}
              </div>
              {next.kind === "ready" && (
                <>
                  <Link
                    href={`#${EPISODE_LIST_ANCHOR}`}
                    className="mt-3 inline-block border border-rule-strong px-4 py-2 text-sm rounded-sm hover:border-ochre hover:text-ochre transition-colors"
                  >
                    {goToEpisode(next.ep)} →
                  </Link>
                  <Advisories checks={checks} />
                </>
              )}
            </>
          )}
        </div>

        <div className="mt-5 border-t border-rule pt-4 flex items-baseline justify-between gap-4 flex-wrap">
          <Link
            href={`#${EPISODE_LIST_ANCHOR}`}
            className="label text-ochre hover:text-paper transition-colors"
          >
            {EPISODE_LIST_TITLE} →
          </Link>
          <form action={unpublishSeason}>
            <input type="hidden" name="storyId" value={storyId} />
            <button
              type="submit"
              className="label hover:text-halt transition-colors"
              title={TAKE_DOWN.plain}
            >
              {TAKE_DOWN.label}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Not live. Both refusals stop the button, and they are not the same news. A
  // season the check condemned is the season's problem; a check that never ran
  // is the machine's, and colouring it like a failed season sends a producer to
  // re-read scripts that may be fine.
  return (
    <div
      className={`border rounded-sm p-5 ${
        unavailable
          ? "border-caution/40 bg-caution/5"
          : blocked
            ? "border-halt/40 bg-halt/5"
            : "border-rule"
      }`}
    >
      <div
        className={`label ${
          unavailable ? "text-caution" : blocked ? "text-halt" : standing.className
        }`}
      >
        {unavailable ? "Not checked" : blocked ? CANNOT_GO_OUT : SHOW_DRAFT.label}
      </div>

      {unavailable ? (
        <>
          <p className="mt-2 text-sm text-muted prose-col leading-relaxed">
            {unavailable}
          </p>
          <p className="mt-3 text-sm text-muted prose-col leading-relaxed">
            So this cannot go out yet. It is not a verdict on the season — the
            check has simply not answered, and nothing gets published on a
            result nobody has.
          </p>
        </>
      ) : blocked ? (
        <>
          <p className="mt-2 text-sm text-muted prose-col leading-relaxed">
            {refusal(checks.fatal)} It cannot be published — not by you, not by
            anyone.
          </p>
          <p className="mt-2 text-sm text-muted prose-col leading-relaxed">
            Everything the spin-offs are generated from is that record.
            Continuity is what the shows are sold on, and a rule that bends
            under deadline is not a rule.
          </p>
          <ul className="mt-4 space-y-2">
            {checks.fatal.slice(0, 6).map((f, i) => (
              <li key={i} className="text-sm text-faint flex gap-2">
                <span aria-hidden className="text-halt">
                  —
                </span>
                <Said f={f} />
              </li>
            ))}
          </ul>
          {checks.fatal.length > 6 && (
            <p className="mt-3 label">
              and {checks.fatal.length - 6} more
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted prose-col leading-relaxed">
            {standing.plain}
          </p>
          <p className="mt-3 text-sm text-muted prose-col leading-relaxed">
            {listeningTime(state.episodeCount)} of listening once it is all out.
            The check ran: nothing in it contradicts itself, and every scene is
            accounted for. {RELEASE_NEEDS_LIVE.plain}
          </p>

          <Advisories checks={checks} />

          <form action={publishSeason} className="mt-5">
            <input type="hidden" name="storyId" value={storyId} />
            <button
              type="submit"
              className="border border-clear/50 text-clear px-4 py-2 text-sm rounded-sm hover:bg-clear/10 transition-colors"
            >
              Publish it
            </button>
          </form>
        </>
      )}

      {/*
        Said plainly rather than implied. There is no listener-facing app to push
        to, and a button implying otherwise is the kind of claim that unravels
        the moment somebody asks. The season's own wording is kept here rather
        than the episode one: the button above this line puts a SHOW live, and
        `RELEASE_NOT_A_PUSH` is about putting an episode out.
      */}
      <p className="mt-4 text-xs text-faint">
        Publishing records the decision here. It does not push to the app yet.
      </p>
    </div>
  );
}
