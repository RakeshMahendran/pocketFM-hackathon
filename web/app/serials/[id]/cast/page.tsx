import Link from "next/link";
import { notFound } from "next/navigation";

import { Action, CharacterCard, PageHead, Panel, Reveal, Split } from "@/components/ui";
import { Notice } from "@/components/Notice";
import { ROSTER_NOBODY } from "@/components/pathWords";
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

export default async function CastPage(props: PageProps<"/serials/[id]/cast">) {
  await requireEditor();
  const { id } = await props.params;
  const storyId = decodeURIComponent(id);
  const query = await props.searchParams;

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
    (r) => r.promotable && r.anchors.length > 0,
    (r, i) => r.promotable && runs[i]?.state !== "running",
    (r) => r.promotable,
  ];
  let leadAt = -1;
  for (const wanted of preferences) {
    leadAt = roster.rows.findIndex(wanted);
    if (leadAt >= 0) break;
  }
  const lead = leadAt >= 0 ? roster.rows[leadAt] : null;

  const selectedId = typeof query.character === "string" ? query.character : null;
  const selected = roster.rows.find(r => r.charId === selectedId) ?? lead ?? roster.rows[0] ?? null;
  const selectedAt = selected ? roster.rows.indexOf(selected) : -1;
  const selectedRun = runs[selectedAt] ?? null;
  const base = `/serials/${encodeURIComponent(storyId)}/cast`;

  const background = (row: CastRow) => <>
    {row.role && <p>{row.role}</p>}
    {row.want && <p className="mt-3">Wants: {row.want}</p>}
    <p className="mt-3 text-muted">{rosterStanding(row).why}</p>
    <Made row={row} />
  </>;

  return (
    <div>
      <PageHead title="Cast" eyebrow={serial.title}
        description="Choose a character. Find the story the main show never told."
        action={<span className="label">{roster.rows.length} characters · {promotable} can lead a spin-off</span>} />
      {roster.warning && <div className="mb-6"><Notice tone="warn">{roster.warning}</Notice></div>}
      {selected ? <div className="cast-workspace">
        <div className="cast-grid">
          {roster.rows.map((row, i) => <CharacterCard key={row.charId} name={row.name}
            href={`${base}?character=${encodeURIComponent(row.charId)}`}
            selected={row.charId === selected.charId}
            dimmed={!row.promotable} status={rosterStanding(row).label}>
            <Split knows={row.witnessed} blind={row.blind} />
            {row.charId !== selected.charId && <div className="mt-3"><Reveal summary={`About ${row.name}`} group="cast-background">
              {background(row)}
              <p className="text-xs text-muted mt-4">{cost}</p>
              <div className="mt-3"><RowAction storyId={storyId} row={row} run={runs[i] ?? null} cost={cost} /></div>
            </Reveal></div>}
          </CharacterCard>)}
        </div>
        <Panel label="Selected character" className="character-inspector">
          <p className="label mb-2">Selected character</p>
          <h2>{selected.name}</h2>
          <p className="text-sm text-muted mt-2">{rosterStanding(selected).label}</p>
          <div className="my-6"><Split knows={selected.witnessed} blind={selected.blind} size="lg" /></div>
          <p className="text-sm text-muted">Their story can use what they know. Everything else stays out of reach.</p>
          <div className="inspector-action">
            {selected.promotable ? <Action href={`${base}/${encodeURIComponent(selected.charId)}`}>
              {selectedRun?.state === "running" ? "View progress" : selected.anchors.length ? "Open their episodes" : "Explore their story"} →
            </Action> : <><p className="text-sm mb-3">Not enough room for a spin-off.</p><Link href={`${base}/${encodeURIComponent(selected.charId)}`}>View character record →</Link></>}
            <p className="text-xs text-muted mt-2">Opening a character is free.</p>
          </div>
          <Reveal summary="Character details" group="character-inspector">
            <div data-testid="character-background">{background(selected)}</div>
          </Reveal>
          <Reveal summary="Production options" group="character-inspector">
            <p className="text-sm text-muted mb-4">{cost}</p>
            <RowAction storyId={storyId} row={selected} run={selectedRun} cost={cost} />
            {!selected.promotable && <p>{rosterStanding(selected).why}</p>}
          </Reveal>
        </Panel>
      </div> : <Panel><h2>No cast recorded</h2><p className="text-muted mt-2">This season has no character record to explore.</p><Link href={`/serials/${encodeURIComponent(storyId)}`} className="inline-block mt-4">Back to the season →</Link></Panel>}

      <div className="mt-10">
        <Reveal summary="About this cast" group="cast-reference">
          <p>{ROSTER_EXPLAINED}</p>
          <p className="mt-3">{roster.rows.length} people in the finished season · {promotable} could carry their own show · {worked} worked up · {written} with an episode already written</p>
          {canStart && <p className="mt-3">{cost}</p>}
          {roster.rows.length > 0 && worked === 0 && written === 0 && <p className="mt-3">Nobody on this season has been worked up yet, so there are no episodes to read. {PROMOTION.plain}</p>}
          {!lead && roster.rows.length > 0 && <p>{ROSTER_NOBODY.plain}</p>}
        </Reveal>
      </div>
    </div>
  );
}
