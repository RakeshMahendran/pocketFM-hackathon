import Link from "next/link";
import { notFound } from "next/navigation";

import { KnowledgeSplit } from "@/components/KnowledgeSplit";
import { Notice } from "@/components/Notice";
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

function Person({ storyId, row }: { storyId: string; row: CastRow }) {
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

  const [serial, roster] = await Promise.all([
    loadSerial(storyId),
    loadRoster(storyId),
  ]);
  if (!serial) notFound();

  const promotable = roster.rows.filter((r) => r.promotable).length;
  const worked = roster.rows.filter((r) => r.hasBible).length;
  const written = roster.rows.filter((r) => r.anchors.length > 0).length;

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
      </header>

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
          {roster.rows.map((row) => (
            <Person key={row.charId} storyId={storyId} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}
