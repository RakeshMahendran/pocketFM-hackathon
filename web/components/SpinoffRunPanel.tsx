import { StartSpinoffRun } from "@/components/StartSpinoffRun";
import {
  RUN_HEADING,
  RUN_DONE,
  RUN_FAILED,
  RUN_STEPS,
  RUN_UNDER_WAY,
  STEP_ALREADY_DONE,
  STEP_STOPPED,
  STEP_UNDER_WAY,
  TRY_AGAIN,
  WHAT_WENT_WRONG,
  startAction,
  whatItWillDo,
} from "@/components/spinoffRunWords";
import type { SpinoffRunStatus } from "@/lib/spinoff-run";

/**
 * Starting a character's own episode, and watching it happen.
 *
 * The golden path ends here: a name in a finished season, clicked, and an
 * episode written for them live. Before this panel the console could only show
 * work somebody had already produced at a terminal.
 *
 * Three stages run, and the screen names all three the whole way through rather
 * than only the one in flight — a producer watching a bar move has no idea what
 * is being bought, and the middle stage is the one the product claim rests on.
 * Each stage also says what it means, in the same words the rest of the console
 * uses for that idea.
 *
 * The panel never decides anything. Whether a character can carry a show is
 * `promotable`, computed by `views.promotable()` in Python and passed in;
 * whether a run may proceed is Python's too. The most this does is withhold a
 * control whose answer is already known.
 */

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

/**
 * The three stages, in the order they run.
 *
 * A first stage that was skipped is marked finished and says so in the roster's
 * own words. `promotion_skipped` means a bible already existed and the one
 * expensive call was not paid for twice — rendering that as a stage which did
 * not happen would read as a failure, and would be the opposite of the truth.
 */
function Steps({ run }: { run: SpinoffRunStatus }) {
  const at = RUN_STEPS.findIndex((s) => s.key === run.step);
  const current = at > -1 && run.state === "running" ? RUN_STEPS[at] : null;

  return (
    <>
      <ol className="mt-5 border-t border-rule">
        {RUN_STEPS.map((step, i) => {
          const skipped = i === 0 && run.promotionSkipped;
          const mark: Mark =
            skipped || run.state === "done" || (at > -1 && i < at)
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
                skipped
                  ? STEP_ALREADY_DONE
                  : mark === "current"
                    ? STEP_UNDER_WAY
                    : mark === "stopped"
                      ? STEP_STOPPED
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
    </>
  );
}

export function SpinoffRunPanel({
  storyId,
  charId,
  run,
  hasBible,
  written,
  promotable,
  whyNot,
  offline,
}: {
  storyId: string;
  charId: string;
  /** Null when nobody has ever started one for this character. */
  run: SpinoffRunStatus | null;
  hasBible: boolean;
  /** Episodes already on disk for them. Turns "write" into "write again". */
  written: number;
  promotable: boolean;
  /** `rosterStanding().why` — why the control is withheld. Never restated here. */
  whyNot: string | null;
  offline: boolean;
}) {
  const start = (
    <StartSpinoffRun
      storyId={storyId}
      charId={charId}
      label={startAction({ hasBible, written })}
      disabled={!promotable}
      title={promotable ? undefined : (whyNot ?? undefined)}
    />
  );

  if (run?.state === "running") {
    return (
      <div className="mt-6 border border-ochre/40 bg-ochre/5 rounded-sm p-5">
        <div className="label text-ochre">{RUN_HEADING.running}</div>
        <Steps run={run} />
        <p className="mt-4 text-sm text-faint leading-relaxed prose-col">
          {RUN_UNDER_WAY}
        </p>
      </div>
    );
  }

  if (run?.state === "failed") {
    return (
      <div className="mt-6 border border-halt/40 bg-halt/5 rounded-sm p-5">
        <div className="label text-halt">{RUN_HEADING.failed}</div>
        <Steps run={run} />

        {run.error && (
          <div className="mt-5 border-l-2 border-halt/60 pl-4">
            <div className="label text-halt">{WHAT_WENT_WRONG}</div>
            <p className="mt-2 text-sm text-muted leading-relaxed prose-col">
              {run.error}
            </p>
          </div>
        )}

        <p className="mt-4 text-sm text-muted leading-relaxed prose-col">
          {RUN_FAILED}
        </p>

        <div className="mt-5">
          <StartSpinoffRun
            storyId={storyId}
            charId={charId}
            label={TRY_AGAIN}
            disabled={!promotable}
            title={promotable ? undefined : (whyNot ?? undefined)}
          />
        </div>
      </div>
    );
  }

  if (run?.state === "done") {
    return (
      <div className="mt-6 border border-clear/40 bg-clear/5 rounded-sm p-5">
        <div className="label text-clear">{RUN_HEADING.done}</div>
        <p className="mt-2 text-sm text-muted leading-relaxed prose-col">
          {RUN_DONE}
          {run.promotionSkipped &&
            " They were already worked up, so that pass was not run a second time."}
        </p>
        <div className="mt-5">{start}</div>
        <p className="mt-3 text-sm text-faint leading-relaxed prose-col">
          {whatItWillDo({ hasBible, written, offline })}
        </p>
      </div>
    );
  }

  // Nothing has ever been started for them. What it is about to spend is said
  // above the control, not behind it.
  return (
    <div className="mt-6 border border-rule rounded-sm p-5">
      <p className="text-sm text-muted leading-relaxed prose-col">
        {whatItWillDo({ hasBible, written, offline })}
      </p>
      {!promotable && whyNot && (
        <p className="mt-3 text-sm text-faint leading-relaxed prose-col">
          {whyNot}
        </p>
      )}
      <div className="mt-5">{start}</div>
    </div>
  );
}
