import Link from "next/link";

import { readCommission } from "@/lib/commission";
import { loadCandidate } from "@/lib/data";
import { requireEditor } from "@/lib/session";

export const dynamic = "force-dynamic";

// Writing a season takes minutes, so the page refreshes itself rather than
// asking someone to. A person who has just pressed a button should not have to
// know to press F5.
const REFRESH_SECONDS = 5;

const STEPS = [
  { key: "planning", label: "Working out the season" },
  { key: "writing", label: "Writing the episodes" },
];

function Step({
  label,
  state,
  detail,
}: {
  label: string;
  state: "done" | "current" | "waiting";
  detail?: string | null;
}) {
  const mark = state === "done" ? "✓" : state === "current" ? "▸" : "·";
  return (
    <li className="flex items-baseline gap-4 border-b border-rule py-4">
      <span
        className={`font-mono w-4 shrink-0 ${
          state === "done"
            ? "text-clear"
            : state === "current"
              ? "text-ochre"
              : "text-faint"
        }`}
      >
        {mark}
      </span>
      <span
        className={`font-serif text-lg ${
          state === "waiting" ? "text-faint" : ""
        }`}
      >
        {label}
      </span>
      <span className="label ml-auto text-right">
        {detail ?? (state === "current" ? "under way" : "")}
      </span>
    </li>
  );
}

/** Episodes written, not batches — that is what a person is counting. */
function EpisodeProgress({
  written,
  total,
  fromEp,
  toEp,
  reported,
}: {
  written: number;
  total: number;
  fromEp: number;
  toEp: number;
  /**
   * True when the run itself said which episodes are in flight. When it is
   * false the numbers came from counting finished batches on disk, which says
   * what is done but not what is being written — so the heading must not claim
   * a span it is guessing at.
   */
  reported: boolean;
}) {
  const pct = total > 0 ? Math.round((written / total) * 100) : 0;
  const span = fromEp === toEp ? `episode ${fromEp}` : `episodes ${fromEp}–${toEp}`;
  const next = written + 1;

  return (
    <div className="mt-8 max-w-2xl">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-serif text-lg">
          {reported
            ? `Writing ${span}`
            : written < total
              ? `Now on episode ${next}`
              : "Finishing up"}
        </span>
        <span className="font-mono text-sm tabular-nums text-muted">
          {written} of {total} done
        </span>
      </div>

      <div className="mt-3 h-1 bg-raised rounded-full overflow-hidden">
        <div
          className="h-full bg-ochre transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-3 text-sm text-faint">
        They come back a few at a time, so the count moves in steps rather than
        one by one.
      </p>
    </div>
  );
}

export default async function CommissioningPage(
  props: PageProps<"/commissioning/[id]">,
) {
  await requireEditor();
  const { id } = await props.params;
  const eventId = decodeURIComponent(id);

  const job = await readCommission(eventId);
  const candidate = await loadCandidate(eventId);
  const title = candidate?.title ?? eventId;

  const stepIndex = STEPS.findIndex((s) => s.key === job?.step);
  const failed = job?.state === "failed";
  const done = job?.state === "done";

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      {/* Only while there is something to watch. */}
      {job?.state === "running" && (
        <meta httpEquiv="refresh" content={String(REFRESH_SECONDS)} />
      )}

      <Link href="/sourcing" className="label hover:text-ochre transition-colors">
        ← Stories worth making
      </Link>

      <div className="label mt-6">
        {!job ? "Not started" : done ? "Ready" : failed ? "Stopped" : "Being made"}
      </div>
      <h1 className="font-serif text-4xl tracking-tight mt-3 leading-tight">
        {title}
      </h1>

      {!job && (
        <p className="mt-8 text-sm text-muted prose-col leading-relaxed">
          Nothing has been started for this one yet. Go back and press
          &ldquo;Make this one&rdquo; on its page.
        </p>
      )}

      {job && (
        <>
          <p className="mt-6 text-sm text-muted prose-col leading-relaxed">
            {done
              ? "The season is written. It has been checked against the rules it was written to follow, and it passed."
              : failed
                ? "It stopped before the season was finished. Nothing was saved — a half-written season is worse than none, because everything after this point would treat it as complete."
                : "This takes a few minutes. The page keeps itself up to date, so you can leave it open or come back later — nothing is lost if you close it."}
          </p>

          <ol className="mt-10 border-t border-rule max-w-2xl">
            {STEPS.map((s, i) => {
              const state =
                done || (stepIndex > -1 && i < stepIndex)
                  ? "done"
                  : i === stepIndex && !failed
                    ? "current"
                    : "waiting";
              // The count belongs on the row it describes, so the step and its
              // progress are read as one thing.
              const detail =
                s.key === "writing" && job.totalEpisodes
                  ? `${job.progress?.written ?? 0} of ${job.totalEpisodes} episodes`
                  : null;
              return (
                <Step key={s.key} label={s.label} state={state} detail={detail} />
              );
            })}
          </ol>

          {!done && !failed && job.progress && (
            <EpisodeProgress
              written={job.progress.written}
              total={job.progress.total}
              fromEp={job.progress.fromEp}
              toEp={job.progress.toEp}
              reported={job.progress.batch > 0}
            />
          )}

          {done && job.totalEpisodes && (
            <p className="mt-8 font-serif text-lg">
              {job.totalEpisodes} episodes written.
            </p>
          )}

          {failed && job.error && (
            <div className="mt-8 border-l-2 border-halt/60 pl-4 max-w-2xl">
              <div className="label text-halt">What went wrong</div>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                {job.error}
              </p>
            </div>
          )}

          {done && job.storyId && (
            <Link
              href={`/serials/${encodeURIComponent(job.storyId)}`}
              className="mt-10 inline-block border border-ochre/50 text-ochre px-5 py-2.5 text-sm rounded-sm hover:bg-ochre/10 transition-colors"
            >
              Read the season →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
