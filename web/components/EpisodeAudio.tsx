import { audioRunIsOffline, readAudioRun } from "@/lib/audio-run";
import { loadEpisodeAudio, type Comparison, type Direction } from "@/lib/audio";
import { AudioRunPanel } from "./AudioRunPanel";
import { EpisodePlayer } from "./EpisodePlayer";
import {
  AS_WRITTEN,
  CAST_HEADING,
  CAST_IS_NOT_DIRECTION,
  COMPARISON_EXPLAINED,
  COMPARISON_HEADING,
  EMOTION_HEADING,
  LISTEN_TITLE,
  NO_AUDIO,
  PACE_HEADING,
  PAIR_ON_UNPERFORMED,
  RESHAPED,
  castLine,
  directionCounts,
  directionSaid,
  emotionName,
  flatCount,
  paceName,
  unplacedNote,
  type Said,
} from "./audioWords";

/**
 * The audio half of one episode: what was produced, and how it is performed.
 *
 * Drop-in — give it a story and an episode number and it reads its own data and
 * renders its own empty state. It is a server component, so the filesystem read
 * stays on the server and only the mix switcher ships to the browser.
 *
 * The one editorial rule this component enforces: a flat episode never renders
 * as a performed one. `src/audio/director.py` is the only stage that decides
 * emotion, pace and level, and it runs after the episode is written. An episode
 * that reached synthesis without it carries the same default on every line, and
 * one of the two voiced seasons on disk is exactly that. Showing its 71
 * identical lines as a spread of craft would be a claim that falls apart the
 * first time somebody clicks play, so the undirected case gets its own heading
 * and says plainly that the pass never ran.
 *
 * It is also where an episode gets recorded from. Recording was the one stage of
 * the pipeline with no control in the console, which left five of the seven
 * seasons on disk showing "Not recorded yet" with nothing a reader could do
 * about it — so the empty state carries the control rather than merely reporting
 * the absence, and a page that already has a mix keeps it folded away.
 */

/** How the performance was decided, or the fact that it never was. */
function Performance({ direction }: { direction: Direction }) {
  const said: Said = directionSaid(direction.directed);

  const emotions = direction.emotions.map((t) => ({
    value: emotionName(t.value),
    count: t.count,
  }));
  const paces = direction.paces.map((t) => ({
    value: paceName(t.value),
    count: t.count,
  }));

  return (
    <div className="mt-8">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3
          className={`font-serif text-xl leading-tight ${
            direction.directed ? "text-paper" : "text-caution"
          }`}
        >
          {said.label}
        </h3>
        <span className="label">
          {direction.directed
            ? directionCounts(
                direction.lineCount,
                direction.emotions.length,
                direction.paces.length,
              )
            : flatCount(direction.lineCount)}
        </span>
      </div>

      <p className="text-[0.9375rem] text-muted leading-relaxed mt-2 prose-col">
        {said.plain}
      </p>

      {/* Only a performed episode gets its spread shown. On a flat one there is
          nothing to show but one value repeated, and printing it under these
          headings would dress a default up as a decision. */}
      {direction.directed && (
        <div className="mt-6 flex flex-wrap gap-x-12 gap-y-6">
          <Counted heading={EMOTION_HEADING} rows={emotions} />
          <Counted heading={PACE_HEADING} rows={paces} />
        </div>
      )}

      <div className="mt-6">
        <div className="label mb-1.5">{CAST_HEADING}</div>
        <div className="text-sm text-paper">
          {castLine(direction.voices, direction.speakers)}
        </div>
        {/* Said on every episode, and it matters most on the flat one: that
            episode has twelve voices in it, and a cast count sitting near a
            performance heading must not be read as evidence of direction. */}
        <p className="text-sm text-faint leading-relaxed mt-1.5 prose-col">
          {CAST_IS_NOT_DIRECTION}
        </p>
      </div>
    </div>
  );
}

/** A value and how many lines are played that way. */
function Counted({
  heading,
  rows,
}: {
  heading: string;
  rows: { value: string; count: number }[];
}) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="label mb-2">{heading}</div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.value} className="flex items-baseline gap-3 text-sm">
            <span className="text-paper">{r.value}</span>
            <span className="text-faint tabular-nums">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The director's before and after, on the same words. */
function Pair({
  comparison,
  performed,
}: {
  comparison: Comparison;
  /** Whether the full episode above went through the same pass. Today it has not. */
  performed: boolean;
}) {
  const sides: { said: Said; url: string }[] = [
    { said: AS_WRITTEN, url: comparison.asWritten },
    { said: RESHAPED, url: comparison.reshaped },
  ];

  return (
    <div className="mt-8">
      <h3 className="font-serif text-xl leading-tight">{COMPARISON_HEADING}</h3>
      <p className="text-[0.9375rem] text-muted leading-relaxed mt-2 prose-col">
        {COMPARISON_EXPLAINED}
      </p>

      {/* The pair currently sits under a heading saying the episode was never
          performed. Left unsaid, a reader takes the full episode above to be
          the "after" — so the relationship between the two is stated. */}
      {!performed && (
        <p className="text-[0.9375rem] text-caution leading-relaxed mt-3 prose-col">
          {PAIR_ON_UNPERFORMED}
        </p>
      )}

      <div className="mt-5 grid sm:grid-cols-2 gap-5">
        {sides.map(({ said, url }) => (
          <div key={url} className="border border-rule bg-surface p-4">
            <div className="label">{said.label}</div>
            <audio src={url} controls preload="none" className="w-full mt-3" />
            <p className="text-sm text-faint leading-relaxed mt-3">{said.plain}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function EpisodeAudio({
  storyId,
  ep,
}: {
  storyId: string;
  ep: number;
}) {
  // The run is read on every render rather than only when the panel is empty:
  // an episode being recorded right now is the one thing on this section a
  // reader most needs to see, and it is equally true of a season that already
  // has a mix on disk.
  const [audio, run, offline] = await Promise.all([
    loadEpisodeAudio(storyId, ep),
    readAudioRun(storyId, ep),
    audioRunIsOffline(),
  ]);

  // Never a thrown error and never a blank: three of the six seasons on disk
  // have no audio at all, and an editor opening one of those should be told
  // where the episode stands, not shown an empty box.
  if (!audio.tracks.length && !audio.comparison) {
    return (
      <section>
        <h2 className="label mb-4">{LISTEN_TITLE}</h2>
        <div className="border border-rule bg-surface p-6">
          <div className="font-serif text-2xl leading-tight text-muted">
            {NO_AUDIO.label}
          </div>
          <p className="text-[0.9375rem] text-muted leading-relaxed mt-3 prose-col">
            {NO_AUDIO.plain}
          </p>

          {/* The whole reason this state stopped being a dead end. */}
          <AudioRunPanel
            storyId={storyId}
            ep={ep}
            run={run}
            offline={offline}
            hasAudio={false}
            recordedLanguages={audio.languages}
          />
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="label mb-4">{LISTEN_TITLE}</h2>

      {audio.tracks.length > 0 && <EpisodePlayer tracks={audio.tracks} />}

      {audio.direction && <Performance direction={audio.direction} />}

      {audio.comparison && (
        <Pair
          comparison={audio.comparison}
          // No direction read at all is not the same as a flat one, but neither
          // is a performed episode, and only a performed one may go unqualified.
          performed={audio.direction?.directed === true}
        />
      )}

      {audio.unplaced > 0 && (
        <p className="label mt-6">{unplacedNote(audio.unplaced)}</p>
      )}

      {/* Last, and quiet. Somebody who opened this episode came to hear it, and
          a second recording replaces the one they are listening to. */}
      <AudioRunPanel
        storyId={storyId}
        ep={ep}
        run={run}
        offline={offline}
        hasAudio={audio.tracks.length > 0}
        recordedLanguages={audio.languages}
      />
    </section>
  );
}
