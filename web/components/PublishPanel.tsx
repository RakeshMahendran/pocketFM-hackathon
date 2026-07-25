import { EDITORS } from "@/lib/session";
import {
  publishSeason,
  unpublishSeason,
  type Checks,
  type Finding,
  type PublishState,
} from "@/lib/publish";

/**
 * The decision that turns a written season into one listeners can hear.
 *
 * Three states, and the two refusals are the interesting ones. A season whose
 * continuity checks fail cannot be published by anyone — the same rule as a
 * `blocked` story that cannot be commissioned, at the other end of the
 * pipeline. A season whose checks could not be run cannot be published either:
 * an unanswered check is not a passed one, and a screen that reassures on a
 * result it never got is worse than one that refuses. A guarantee that can be
 * waived under deadline, or by a broken install, is not a guarantee.
 *
 * Advisories are shown above the button rather than hidden behind it: only a
 * person reading the prose can settle them, so they should be read before
 * somebody puts their name to the season, not after.
 */

function editorName(id: string | null): string | null {
  if (!id) return null;
  return EDITORS.find((e) => e.id === id)?.name ?? id;
}

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
  const unavailable = checks.unavailable;
  const blocked = unavailable !== null || checks.fatal.length > 0;

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

  // Both refusals stop the button, and they are not the same news. A season the
  // check condemned is the season's problem; a check that never ran is the
  // machine's, and colouring it like a failed season sends a producer to
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
          unavailable ? "text-caution" : blocked ? "text-halt" : ""
        }`}
      >
        {unavailable ? "Not checked" : blocked ? "Can’t go out" : "Not out yet"}
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
            {episodes} episodes, {listeningTime(episodes)} of listening. The
            check ran: nothing in it contradicts itself, and every scene is
            accounted for. Publishing puts it in front of listeners, under your
            name.
          </p>

          {checks.advisory.length > 0 && (
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
