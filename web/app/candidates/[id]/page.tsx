import Link from "next/link";
import { notFound } from "next/navigation";

import { ClearanceBadge } from "@/components/ClearanceBadge";
import { CommissionAction } from "@/components/CommissionAction";
import { Notice } from "@/components/Notice";
import { loadCandidate } from "@/lib/data";
import { requireEditor } from "@/lib/session";
import type { Scores } from "@/lib/types";
import {
  BAR_EXPLAINED,
  HEADING,
  IN_PRODUCTION,
  MEASURES,
  SCALE_EXPLAINED,
  SPINOFF_POTENTIAL,
  TOP_PICK,
  category,
  verdict,
} from "@/lib/words";

export const dynamic = "force-dynamic";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-rule pt-6">
      <h2 className="label mb-3">{title}</h2>
      {children}
    </section>
  );
}

function ScoreBars({ scores }: { scores: Scores }) {
  const keys = Object.keys(MEASURES) as (keyof typeof MEASURES)[];
  return (
    <div className="space-y-3">
      {keys.map((k) => (
        // The question each measure answers, on hover — nobody should have to
        // guess what "twists already there" was scoring.
        <div key={k} className="flex items-center gap-3" title={MEASURES[k].asks}>
          <span className="label w-36 shrink-0 normal-case tracking-normal text-[0.8125rem] text-muted">
            {MEASURES[k].label}
          </span>
          <span className="h-1 flex-1 bg-raised rounded-full overflow-hidden">
            <span
              className="block h-full bg-ochre/70"
              style={{ width: `${(scores[k as keyof Scores] / 10) * 100}%` }}
            />
          </span>
          <span className="font-mono text-sm tabular-nums w-6 text-right">
            {scores[k as keyof Scores]}
          </span>
        </div>
      ))}
      <p className="text-xs text-faint pt-1">
        {SCALE_EXPLAINED} {BAR_EXPLAINED}
      </p>
    </div>
  );
}

export default async function CandidateBrief(
  props: PageProps<"/candidates/[id]">,
) {
  // Deep-linkable, so it needs the guard even though you normally arrive here
  // from the queue. The editor is also the byline on anything commissioned.
  const editor = await requireEditor();

  const { id } = await props.params;
  const c = await loadCandidate(decodeURIComponent(id));
  if (!c) notFound();

  const blocked = c.clearance?.status === "blocked";

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <Link href="/sourcing" className="label hover:text-ochre transition-colors">
        ← Stories worth making
      </Link>

      <header className="mt-6 flex items-start justify-between gap-8 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <ClearanceBadge clearance={c.clearance} size="lg" />
            {c.winner && <span className="label text-ochre">{TOP_PICK}</span>}
            {c.origin === "commissioned" && (
              <span className="label text-clear">{IN_PRODUCTION}</span>
            )}
          </div>
          <h1 className="font-serif text-4xl tracking-tight mt-4 leading-tight">
            {c.title}
          </h1>
          <div className="label mt-3">
            {[category(c.category), c.year, c.where].filter(Boolean).join(" · ")}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div
            className={`font-serif text-3xl leading-none ${
              verdict(c.scores?.total ?? null).className
            }`}
          >
            {verdict(c.scores?.total ?? null).word}
          </div>
          <div className="label mt-2 font-mono">
            {c.scores ? `${c.scores.total}/50` : "not scored"}
          </div>
          {c.episode_estimate && (
            <div className="label mt-3">
              could run about {c.episode_estimate} episodes
            </div>
          )}
        </div>
      </header>

      {c.one_line && (
        <p className="mt-8 font-serif text-xl leading-relaxed prose-col text-paper">
          {c.one_line}
        </p>
      )}

      {c.missing.length > 0 && (
        <div className="mt-8">
          <Notice tone="info">
            Some of the usual detail is missing on this one — it came from an
            earlier search that didn&rsquo;t record everything. Worth a second
            look before you back it.
          </Notice>
        </div>
      )}

      <div className="mt-10 grid lg:grid-cols-[1fr_20rem] gap-x-14 gap-y-8 items-start">
        <div className="space-y-8 min-w-0">
          {c.mechanism && (
            <Section title={HEADING.mechanism}>
              <p className="text-[0.9375rem] leading-relaxed prose-col text-muted">
                {c.mechanism}
              </p>
            </Section>
          )}

          {c.engine && (
            <Section title={HEADING.engine}>
              <p className="font-serif text-lg leading-relaxed prose-col">
                {c.engine}
              </p>
            </Section>
          )}

          {c.why_this_sells && (
            <Section title={HEADING.sells}>
              <p className="text-[0.9375rem] leading-relaxed prose-col text-muted">
                {c.why_this_sells}
              </p>
            </Section>
          )}

          {c.why_not && (
            <Section title={HEADING.whyNot}>
              <p className="text-[0.9375rem] leading-relaxed prose-col text-muted">
                {c.why_not}
              </p>
            </Section>
          )}

          {c.cast.length > 0 && (
            <Section title={`${HEADING.cast} — ${c.cast.length} people`}>
              <ul className="divide-y divide-rule border-t border-rule">
                {c.cast.map((m, i) => (
                  <li key={i} className="py-3 flex gap-4 items-baseline">
                    <span className="font-serif w-52 shrink-0">{m.name_or_role}</span>
                    <span className="text-sm text-muted flex-1 min-w-0">
                      {m.motive}
                    </span>
                    {m.spinoff_potential && (
                      <span
                        className={`label shrink-0 ${
                          m.spinoff_potential === "high" ? "text-ochre" : ""
                        }`}
                      >
                        {SPINOFF_POTENTIAL[m.spinoff_potential]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <aside className="space-y-8">
          <div>
            <h2 className="label mb-3">{HEADING.commission}</h2>
            <CommissionAction
              id={c.id}
              title={c.title}
              blocked={blocked}
              reasons={c.clearance?.reasons ?? []}
              editor={editor}
              estimate={c.episode_estimate}
            />
          </div>

          {c.scores && (
            <Section title={HEADING.score}>
              <ScoreBars scores={c.scores} />
            </Section>
          )}

          {!blocked && c.clearance && c.clearance.reasons.length > 0 && (
            <Section title={HEADING.clearanceReasons}>
              <ul className="space-y-2.5">
                {c.clearance.reasons.map((r, i) => (
                  <li key={i} className="text-sm text-muted leading-relaxed">
                    {r}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={HEADING.novelty}>
            {c.prior_adaptations.length === 0 ? (
              <p className="text-sm text-clear">
                No — nobody has adapted this. It&rsquo;s ours if we want it.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {c.prior_adaptations.map((p, i) => (
                  <li key={i} className="text-sm text-muted">
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={HEADING.sources}>
            {c.sources.length === 0 ? (
              <p className="text-sm text-halt">
                Nothing recorded. We can&rsquo;t show you where this story came
                from, so treat it as unchecked until someone can point at a
                real source.
              </p>
            ) : (
              <ul className="space-y-2">
                {c.sources.map((s, i) => (
                  <li key={i}>
                    <a
                      href={s}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-sm text-muted hover:text-ochre transition-colors break-all"
                    >
                      {s}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}
