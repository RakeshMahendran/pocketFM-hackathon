import Link from "next/link";

import { ClearanceBadge } from "@/components/ClearanceBadge";
import { Notice } from "@/components/Notice";
import { loadSlate, type SerialSummary } from "@/lib/serials";
import { requireEditor } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CanonForge — Slate",
  description: "Commissioned seasons: what came back from the writer.",
};

function Stat({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone?: "ochre" | "caution";
}) {
  const colour =
    tone === "ochre" ? "text-ochre" : tone === "caution" ? "text-caution" : "text-paper";
  return (
    <div>
      <div className={`font-mono text-lg tabular-nums leading-none ${colour}`}>
        {value}
      </div>
      <div className="label mt-1.5">{label}</div>
    </div>
  );
}

function Row({ s }: { s: SerialSummary }) {
  return (
    <li className="border-b border-rule">
      <Link
        href={`/serials/${s.id}`}
        className="block py-7 group hover:bg-surface transition-colors -mx-4 px-4"
      >
        <div className="flex items-start justify-between gap-8 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <ClearanceBadge clearance={s.clearance} />
              {s.category && <span className="label">{s.category}</span>}
              <span className="font-mono text-[0.6875rem] text-faint">{s.id}</span>
            </div>

            <h2 className="font-serif text-2xl tracking-tight mt-3 leading-tight group-hover:text-ochre transition-colors">
              {s.title}
            </h2>

            {s.fantasy && (
              <p className="font-serif text-lg text-muted italic mt-1.5">
                &ldquo;{s.fantasy}&rdquo;
              </p>
            )}

            {s.oneLine && (
              <p className="text-sm text-muted leading-relaxed mt-3 prose-col">
                {s.oneLine}
              </p>
            )}
          </div>

          <div className="shrink-0 text-right">
            <div className="font-mono text-3xl leading-none tabular-nums">
              {s.scores ? s.scores.total : "—"}
            </div>
            <div className="label mt-1.5">out of 50</div>
          </div>
        </div>

        <div className="mt-6 flex gap-x-10 gap-y-4 flex-wrap">
          <Stat
            value={
              s.episodeCount === s.spineLength || !s.spineLength
                ? s.episodeCount
                : `${s.episodeCount}/${s.spineLength}`
            }
            label="episodes written"
            tone={s.episodeCount === 0 ? "caution" : undefined}
          />
          <Stat value={s.castCount} label="cast" />
          <Stat value={s.beatCount} label="canon beats" />
          <Stat
            value={s.promisesAbsent ? "—" : `${s.openPromises} / ${s.totalPromises}`}
            label={s.promisesAbsent ? "no ledger" : "promises open"}
            tone={s.openPromises > 0 ? "caution" : undefined}
          />
          <Stat
            value={s.neverNarrateCount}
            label="claims held back"
            tone={s.neverNarrateCount > 0 ? "ochre" : undefined}
          />
        </div>

        {s.missing.length > 0 && (
          <p className="label mt-5 text-caution">
            absent from the dossier: <span className="font-mono">{s.missing.join(", ")}</span>
          </p>
        )}
      </Link>
    </li>
  );
}

export default async function SlatePage() {
  await requireEditor();
  const { serials, warnings } = await loadSlate();

  const episodes = serials.reduce((n, s) => n + s.episodeCount, 0);
  const open = serials.reduce((n, s) => n + s.openPromises, 0);

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <div className="flex items-end justify-between gap-8 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl tracking-tight leading-tight">
            The slate
          </h1>
          <p className="mt-3 text-sm text-muted leading-relaxed prose-col">
            Seasons already generated: the plan the writer worked to, the canon it
            wrote, and the episodes themselves. Everything here was commissioned
            from the sourcing queue.
          </p>
        </div>

        {serials.length > 0 && (
          <div className="label text-right">
            {serials.length} season{serials.length === 1 ? "" : "s"} ·{" "}
            {episodes} episodes · {open} promise{open === 1 ? "" : "s"} still open
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="mt-8 space-y-3">
          {warnings.map((w, i) => (
            <Notice key={i} tone="info">
              {w}
            </Notice>
          ))}
        </div>
      )}

      {serials.length === 0 ? (
        <p className="mt-12 font-serif text-xl text-muted leading-relaxed prose-col">
          Nothing has been commissioned yet. Pick a candidate from the{" "}
          <Link href="/" className="text-ochre hover:underline">
            sourcing queue
          </Link>{" "}
          and generate a season; it will appear here.
        </p>
      ) : (
        <ul className="mt-10 border-t border-rule">
          {serials.map((s) => (
            <Row key={s.id} s={s} />
          ))}
        </ul>
      )}
    </div>
  );
}
