import { StartAudioRun } from "@/components/StartAudioRun";
import {
  RECORD_ACTION,
  RECORD_AGAIN_ACTION,
  RECORD_AGAIN_SUMMARY,
  RECORD_DONE_BUT_NOTHING_HERE,
  RECORD_FAILED,
  RECORD_HEADING,
  RECORD_LANGUAGE_REPLACES,
  RECORD_LAST_SAID,
  RECORD_RUN_HEADING,
  RECORD_STEPS,
  RECORD_STEP_STOPPED,
  RECORD_STEP_UNDER_WAY,
  RECORD_TRY_AGAIN,
  RECORD_UNDER_WAY,
  RECORD_WHAT_WENT_WRONG,
  alreadyRecorded,
  buildSaid,
  languageName,
  recordWhatItWillDo,
} from "@/components/audioWords";
import type { AudioRunStatus } from "@/lib/audio-run";

/**
 * Ordering a recording, and watching it happen.
 *
 * Recording was the only stage of the pipeline the console could not start: a
 * season could be commissioned and a side character given their own episode, but
 * turning a written episode into audio lived at a terminal. Five of the seven
 * seasons on disk have no audio, so most episode pages said "Not recorded yet"
 * and stopped there.
 *
 * Three stages run, and the screen names all three the whole way through rather
 * than only the one in flight — a producer watching a bar move has no idea what
 * is being bought, and here the middle stage is the one that spends the money.
 * The stage labels are the run's own, and the last thing the build said is
 * carried under them so a run that stalls shows where.
 *
 * Where a recording already exists this is never the loud thing on the panel.
 * The player is what somebody came for; re-recording sits behind a disclosure
 * and says, before it is opened, that it replaces rather than adds.
 */

const REFRESH_SECONDS = 5;

type Mark = "done" | "current" | "stopped" | "waiting";

const MARK: Record<Mark, { glyph: string; className: string }> = {
  done: { glyph: "✓", className: "text-clear" },
  current: { glyph: "▸", className: "text-ochre" },
  stopped: { glyph: "✕", className: "text-halt" },
  waiting: { glyph: "·", className: "text-faint" },
};

function Step({
  label,
  mark,
  detail,
}: {
  label: string;
  mark: Mark;
  detail: string | null;
}) {
  return (
    <li className="flex items-baseline gap-4 border-b border-rule py-3">
      <span className={`font-mono w-4 shrink-0 ${MARK[mark].className}`}>
        {MARK[mark].glyph}
      </span>
      <span
        className={`font-serif text-[1.0625rem] ${
          mark === "waiting" ? "text-faint" : ""
        }`}
      >
        {label}
      </span>
      <span
        className={`label ml-auto text-right ${
          mark === "stopped" ? "text-halt" : ""
        }`}
      >
        {detail ?? ""}
      </span>
    </li>
  );
}

/** The three stages, in the order they run, with the one in flight explained. */
function Steps({ run }: { run: AudioRunStatus }) {
  const at = RECORD_STEPS.findIndex((s) => s.key === run.step);
  const current = at > -1 && run.state === "running" ? RECORD_STEPS[at] : null;
  const said = buildSaid(run.detail);

  return (
    <>
      <ol className="mt-5 border-t border-rule">
        {RECORD_STEPS.map((step, i) => {
          const mark: Mark =
            run.state === "done" || (at > -1 && i < at)
              ? "done"
              : i === at
                ? run.state === "failed"
                  ? "stopped"
                  : "current"
                : "waiting";

          return (
            <Step
              key={step.key}
              label={step.label}
              mark={mark}
              detail={
                mark === "current"
                  ? RECORD_STEP_UNDER_WAY
                  : mark === "stopped"
                    ? RECORD_STEP_STOPPED
                    : null
              }
            />
          );
        })}
      </ol>

      {/* What the stage in flight actually is. The one thing a progress
          indicator normally refuses to say. */}
      {current && (
        <p className="mt-4 text-sm text-muted leading-relaxed prose-col">
          {current.means}
        </p>
      )}

      {/* The build's own last word, cleaned of everything written for whoever
          maintains it. A stalled run showing nothing is the failure the status
          file exists to fix, so this is carried even when it is terse. */}
      {said && (
        <div className="mt-4">
          <div className="label">{RECORD_LAST_SAID}</div>
          <p className="mt-1 text-sm text-faint leading-relaxed prose-col">
            {said}
          </p>
        </div>
      )}
    </>
  );
}

/** The offer itself: what it will do, what it costs, then the control. */
function Offer({
  storyId,
  ep,
  offline,
  recorded,
  recordedLanguages,
}: {
  storyId: string;
  ep: number;
  offline: boolean;
  recorded: boolean;
  recordedLanguages: string[];
}) {
  return (
    <>
      <p className="text-[0.9375rem] text-muted leading-relaxed prose-col">
        {recordWhatItWillDo({ recorded, offline })}
      </p>

      {recorded && (
        <p className="mt-3 text-sm text-faint leading-relaxed prose-col">
          {[
            alreadyRecorded(recordedLanguages.map(languageName)),
            RECORD_LANGUAGE_REPLACES,
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
      )}

      <div className="mt-5">
        <StartAudioRun
          storyId={storyId}
          ep={ep}
          label={recorded ? RECORD_AGAIN_ACTION : RECORD_ACTION}
          variant={recorded ? "quiet" : "primary"}
        />
      </div>
    </>
  );
}

export function AudioRunPanel({
  storyId,
  ep,
  run,
  offline,
  /** Whether there is a finished mix on this page already. Decides the weight. */
  hasAudio,
  /** Language codes already on disk for this episode. Named, never rendered raw. */
  recordedLanguages,
}: {
  storyId: string;
  ep: number;
  /** Null when nobody has ever recorded this episode from the console. */
  run: AudioRunStatus | null;
  offline: boolean;
  hasAudio: boolean;
  recordedLanguages: string[];
}) {
  if (run?.state === "running") {
    return (
      <div className="mt-8 border border-ochre/40 bg-ochre/5 rounded-sm p-5">
        {/* Only while there is something to watch. A page that reloads itself
            forever is a page nobody can read. */}
        <meta httpEquiv="refresh" content={String(REFRESH_SECONDS)} />

        <div className="label text-ochre">
          {RECORD_RUN_HEADING.running}
          {run.language ? ` · ${languageName(run.language)}` : ""}
        </div>
        <Steps run={run} />
        <p className="mt-4 text-sm text-faint leading-relaxed prose-col">
          {RECORD_UNDER_WAY}
        </p>
      </div>
    );
  }

  if (run?.state === "failed") {
    return (
      <div className="mt-8 border border-halt/40 bg-halt/5 rounded-sm p-5">
        <div className="label text-halt">{RECORD_RUN_HEADING.failed}</div>
        <Steps run={run} />

        {run.error && (
          <div className="mt-5 border-l-2 border-halt/60 pl-4">
            <div className="label text-halt">{RECORD_WHAT_WENT_WRONG}</div>
            <p className="mt-2 text-sm text-muted leading-relaxed prose-col">
              {run.error}
            </p>
          </div>
        )}

        <p className="mt-4 text-sm text-muted leading-relaxed prose-col">
          {RECORD_FAILED}
        </p>

        <div className="mt-5">
          <StartAudioRun
            storyId={storyId}
            ep={ep}
            label={RECORD_TRY_AGAIN}
            variant="quiet"
            // The same run again, not a different order. Choosing a language
            // here would quietly turn a retry into a second cut.
            chooseLanguage={false}
            defaultLanguage={run.language ?? "en"}
          />
        </div>
      </div>
    );
  }

  // A run that finished with nothing playable beside it. Said plainly rather
  // than falling back to "not recorded yet", which would send somebody to spend
  // the credits again for the same result.
  if (run?.state === "done" && !hasAudio) {
    return (
      <div className="mt-8 border border-caution/40 bg-caution/5 rounded-sm p-5">
        <div className="label text-caution">{RECORD_RUN_HEADING.done}</div>
        <p className="mt-3 text-[0.9375rem] text-muted leading-relaxed prose-col">
          {RECORD_DONE_BUT_NOTHING_HERE}
        </p>
        <div className="mt-5">
          <StartAudioRun
            storyId={storyId}
            ep={ep}
            label={RECORD_AGAIN_ACTION}
            variant="quiet"
          />
        </div>
      </div>
    );
  }

  // Something is already on the page to listen to. The offer stays available
  // and stops being an offer: folded away, and saying what it replaces before
  // it is opened.
  if (hasAudio) {
    return (
      <details className="mt-8 border-t border-rule pt-5">
        <summary className="label cursor-pointer hover:text-ochre transition-colors">
          {RECORD_AGAIN_SUMMARY}
        </summary>
        <div className="mt-4">
          <Offer
            storyId={storyId}
            ep={ep}
            offline={offline}
            recorded
            recordedLanguages={recordedLanguages}
          />
        </div>
      </details>
    );
  }

  // Nothing has ever been recorded for this episode, and nothing else on the
  // panel is worth reading. This is the primary case.
  return (
    <div className="mt-6 border-t border-rule pt-5">
      <div className="label text-ochre mb-3">{RECORD_HEADING}</div>
      <Offer
        storyId={storyId}
        ep={ep}
        offline={offline}
        recorded={false}
        recordedLanguages={recordedLanguages}
      />
    </div>
  );
}
