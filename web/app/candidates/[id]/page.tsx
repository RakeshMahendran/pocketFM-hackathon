import Link from "next/link";
import { notFound } from "next/navigation";

import { StoryArt } from "@/components/StoryArt";
import { Action, PageHead, Panel, Reveal, Stat } from "@/components/ui";
import { ScoreStrip } from "@/components/ScoreStrip";
import { hook } from "@/lib/presentation";
import { ClearanceBadge } from "@/components/ClearanceBadge";
import { CommissionAction } from "@/components/CommissionAction";
import { Notice } from "@/components/Notice";
import {
  CANDIDATE_BLOCKED,
  CANDIDATE_MADE,
  COMMISSION_COST,
} from "@/components/pathWords";
import { loadCandidate } from "@/lib/data";
import { requireEditor } from "@/lib/session";
import type { Scores } from "@/lib/types";
import {
  BAR_EXPLAINED,
  CLEARANCE,
  HEADING,
  IN_PRODUCTION,
  MEASURES,
  SCALE_EXPLAINED,
  SHOWS,
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
    <Reveal summary={title} group="candidate-evidence">{children}</Reveal>
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

  return <div>
    <Link href="/sourcing" className="label">← Discover</Link>
    <PageHead title={c.title} eyebrow={[category(c.category), c.year, c.where].filter(Boolean).join(" · ")} />
    <div className="workspace-columns">
      <div className="min-w-0">
        <StoryArt id={c.id} className="studio-hero-art" />
        {c.one_line && <p className="text-lg leading-relaxed mt-5 max-w-2xl">{hook(c.one_line)}</p>}
        <div className="mt-6">
          <Section title="Story overview"><p>{c.one_line}</p></Section>
          {c.mechanism && <Section title={HEADING.mechanism}><p>{c.mechanism}</p></Section>}
          {c.engine && <Section title={HEADING.engine}><p>{c.engine}</p></Section>}
          {c.why_this_sells && <Section title={HEADING.sells}><p>{c.why_this_sells}</p></Section>}
          {c.why_not && <Section title={HEADING.whyNot}><p>{c.why_not}</p></Section>}
          {c.cast.length > 0 && <Section title={`${HEADING.cast} — ${c.cast.length} people`}>
            <ul className="divide-y divide-rule">{c.cast.map((m,i) => <li key={i} className="py-4">
              <strong>{m.name_or_role}</strong><p className="text-muted mt-1">{m.motive}</p>
              {m.spinoff_potential && <span className="label">{SPINOFF_POTENTIAL[m.spinoff_potential]}</span>}
            </li>)}</ul>
          </Section>}
          {c.scores && <Section title={HEADING.score}><ScoreBars scores={c.scores} /></Section>}
          {c.clearance && c.clearance.reasons.length > 0 && <Section title={HEADING.clearanceReasons}><ul className="space-y-3">{c.clearance.reasons.map((r,i)=><li key={i}>{r}</li>)}</ul></Section>}
          <Section title={HEADING.novelty}>{c.prior_adaptations.length === 0 ? <p>No — nobody has adapted this. It’s ours if we want it.</p> : <ul>{c.prior_adaptations.map((p,i)=><li key={i}>{p}</li>)}</ul>}</Section>
          <Section title={HEADING.sources}>{c.sources.length === 0 ? <p className="text-halt">Nothing recorded. We can’t show you where this story came from, so treat it as unchecked until someone can point at a real source.</p> : <ul className="space-y-3">{c.sources.map((s,i)=><li key={i}><a href={s} target="_blank" rel="noreferrer noopener" className="break-all">{s}</a></li>)}</ul>}</Section>
        </div>
      </div>
      <Panel label="Commissioning decision" className="character-inspector">
        <ClearanceBadge clearance={c.clearance} size="lg" />
        {c.clearance && <p className="text-sm text-muted mt-3">{CLEARANCE[c.clearance.status].plain}</p>}
        {c.winner && <p className="label mt-3">{TOP_PICK}</p>}
        {c.origin === "commissioned" && <p className="label mt-2">{IN_PRODUCTION}</p>}
        <div className="studio-metrics my-6">
          <Stat value={c.scores ? `${c.scores.total}/50` : "—"} name={verdict(c.scores?.total ?? null).word} />
          <Stat value={c.episode_estimate ?? "—"} name="possible episodes" />
        </div>
        <div className="mb-6"><ScoreStrip scores={c.scores} size="lg" sortedBy={null} /></div>
        <div id="order-a-season">
          <h2 className="text-base mb-4">{c.madeAs ? "Already in your shows" : HEADING.commission}</h2>
          {c.madeAs ? <><Action href={`/serials/${encodeURIComponent(c.madeAs)}`}>Read the season →</Action><Reveal summary="About this commission" group="commission-help"><p>A season has been written from this story. You will find it with the rest of {SHOWS}.</p><p>{CANDIDATE_MADE.plain}</p></Reveal></> :
          <><p className="text-xs text-muted mb-4">{blocked ? CANDIDATE_BLOCKED.plain : COMMISSION_COST}</p><CommissionAction id={c.id} title={c.title} blocked={blocked} reasons={c.clearance?.reasons ?? []} editor={editor} estimate={c.episode_estimate} /></>}
          {blocked && <Link href="/sourcing" className="block mt-5">Choose another story →</Link>}
        </div>
      </Panel>
    </div>
    {c.missing.length > 0 && <div className="mt-8"><Notice tone="info">Some of the usual detail is missing on this one — it came from an earlier search that didn’t record everything. Worth a second look before you back it.</Notice></div>}
  </div>;
}
