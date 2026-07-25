import { EDITORS } from "@/lib/session";
import {
  publishSeason,
  unpublishSeason,
  type Checks,
  type PublishState,
} from "@/lib/publish";

/**
 * The decision that turns a written season into one listeners can hear.
 *
 * Two states, and the refusal is the interesting one. A season whose continuity
 * checks fail cannot be published by anyone — the same rule as a `blocked`
 * story that cannot be commissioned, at the other end of the pipeline. A
 * guarantee that can be waived under deadline is not a guarantee.
 *
 * Advisories are shown above the button rather than hidden behind it: only a
 * person reading the prose can settle them, so they should be read before
 * somebody puts their name to the season, not after.
 */

function editorName(id: string | null): string | null {
  if (!id) return null;
  return EDITORS.find((e) => e.id === id)?.name ?? id;
}

/** Roughly 6 minutes an episode, per the length rules the writer works to. */
function listeningTime(episodes: number): string {
  const minutes = episodes * 6;
  if (minutes < 60) return `about ${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `about ${h}h ${m}m` : `about ${h}h`;
}

export function PublishPanel({
  storyId,
  episodes,
  state,
  checks,
}: {
  storyId: string;
  episodes: number;
  state: PublishState;
  checks: Checks;
}) {
  const blocked = checks.fatal.length > 0;

  if (state.live) {
    const who = editorName(state.by);
    return (
      <div className="border border-clear/40 bg-clear/5 rounded-sm p-5">
        <div className="label text-clear">Live</div>
        <p className="mt-2 text-sm text-muted prose-col leading-relaxed">
          {episodes} episodes are out, {listeningTime(episodes)} of listening.
          Each one unlocks separately.
          {who && ` Published by ${who}`}
          {state.at && ` on ${state.at.slice(0, 10)}`}.
        </p>

        <form action={unpublishSeason} className="mt-4">
          <input type="hidden" name="storyId" value={storyId} />
          <button
            type="submit"
            className="label hover:text-halt transition-colors"
          >
            Take it back to draft
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      className={`border rounded-sm p-5 ${
        blocked ? "border-halt/40 bg-halt/5" : "border-rule"
      }`}
    >
      <div className={`label ${blocked ? "text-halt" : ""}`}>
        {blocked ? "Can’t go out" : "Not out yet"}
      </div>

      {blocked ? (
        <>
          <p className="mt-2 text-sm text-muted prose-col leading-relaxed">
            This season contradicts itself, so it cannot be published — not by
            you, not by anyone. Continuity is what the shows are sold on, and a
            rule that bends under deadline is not a rule.
          </p>
          <ul className="mt-4 space-y-2">
            {checks.fatal.slice(0, 6).map((f, i) => (
              <li key={i} className="text-sm text-faint flex gap-2">
                <span aria-hidden className="text-halt">
                  —
                </span>
                <span className="prose-col">{f}</span>
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
            {episodes} episodes, {listeningTime(episodes)} of listening. Nothing
            in it contradicts itself. Publishing puts it in front of listeners,
            under your name.
          </p>

          {checks.advisory.length > 0 && (
            <div className="mt-4 border-l-2 border-caution/60 pl-4">
              <div className="label text-caution">
                Worth reading first — {checks.advisory.length}
              </div>
              <ul className="mt-2 space-y-1.5">
                {checks.advisory.slice(0, 4).map((a, i) => (
                  <li key={i} className="text-sm text-faint prose-col">
                    {a}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-faint">
                These need someone to read the scripts to settle, so they do not
                stop you — but they are your call, not the checker’s.
              </p>
            </div>
          )}

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
        Said plainly rather than implied. There is no Pocket FM to push to, and a
        button claiming otherwise is the kind of thing a judge asks about.
      */}
      <p className="mt-4 text-xs text-faint">
        Publishing records the decision here. It does not push to the app yet.
      </p>
    </div>
  );
}
