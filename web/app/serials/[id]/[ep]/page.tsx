import Link from "next/link";
import { notFound } from "next/navigation";

import { EpisodeAudio } from "@/components/EpisodeAudio";
import { EpisodeScript, listenMinutes } from "@/components/EpisodeScript";
import { NextStep } from "@/components/NextStep";
import { Fold } from "@/components/Fold";
import {
  FREE_CLICK,
  SCRIPT_FOLD,
  episodeEndOfSeason,
  episodeNextOut,
} from "@/components/pathWords";
import {
  EPISODE_LIST_ANCHOR,
  EpisodeStanding,
} from "@/components/ReleaseControls";
import { endingPhrase } from "@/components/SeasonSpine";
import { readChecks, readPublishState } from "@/lib/publish";
import { loadEpisode, loadSerial } from "@/lib/serials";
import { requireEditor } from "@/lib/session";
import {
  EPISODE_LIST_TITLE,
  RELEASE_NOT_A_PUSH,
  type SeasonRelease,
  seasonStanding,
} from "@/lib/words";

export const dynamic = "force-dynamic";

function parseEp(raw: string): number | null {
  const n = Number(decodeURIComponent(raw));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata(props: PageProps<"/serials/[id]/[ep]">) {
  const { id, ep } = await props.params;
  const n = parseEp(ep);
  if (n === null) return { title: "CanonForge" };
  const episode = await loadEpisode(decodeURIComponent(id), n);
  return {
    title: episode?.title
      ? `Episode ${n} — ${episode.title}`
      : `Episode ${n} — CanonForge`,
  };
}

export default async function EpisodePage(props: PageProps<"/serials/[id]/[ep]">) {
  await requireEditor();
  const { id: rawId, ep: rawEp } = await props.params;
  const id = decodeURIComponent(rawId);
  const n = parseEp(rawEp);
  if (n === null) notFound();

  const [serial, episode] = await Promise.all([loadSerial(id), loadEpisode(id, n)]);
  if (!serial || !episode) notFound();

  // The release state of THIS episode, and the season's checks that stand in
  // front of it. The checks are re-read here rather than assumed from the season
  // page, for the same reason `publish_episode()` re-runs them on every release:
  // episodes go out days apart and the beat sheet can be edited in between.
  const [publishState, checks] = await Promise.all([
    readPublishState(id, serial.episodeCount),
    readChecks(id),
  ]);
  const season: SeasonRelease = {
    live: publishState.live,
    releasedThrough: publishState.releasedThrough,
    written: publishState.episodeCount,
  };
  const showStanding = seasonStanding(season);
  const release = publishState.episodes.find((r) => r.ep === n) ?? null;

  const plan = serial.spine.find((e) => e.ep === n) ?? null;
  const order = serial.episodes.map((e) => e.ep);
  const at = order.indexOf(n);
  const prev = at > 0 ? order[at - 1] : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;

  /*
   * Where a reader goes after the last line of a script.
   *
   * Two dead ends met here and neither went anywhere. An episode already with
   * listeners left the one that could actually go out unnamed, sitting somewhere
   * in a list on another screen; and the last episode of a season ended on the
   * words "End of season" with no route on at all — which is exactly the point
   * where the fourth step of the pipeline begins.
   *
   * Nothing here releases anything. The release control for this episode is the
   * gated one at the top of this page, and the one for episode N is on episode
   * N's own page. This only says which episode is the one, and where the path
   * carries on when there is no episode left.
   */
  const pending =
    season.live && season.releasedThrough < season.written
      ? season.releasedThrough + 1
      : null;
  const onward =
    pending !== null && pending !== n
      ? { words: episodeNextOut(pending), href: `/serials/${serial.id}/${pending}` }
      : next === null
        ? {
            words: episodeEndOfSeason(serial.title),
            href: `/serials/${serial.id}/cast`,
          }
        : null;

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <div className="flex items-baseline justify-between gap-6 flex-wrap">
        <Link
          href={`/serials/${serial.id}`}
          className="label hover:text-ochre transition-colors"
        >
          ← {serial.title}
        </Link>
        <div className="label">
          Episode {n} of {serial.spineLength || serial.episodeCount} · about{" "}
          {listenMinutes(episode.words)} min to listen ·{" "}
          {episode.words.toLocaleString()} words
        </div>
      </div>

      <header className="mt-8 max-w-3xl">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-sm text-faint tabular-nums">
            {String(n).padStart(2, "0")}
          </span>
          {plan && (plan.hookType || plan.hookRaw) && (
            <span
              className="label text-ochre"
              title="The kind of cliffhanger this episode was planned to end on."
            >
              {endingPhrase(plan.hookType ?? plan.hookRaw)}
            </span>
          )}
          {plan && plan.status !== null && (
            <span
              className="label"
              title="How the lead is doing by the end of this episode."
            >
              the lead is at {plan.status}
            </span>
          )}
        </div>

        <h1 className="font-serif text-4xl tracking-tight mt-3 leading-tight">
          {episode.title ?? `Episode ${n}`}
        </h1>

        {plan?.turn && (
          <p className="mt-5 font-serif text-lg text-muted leading-relaxed">
            {plan.turn}
          </p>
        )}

        {!plan && (
          <p className="mt-5 text-sm text-caution leading-relaxed">
            This episode is not in the season plan, so there is nothing to check
            the script against.
          </p>
        )}
      </header>

      {/*
        This episode's own release decision, above the script rather than under
        it. Whether listeners can reach this one, who put it out and when, and
        the button if it is the one that can go next — the season-level state is
        the line above it, because an episode cannot go out while the show is
        not live and a producer needs to see both at once.
      */}
      <section className="mt-10 border border-rule rounded-sm p-5 max-w-3xl">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <span className={`label ${showStanding.className}`}>
            {showStanding.label}
          </span>
          <Link
            href={`/serials/${serial.id}#${EPISODE_LIST_ANCHOR}`}
            className="label text-ochre hover:text-paper transition-colors"
          >
            {EPISODE_LIST_TITLE} →
          </Link>
        </div>

        <div className="mt-4 border-t border-rule pt-4">
          <EpisodeStanding
            storyId={serial.id}
            ep={n}
            season={season}
            release={release}
            checks={checks}
            detailed
          />
        </div>

        <p className="mt-4 text-xs text-faint prose-col leading-relaxed">
          {RELEASE_NOT_A_PUSH}
        </p>
      </section>

      {/*
        Above the script, not below it. This is an audio drama: the recording is
        the product and the script is how it was made, so a reader who stops
        scrolling here has still met the thing itself.
      */}
      <EpisodeAudio storyId={id} ep={n} />

      {/*
        Folded, because it was three quarters of the page.
        1,096 of this screen's 1,484 words were the script, so everything an
        editor came here to check — is it out, can it go out, what does it sound
        like — sat above a wall of dialogue they had to scroll past to leave.
        This is an audio drama: the recording is the product and the script is
        how it was made. One click away, never deleted.
      */}
      <div className="mt-12">
        <Fold
          title={SCRIPT_FOLD}
          aside={`${episode.words.toLocaleString()} words · about ${listenMinutes(
            episode.words,
          )} min`}
        >
          <article className="pt-4">
            <EpisodeScript body={episode.body} />
          </article>
        </Fold>
      </div>

      {plan?.endsOn && (
        // Repeated at the foot on purpose: having just read the last line, the
        // planned hook is the one thing an editor wants to compare it against.
        <div className="mt-12 border-t border-rule pt-6 max-w-3xl">
          <h2 className="label text-ochre">
            The ending it was supposed to land on
          </h2>
          <p className="text-[0.9375rem] text-muted leading-relaxed mt-2 prose-col">
            {plan.endsOn}
          </p>
        </div>
      )}

      {onward && (
        <div className="mt-12 max-w-2xl">
          <NextStep
            action={onward.words.action}
            href={onward.href}
            cost={FREE_CLICK}
          >
            {onward.words.plain}
          </NextStep>
        </div>
      )}

      <nav className="mt-12 border-t border-rule pt-6 flex items-center justify-between gap-6">
        {prev !== null ? (
          <Link
            href={`/serials/${serial.id}/${prev}`}
            className="label hover:text-ochre transition-colors"
          >
            ← Episode {prev}
          </Link>
        ) : (
          <span className="label text-faint">Start of season</span>
        )}
        {next !== null ? (
          <Link
            href={`/serials/${serial.id}/${next}`}
            className="label hover:text-ochre transition-colors"
          >
            Episode {next} →
          </Link>
        ) : (
          <span className="label text-faint">End of season</span>
        )}
      </nav>
    </div>
  );
}
