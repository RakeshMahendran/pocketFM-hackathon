import Link from "next/link";
import { notFound } from "next/navigation";

import { ClearanceBadge } from "@/components/ClearanceBadge";
import { CommissionAction } from "@/components/CommissionAction";
import { Notice } from "@/components/Notice";
import { loadCandidate } from "@/lib/data";
import { SCORE_LABELS, type Scores } from "@/lib/types";

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
  const keys = Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[];
  return (
    <div className="space-y-2.5">
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-3">
          <span className="label w-40 shrink-0">{SCORE_LABELS[k]}</span>
          <span className="h-1 flex-1 bg-raised rounded-full overflow-hidden">
            <span
              className="block h-full bg-ochre/70"
              style={{ width: `${(scores[k] / 10) * 100}%` }}
            />
          </span>
          <span className="font-mono text-sm tabular-nums w-6 text-right">
            {scores[k]}
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function CandidateBrief(
  props: PageProps<"/candidates/[id]">,
) {
  const { id } = await props.params;
  const c = await loadCandidate(decodeURIComponent(id));
  if (!c) notFound();

  const blocked = c.clearance?.status === "blocked";

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <Link href="/" className="label hover:text-ochre transition-colors">
        ← Sourcing queue
      </Link>

      <header className="mt-6 flex items-start justify-between gap-8 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <ClearanceBadge clearance={c.clearance} size="lg" />
            {c.winner && <span className="label text-ochre">Scout pick</span>}
            {c.origin === "commissioned" && (
              <span className="label text-clear">Commissioned</span>
            )}
          </div>
          <h1 className="font-serif text-4xl tracking-tight mt-4 leading-tight">
            {c.title}
          </h1>
          <div className="label mt-3">
            {[c.category, c.year, c.where].filter(Boolean).join(" · ")}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="font-mono text-5xl leading-none tabular-nums">
            {c.scores ? c.scores.total : "—"}
          </div>
          <div className="label mt-2">out of 50</div>
          {c.episode_estimate && (
            <div className="label mt-3">~{c.episode_estimate} episodes</div>
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
            Missing from the source data:{" "}
            <span className="font-mono">{c.missing.join(", ")}</span>. This row
            predates the strict schema, so the fields were never produced.
          </Notice>
        </div>
      )}

      <div className="mt-10 grid lg:grid-cols-[1fr_20rem] gap-x-14 gap-y-8 items-start">
        <div className="space-y-8 min-w-0">
          {c.mechanism && (
            <Section title="What was actually done">
              <p className="text-[0.9375rem] leading-relaxed prose-col text-muted">
                {c.mechanism}
              </p>
            </Section>
          )}

          {c.engine && (
            <Section title="Engine — why it keeps generating">
              <p className="font-serif text-lg leading-relaxed prose-col">
                {c.engine}
              </p>
            </Section>
          )}

          {c.why_this_sells && (
            <Section title="The fear a listener recognises">
              <p className="text-[0.9375rem] leading-relaxed prose-col text-muted">
                {c.why_this_sells}
              </p>
            </Section>
          )}

          {c.why_not && (
            <Section title="Why it was passed over">
              <p className="text-[0.9375rem] leading-relaxed prose-col text-muted">
                {c.why_not}
              </p>
            </Section>
          )}

          {c.cast.length > 0 && (
            <Section title={`Cast — ${c.cast.length} with distinct motives`}>
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
                        {m.spinoff_potential} spinoff
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
            <h2 className="label mb-3">Commission</h2>
            <CommissionAction
              id={c.id}
              title={c.title}
              blocked={blocked}
              reasons={c.clearance?.reasons ?? []}
            />
          </div>

          {c.scores && (
            <Section title="Adaptability">
              <ScoreBars scores={c.scores} />
            </Section>
          )}

          {!blocked && c.clearance && c.clearance.reasons.length > 0 && (
            <Section title="Clearance reasoning">
              <ul className="space-y-2.5">
                {c.clearance.reasons.map((r, i) => (
                  <li key={i} className="text-sm text-muted leading-relaxed">
                    {r}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Novelty">
            {c.prior_adaptations.length === 0 ? (
              <p className="text-sm text-clear">No prior adaptation found.</p>
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

          <Section title="Sources">
            {c.sources.length === 0 ? (
              <p className="text-sm text-halt">
                None cited. The scout drops candidates citing pages it never
                opened, so this row predates that check.
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
