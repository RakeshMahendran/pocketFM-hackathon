import Link from "next/link";

import { listenMinutes } from "@/components/EpisodeScript";
import {
  EPISODE_UNWRITTEN,
  queuePlace,
  withoutRepeatedRules,
} from "@/components/pathWords";
import {
  EpisodeStanding,
  editorName,
  episodeAnchor,
  refusedRelease,
} from "@/components/ReleaseControls";
import { endingPhrase } from "@/components/SeasonSpine";
import { SEASON_WORDS } from "@/components/SeasonLayout";
import type { Checks, EpisodeRelease } from "@/lib/publish";
import type { EpisodeRef, SpineEntry } from "@/lib/serials";
import {
  ORDER_EXPLAINED,
  episodeAudit,
  episodeStanding,
  heldCount,
  releaseProgress,
  type SeasonRelease,
} from "@/lib/words";

/**
 * The fourteen episodes, once, answering both questions asked of them.
 *
 * They used to be listed twice on the season page: the planner's ladder, with
 * every episode's summary open, and then the release list with the same fourteen
 * titles again. Together that was most of the page's length and neither list
 * could be scanned — a producer wanting to know what episode 9 ends on, or
 * whether it is out, read past a thousand words to find out.
 *
 * One row per episode, and the row has to answer the release question on its
 * own, because scanning is the whole job here. Visible without opening
 * anything: the number, the title, where it stands with listeners, and the
 * thing that standing actually turns on —
 *
 *   out          who put it out and on what day. A decision with nobody's name
 *                against it is not an audit trail, and the name is the only
 *                part of this pipeline that is a person's rather than the
 *                machine's.
 *   ready        the label, or — if the continuity check is failing — the
 *                refusal in its place, in the colour of a refusal.
 *   held back    how far down the queue it is, because ten rows all reading
 *                "Held back" and nothing else is ten rows of no information.
 *   not written  said as that, rather than as a release state it cannot be in.
 *
 * Then the cliffhanger type and the running time. Behind the fold: what turns
 * in it, what a listener last hears, what it settles — and the release control
 * for that one episode.
 *
 * The season-wide rules — the order episodes go out in, and that the check runs
 * again every time — are printed once above the list and stripped out of every
 * row, including the hover text. Repeated down fourteen rows they buried the
 * one line per row that differs.
 *
 * The episode that can go out next is open on arrival, because that is the one
 * decision this screen exists to support and it must not be hidden behind a
 * click. Nothing else is.
 *
 * Nothing here decides anything. `EpisodeStanding` is imported whole, so the
 * buttons, the refusals and the pull warning are the same ones the episode's own
 * page shows, and `refusedRelease` is the same function it asks.
 */

interface Row {
  ep: number;
  entry: SpineEntry | null;
  written: EpisodeRef | undefined;
}

function rows(spine: SpineEntry[], episodes: EpisodeRef[]): Row[] {
  const byEp = new Map(episodes.map((e) => [e.ep, e]));
  const numbers = new Set<number>([
    ...spine.map((e) => e.ep),
    ...episodes.map((e) => e.ep),
  ]);
  const entries = new Map(spine.map((e) => [e.ep, e]));
  return [...numbers]
    .sort((a, b) => a - b)
    .map((ep) => ({
      ep,
      entry: entries.get(ep) ?? null,
      written: byEp.get(ep),
    }));
}

export function SeasonEpisodes({
  storyId,
  spine,
  episodes,
  season,
  releases,
  checks,
}: {
  storyId: string;
  spine: SpineEntry[];
  episodes: EpisodeRef[];
  season: SeasonRelease;
  releases: EpisodeRelease[];
  checks: Checks;
}) {
  const byEp = new Map(releases.map((r) => [r.ep, r]));
  const all = rows(spine, episodes);
  const held = Math.max(0, season.written - season.releasedThrough);

  if (all.length === 0) {
    return (
      <p className="text-sm text-muted leading-relaxed prose-col">
        {episodeStanding(1, season).plain}
      </p>
    );
  }

  return (
    <div>
      {/* Said once above the list rather than fourteen times inside it — the
          same reason `EpisodeReleaseList` says it once. */}
      {!season.live && season.written > 0 && (
        <p className="text-sm text-muted leading-relaxed prose-col mb-3">
          {episodeStanding(all[0].ep, season).plain}
        </p>
      )}
      <p className="text-sm text-muted leading-relaxed prose-col">
        {ORDER_EXPLAINED}
      </p>

      <ul className="mt-6 border-t border-rule">
        {all.map(({ ep, entry, written }) => {
          const standing = episodeStanding(ep, season);
          const release = byEp.get(ep) ?? null;
          // The same question `EpisodeStanding` asks, asked here so the row a
          // producer scans cannot read "Ready to go out" in ochre while the
          // control inside it refuses. A refusal replaces the standing rather
          // than sitting beside it.
          const refused = standing.canRelease ? refusedRelease(checks, ep) : null;
          // What the standing turns on, said on the row: the name against a
          // release, or the wait in front of one.
          const detail = Boolean(entry?.turn || entry?.endsOn || entry?.paysOff);
          const hook = entry ? endingPhrase(entry.hookType ?? entry.hookRaw) : null;
          const href = `/serials/${encodeURIComponent(storyId)}/${ep}`;

          return (
            <li
              key={ep}
              id={episodeAnchor(ep)}
              className="border-b border-rule py-4 grid sm:grid-cols-[3.5rem_1fr] gap-x-5 gap-y-2 scroll-mt-24"
            >
              <div className="pt-1">
                {written ? (
                  <Link
                    href={href}
                    className="font-mono text-sm text-muted hover:text-ochre transition-colors tabular-nums"
                  >
                    {String(ep).padStart(2, "0")}
                  </Link>
                ) : (
                  <span className="font-mono text-sm text-faint tabular-nums">
                    {String(ep).padStart(2, "0")}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap">
                  <h3 className="font-serif text-lg min-w-0">
                    {written ? (
                      <Link
                        href={href}
                        className="hover:text-ochre transition-colors"
                      >
                        {written.title ?? `Episode ${ep}`}
                      </Link>
                    ) : (
                      <span className="text-muted">Episode {ep}</span>
                    )}
                  </h3>
                  <span
                    className={`label ${refused ? "text-halt" : standing.className}`}
                    title={withoutRepeatedRules(
                      refused ? refused.plain : standing.plain,
                    )}
                  >
                    {refused ? refused.label : standing.label}
                  </span>

                  {/* Who decided it, and when. The one fact about an episode
                      that is a person's rather than the machine's. */}
                  {standing.kind === "out" && release && (
                    <span className="label">
                      {episodeAudit({
                        who: editorName(release.by),
                        at: release.at,
                      })}
                    </span>
                  )}

                  {/* How long the wait is, for the rows whose only news is
                      that they are waiting. */}
                  {standing.kind === "waiting" && (
                    <span
                      className="label text-faint"
                      title="How many releases come before this one."
                    >
                      {queuePlace(ep - season.releasedThrough)}
                    </span>
                  )}

                  {standing.kind === "unwritten" && (
                    <span className="label text-faint">{EPISODE_UNWRITTEN}</span>
                  )}

                  {hook && (
                    <span
                      className={`label ${entry?.hookRepeats ? "text-caution" : "text-faint"}`}
                      title={
                        entry?.hookRepeats
                          ? "This kind of ending was already used earlier this season."
                          : "The kind of cliffhanger this episode ends on."
                      }
                    >
                      {hook}
                    </span>
                  )}
                  {written && (
                    <span className="label text-faint whitespace-nowrap">
                      ~{listenMinutes(written.words)} min
                    </span>
                  )}
                </div>

                {/*
                  Open on the one episode that can go out. Everything else stays
                  shut: fourteen summaries at once is the thing that made this
                  page unreadable.
                */}
                <details
                  className="group mt-1.5"
                  open={standing.kind === "next"}
                >
                  <summary className="label cursor-pointer list-none hover:text-ochre transition-colors">
                    {SEASON_WORDS.whatHappens}
                    <span className="group-open:hidden" aria-hidden="true">
                      {" "}
                      ▸
                    </span>
                    <span className="hidden group-open:inline" aria-hidden="true">
                      {" "}
                      ▾
                    </span>
                  </summary>

                  <div className="mt-3">
                    {detail ? (
                      <>
                        {entry?.turn && (
                          <p className="font-serif text-[1.0625rem] leading-relaxed prose-col">
                            {entry.turn}
                          </p>
                        )}
                        {entry?.endsOn && (
                          <p className="text-sm text-muted leading-relaxed mt-3 prose-col border-l border-rule-strong pl-4">
                            <span className="label block mb-1">
                              The last thing a listener hears
                            </span>
                            {entry.endsOn}
                          </p>
                        )}
                        {entry?.paysOff && (
                          <p className="text-sm text-muted leading-relaxed mt-3 prose-col border-l border-ochre/50 pl-4">
                            <span className="label block mb-1 text-ochre">
                              Settles something set up earlier
                            </span>
                            {entry.paysOff}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-faint">
                        Nobody wrote down what changes in this episode.
                      </p>
                    )}

                    <div className="mt-4 border-t border-rule pt-3">
                      <EpisodeStanding
                        storyId={storyId}
                        ep={ep}
                        season={season}
                        release={release}
                        checks={checks}
                        detailed
                        saidAbove
                      />
                    </div>
                  </div>
                </details>
              </div>
            </li>
          );
        })}
      </ul>

      {held > 0 && (
        <p className="label mt-4">
          {heldCount(held)} ·{" "}
          {releaseProgress(season.releasedThrough, season.written)}
        </p>
      )}
    </div>
  );
}
