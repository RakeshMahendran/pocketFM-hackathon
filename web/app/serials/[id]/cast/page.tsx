import Link from "next/link";
import { notFound } from "next/navigation";

import { KnowledgeSplit } from "@/components/KnowledgeSplit";
import { NextStep } from "@/components/NextStep";
import { Notice } from "@/components/Notice";
import { FREE_CLICK, ROSTER_NOBODY, rosterNext } from "@/components/pathWords";
import { StartSpinoffRun } from "@/components/StartSpinoffRun";
import {
  ROW_FAILED,
  ROW_RUNNING,
  rosterCost,
  rowAction,
  rowOpen,
} from "@/components/spinoffRunWords";
import {
  readSpinoffRuns,
  spinoffRunIsOffline,
  type SpinoffRunStatus,
} from "@/lib/spinoff-run";
import { loadRoster, type CastRow } from "@/lib/spinoffs";
import { loadSerial } from "@/lib/serials";
import { requireEditor } from "@/lib/session";
import {
  CAST_LIST_TITLE,
  PROMOTION,
  ROSTER_EXPLAINED,
  rosterStanding,
} from "@/lib/words";

export const dynamic = "force-dynamic";

/**
 * Everyone the finished season built, ranked by how much of it went on without
 * them.
 *
 * The counts are computed by `src/canon/views.py` on every read and joined here
 * to whatever has already been generated. Nothing on this screen is stored, and
 * nothing on it is reimplemented — the rule for who could carry a serial lives
 * in Python and is asked, not copied.
 */

export async function generateMetadata(props: PageProps<"/serials/[id]/cast">) {
  const { id } = await props.params;
  const serial = await loadSerial(decodeURIComponent(id));
  return {
    title: serial ? `${CAST_LIST_TITLE} — ${serial.title}` : CAST_LIST_TITLE,
  };
}

/** What has already been paid for, said as work rather than as file counts. */
function Made({ row }: { row: CastRow }) {
  if (!row.hasBible && row.anchors.length === 0) return null;
  return (
    <div className="flex items-baseline gap-3 flex-wrap mt-2">
      {row.hasBible && (
        <span className="label text-clear" title={PROMOTION.plain}>
          {PROMOTION.done}
        </span>
      )}
      {row.anchors.length > 0 && (
        <span className="label text-ochre">
          {row.anchors.length === 1
            ? "1 episode written"
            : `${row.anchors.length} episodes written`}
        </span>
      )}
    </div>
  );
}

/**
 * The one thing this row offers to do next, and never two of them.
 *
 * A character with episodes already written is offered those rather than
 * another paid run — the roster is where somebody browses, and the cheapest
 * mistake to make here is starting a run for work that already exists. A run
 * under way or stopped sends them to the character's own page, which is the
 * only screen that watches one.
 *
 * No button at all when `promotable` is false. That is `views.promotable()`'s
 * judgement, arriving through `loadRoster`; the row already prints its reason
 * in `standing.why` two lines above.
 */
function RowAction({
  storyId,
  row,
  run,
  cost,
}: {
  storyId: string;
  row: CastRow;
  run: SpinoffRunStatus | null;
  /** What starting one spends, so the control carries it as well as the header. */
  cost: string;
}) {
  const href = `/serials/${encodeURIComponent(storyId)}/cast/${encodeURIComponent(row.charId)}`;

  if (run?.state === "running") {
    return (
      <Link href={href} className="label text-ochre hover:text-paper transition-colors">
        {ROW_RUNNING}
      </Link>
    );
  }

  if (run?.state === "failed") {
    return (
      <Link href={href} className="label text-halt hover:text-paper transition-colors">
        {ROW_FAILED}
      </Link>
    );
  }

  if (row.anchors.length > 0) {
    return (
      <Link href={href} className="label text-ochre hover:text-paper transition-colors">
        {rowOpen(row.anchors.length)}
      </Link>
    );
  }

  if (!row.promotable) return null;

  return (
    <StartSpinoffRun
      storyId={storyId}
      charId={row.charId}
      label={rowAction(row.hasBible)}
      variant="row"
      title={cost}
    />
  );
}

function Person({
  storyId,
  row,
  run,
  cost,
}: {
  storyId: string;
  row: CastRow;
  run: SpinoffRunStatus | null;
  cost: string;
}) {
  const standing = rosterStanding(row);
  const href = `/serials/${encodeURIComponent(storyId)}/cast/${encodeURIComponent(row.charId)}`;

  return (
    <li className="border-b border-rule py-6 grid lg:grid-cols-[1fr_15rem] gap-x-12 gap-y-5 items-start">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <Link
            href={href}
            className="font-serif text-2xl tracking-tight hover:text-ochre transition-colors"
          >
            {row.name}
          </Link>
          <span className={`label ${standing.className}`}>{standing.label}</span>
        </div>

        {row.role && (
          <p className="text-sm text-muted leading-relaxed mt-1.5 prose-col">
            {row.role}
          </p>
        )}

        {row.want && (
          <p className="font-serif text-[1.0625rem] leading-relaxed mt-3 prose-col text-paper">
            Wants: {row.want}
          </p>
        )}

        <p className="text-sm text-muted leading-relaxed mt-3 prose-col">
          {standing.why}
        </p>

        <Made row={row} />

        <div className="mt-4">
          <RowAction storyId={storyId} row={row} run={run} cost={cost} />
        </div>
      </div>

      <div className="lg:pt-1">
        <KnowledgeSplit witnessed={row.witnessed} blind={row.blind} />
      </div>
    </li>
  );
}

export default async function CastPage(props: PageProps<"/serials/[id]/cast">) {
  await requireEditor();
  const { id } = await props.params;
  const storyId = decodeURIComponent(id);

  const [serial, roster, offline] = await Promise.all([
    loadSerial(storyId),
    loadRoster(storyId),
    spinoffRunIsOffline(),
  ]);
  if (!serial) notFound();

  // Read after the roster, because it is the roster that says who is on it. One
  // small file per character, so this is a handful of reads and it is what
  // stops a row offering to start a run that is already going.
  const runs = await readSpinoffRuns(
    storyId,
    roster.rows.map((r) => r.charId),
  );

  const promotable = roster.rows.filter((r) => r.promotable).length;
  const worked = roster.rows.filter((r) => r.hasBible).length;
  const written = roster.rows.filter((r) => r.anchors.length > 0).length;

  // Said once, above the list. Twenty rows cannot each carry a sentence, and a
  // producer should not have to hover a button to find out it spends money.
  const cost = rosterCost(offline);
  const canStart = roster.rows.some((r) => r.promotable);

  // Eighteen names and eight identical paid buttons, with nothing saying which
  // one to touch. The row named here is somebody already written where there is
  // one — free to read, and the strongest thing on the screen — otherwise the
  // first name the roster ranks, which is the one shut out of the most.
  //
  // The step offered is deliberately the free one. Opening a person costs
  // nothing; the paid button lives on their own page with the sentence that says
  // what it spends, and that is the right order to meet the two in.
  //
  // A row with a run already going is passed over where there is an alternative:
  // the point of naming one is to offer a free click, and a run under way is
  // something to watch rather than something to start. The wording still handles
  // it, because on a small cast it can be the only row left.
  const preferences: ((r: CastRow, i: number) => boolean)[] = [
    (r) => r.anchors.length > 0,
    (r, i) => r.promotable && runs[i]?.state !== "running",
    (r) => r.promotable,
  ];
  let leadAt = -1;
  for (const wanted of preferences) {
    leadAt = roster.rows.findIndex(wanted);
    if (leadAt >= 0) break;
  }
  const lead = leadAt >= 0 ? roster.rows[leadAt] : null;
  const leadWords = lead
    ? rosterNext({
        name: lead.name,
        witnessed: lead.witnessed,
        blind: lead.blind,
        written: lead.anchors.length,
        running: runs[leadAt]?.state === "running",
      })
    : null;

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <Link
        href={`/serials/${encodeURIComponent(storyId)}`}
        className="label hover:text-ochre transition-colors"
      >
        ← {serial.title}
      </Link>

      <header className="mt-6">
        <h1 className="font-serif text-4xl tracking-tight leading-tight">
          {CAST_LIST_TITLE}
        </h1>
        <p className="mt-5 font-serif text-xl leading-relaxed prose-col text-paper">
          {ROSTER_EXPLAINED}
        </p>
        {roster.rows.length > 0 && (
          <p className="label mt-5">
            {roster.rows.length} people in the finished season · {promotable}{" "}
            could carry their own show · {worked} worked up · {written} with an
            episode already written
          </p>
        )}

        {canStart && (
          <p className="mt-4 text-sm text-muted leading-relaxed prose-col">
            {cost}
          </p>
        )}
      </header>

      {lead && leadWords ? (
        <div className="mt-8 max-w-2xl">
          <NextStep
            action={leadWords.action}
            href={`/serials/${encodeURIComponent(storyId)}/cast/${encodeURIComponent(lead.charId)}`}
            cost={FREE_CLICK}
          >
            {leadWords.plain}
          </NextStep>
        </div>
      ) : (
        roster.rows.length > 0 && (
          <div className="mt-8 max-w-2xl">
            <NextStep
              tone="onward"
              action={ROSTER_NOBODY.action}
              href={`/serials/${encodeURIComponent(storyId)}`}
            >
              {ROSTER_NOBODY.plain}
            </NextStep>
          </div>
        )
      )}

      {roster.warning && (
        <div className="mt-8">
          <Notice tone="warn">{roster.warning}</Notice>
        </div>
      )}

      {/* A season nobody has extended yet is the normal state, not a fault.
          Saying so stops the screen reading as though something failed. */}
      {roster.rows.length > 0 && worked === 0 && written === 0 && (
        <div className="mt-8">
          <Notice tone="info">
            Nobody on this season has been worked up yet, so there are no
            episodes to read. {PROMOTION.plain}
          </Notice>
        </div>
      )}

      {roster.rows.length > 0 && (
        <ul className="mt-10 border-t border-rule">
          {roster.rows.map((row, i) => (
            <Person
              key={row.charId}
              storyId={storyId}
              row={row}
              run={runs[i] ?? null}
              cost={cost}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
