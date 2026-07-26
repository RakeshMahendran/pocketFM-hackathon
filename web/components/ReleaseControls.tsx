import Link from "next/link";

import {
  publishEpisode,
  unpublishEpisode,
  type Checks,
  type EpisodeRelease,
} from "@/lib/publish";
import { EDITORS } from "@/lib/session";
import {
  CANNOT_GO_OUT,
  ORDER_EXPLAINED,
  PULL_EPISODE,
  type Said,
  type SeasonRelease,
  episodeAudit,
  episodeStanding,
  heldCount,
  pullAction,
  pullWarning,
  releaseAction,
  releaseProgress,
  releaseRefused,
} from "@/lib/words";

/**
 * The per-episode half of publishing, in the three places it has to appear.
 *
 * A show going live and an episode going out are different decisions, and only
 * the second one earns. The season panel, the episode list and one episode's own
 * page all have to say where a given episode stands, so the buttons and the
 * standing line are written once here rather than three times with three
 * slightly different sentences.
 *
 * Nothing in this file decides anything. `publish_episode()` owns the order
 * rule, the show-must-be-live rule and the continuity gate, and re-runs the
 * season's fatal checks on every single release. What is done here is decline to
 * offer a button whose answer is already known to be no — and say which no it
 * is, because "the check condemned this season" and "the check never answered"
 * send a producer to two different places.
 */

/** An editor id, as `--by` recorded it, said as the person. */
export function editorName(id: string | null): string | null {
  if (!id) return null;
  // An id matching no editor is a release made from a terminal by somebody not
  // on the list. Shown as it stands rather than dropped: a name nobody
  // recognises is still more than no name at all against a decision.
  return EDITORS.find((e) => e.id === id)?.name ?? id;
}

/**
 * Why Python would refuse this episode, or null if nothing stands in the way.
 *
 * The unavailable case refuses exactly as hard as a failing check, and for the
 * reason the panel has always given: an unanswered check is not a passed one,
 * and a console that releases on a result nobody has is decorative precisely
 * when the machine is broken.
 */
export function refusedRelease(checks: Checks, ep: number): Said | null {
  if (checks.unavailable) {
    return { label: CANNOT_GO_OUT, plain: checks.unavailable };
  }
  if (checks.fatal.length > 0) {
    return releaseRefused(ep, checks.fatal.length);
  }
  return null;
}

/**
 * The one episode that can go out. Always names the episode on the button, so
 * nobody releases the wrong one off a page they scrolled past.
 */
export function ReleaseEpisode({
  storyId,
  ep,
}: {
  storyId: string;
  ep: number;
}) {
  return (
    <form action={publishEpisode} className="mt-3">
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="ep" value={ep} />
      <button
        type="submit"
        className="border border-ochre/60 text-ochre px-4 py-2 text-sm rounded-sm hover:bg-ochre/10 transition-colors"
      >
        {releaseAction(ep)}
      </button>
    </form>
  );
}

/**
 * Pulling one back, with what it takes with it stated above the button.
 *
 * `unpublish_episode()` pulls the tail every time. A producer who thinks they
 * are pulling one episode and takes six off will not trust this console again,
 * so the consequence is named before the click and never discovered after it.
 */
export function PullEpisode({
  storyId,
  ep,
  releasedThrough,
}: {
  storyId: string;
  ep: number;
  releasedThrough: number;
}) {
  return (
    <form action={unpublishEpisode} className="mt-3">
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="ep" value={ep} />
      <p className="text-xs text-faint prose-col leading-relaxed">
        {pullWarning(ep, releasedThrough)}
      </p>
      <button
        type="submit"
        className="label mt-1.5 hover:text-halt transition-colors"
        title={PULL_EPISODE.plain}
      >
        {pullAction(ep)}
      </button>
    </form>
  );
}

/**
 * Where one episode stands, with whatever action it offers.
 *
 * Used on the episode's own page and inside the season's list, so the two
 * cannot end up describing the same episode differently.
 */
export function EpisodeStanding({
  storyId,
  ep,
  season,
  release,
  checks,
  detailed = false,
}: {
  storyId: string;
  ep: number;
  season: SeasonRelease;
  /** The recorded decision, when this one is out. */
  release: EpisodeRelease | null;
  checks: Checks;
  /** Show the reasoning under the label. On for one episode, off in a list. */
  detailed?: boolean;
}) {
  const standing = episodeStanding(ep, season);
  const out = standing.kind === "out";
  // Only asked of the one episode whose turn it is. `episodeStanding` answers
  // where an episode sits in the queue; whether the season is sound enough to
  // release anything at all is a different question with a different answer,
  // and the second one wins — "Ready to go out" printed above "Can't go out"
  // is two labels arguing on the same row.
  const refused = standing.canRelease ? refusedRelease(checks, ep) : null;

  return (
    <div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className={`label ${refused ? "text-halt" : standing.className}`}
          title={standing.plain}
        >
          {refused ? refused.label : standing.label}
        </span>
        {out && release && (
          <span className="label">
            {episodeAudit({ who: editorName(release.by), at: release.at })}
          </span>
        )}
      </div>

      {/* The reasoning is worth the space on the one episode being looked at,
          and on the one episode that can go out. Printed against all fourteen
          rows of a list it is noise, so there it lives in the title. */}
      {(refused || detailed || standing.kind === "next") && (
        <p className="mt-1.5 text-sm text-muted prose-col leading-relaxed">
          {refused ? refused.plain : standing.plain}
        </p>
      )}

      {standing.canRelease && !refused && (
        <ReleaseEpisode storyId={storyId} ep={ep} />
      )}

      {out && (
        <PullEpisode
          storyId={storyId}
          ep={ep}
          releasedThrough={season.releasedThrough}
        />
      )}
    </div>
  );
}

/**
 * Every written episode, each saying where it stands.
 *
 * The season's plan is drawn elsewhere on that page; this is the other
 * question, and the one that pays: what can a listener actually reach today.
 */
export function EpisodeReleaseList({
  storyId,
  season,
  episodes,
  releases,
  checks,
}: {
  storyId: string;
  season: SeasonRelease;
  episodes: { ep: number; title: string | null }[];
  releases: EpisodeRelease[];
  checks: Checks;
}) {
  const byEp = new Map(releases.map((r) => [r.ep, r]));
  const held = Math.max(0, season.written - season.releasedThrough);

  if (episodes.length === 0) {
    return (
      <p className="text-sm text-muted leading-relaxed prose-col">
        {episodeStanding(1, season).plain}
      </p>
    );
  }

  return (
    <div>
      {/* Said once above the list rather than fourteen times inside it: while
          the show is not live every row is held back for the same reason, and
          repeating it down the page buries the order rule that is the only
          thing distinguishing the rows from each other. */}
      {!season.live && (
        <p className="text-sm text-muted leading-relaxed prose-col mb-3">
          {episodeStanding(episodes[0].ep, season).plain}
        </p>
      )}
      <p className="text-sm text-muted leading-relaxed prose-col">
        {ORDER_EXPLAINED}
      </p>

      <ul className="mt-6 border-t border-rule">
        {episodes.map((e) => (
          <li
            key={e.ep}
            className="border-b border-rule py-4 grid sm:grid-cols-[3.5rem_1fr] gap-x-5 gap-y-2"
          >
            <div className="pt-0.5">
              <Link
                href={`/serials/${encodeURIComponent(storyId)}/${e.ep}`}
                className="font-mono text-sm text-muted hover:text-ochre transition-colors tabular-nums"
              >
                {String(e.ep).padStart(2, "0")}
              </Link>
            </div>

            <div className="min-w-0">
              <h3>
                <Link
                  href={`/serials/${encodeURIComponent(storyId)}/${e.ep}`}
                  className="font-serif text-lg hover:text-ochre transition-colors"
                >
                  {e.title ?? `Episode ${e.ep}`}
                </Link>
              </h3>
              <div className="mt-1.5">
                <EpisodeStanding
                  storyId={storyId}
                  ep={e.ep}
                  season={season}
                  release={byEp.get(e.ep) ?? null}
                  checks={checks}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>

      {held > 0 && (
        <p className="label mt-4">
          {heldCount(held)} · {releaseProgress(season.releasedThrough, season.written)}
        </p>
      )}
    </div>
  );
}

/** Named once so the panel's link and the section it lands on cannot drift. */
export const EPISODE_LIST_ANCHOR = "whats-out";
