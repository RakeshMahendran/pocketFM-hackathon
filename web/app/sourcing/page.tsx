import Link from "next/link";

import { ClearanceBadge } from "@/components/ClearanceBadge";
import { NextStep } from "@/components/NextStep";
import { Notice } from "@/components/Notice";
import { FREE_CLICK, sourcingNext } from "@/components/pathWords";
import { loadCorpus } from "@/lib/data";
import { requireEditor } from "@/lib/session";
import {
  BAR_EXPLAINED,
  CASE_AGAINST,
  FOR_THE_OPERATOR,
  SEARCH_RAN,
  STORY_LIST_TITLE,
  category,
  stateOf,
  verdict,
} from "@/lib/words";
import type { Candidate } from "@/lib/types";

// Reads the filesystem on every request, so a fresh search shows up without a
// rebuild.
export const dynamic = "force-dynamic";

function Row({ candidate }: { candidate: Candidate }) {
  const state = stateOf(candidate);
  const call = verdict(candidate.scores?.total ?? null);
  const blocked = candidate.clearance?.status === "blocked";

  const meta = [
    category(candidate.category),
    candidate.year,
    candidate.where,
    candidate.sources.length ? candidate.domain : "no source recorded",
  ].filter(Boolean);

  return (
    <Link
      href={`/candidates/${encodeURIComponent(candidate.id)}`}
      className={`group grid grid-cols-[5rem_1fr] gap-5 px-4 py-5 transition-colors hover:bg-surface ${
        blocked ? "opacity-70" : ""
      }`}
    >
      {/* The word carries the judgement; the number is there for anyone who
          wants to argue with it. */}
      <div className="text-right">
        <div className={`text-sm ${call.className}`}>{call.word}</div>
        <div className="label mt-1 font-mono">
          {candidate.scores ? `${candidate.scores.total}/50` : "—"}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="font-serif text-lg leading-snug group-hover:text-ochre transition-colors">
            {candidate.title}
          </h2>
          <ClearanceBadge clearance={candidate.clearance} />
          <span className={`label ${state.className}`}>{state.label}</span>
        </div>

        {meta.length > 0 && (
          <div className="label mt-2 flex flex-wrap">
            {meta.map((m, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-2 text-rule-strong">·</span>}
                {m}
              </span>
            ))}
          </div>
        )}

        {candidate.one_line && (
          <p className="mt-2.5 text-sm text-muted prose-col leading-relaxed">
            {candidate.one_line}
          </p>
        )}

        {/* Every story carries one of these, the top pick included — it is the
            best argument against making it, not a note on why it was dropped. */}
        {candidate.why_not && (
          <p className="mt-2.5 text-sm text-faint prose-col leading-relaxed border-l border-rule pl-3">
            <span className="label mr-2">{CASE_AGAINST}</span>
            {candidate.why_not}
          </p>
        )}
      </div>
    </Link>
  );
}

export default async function SourcingQueue() {
  await requireEditor();
  const { candidates, assembled, builtAt, warnings } = await loadCorpus();

  const blocked = candidates.filter((c) => c.clearance?.status === "blocked").length;
  const canMake = candidates.length - blocked;

  // Thirty-four links, all drawn alike, and nothing saying which row a producer
  // is meant to open. The list is already sorted best first and pushes anything
  // blocked to the bottom, so the one to name is the search's own first place —
  // or, if it never named one, the best row we are actually allowed to touch.
  // Never a blocked row: pointing at a story nobody may commission is worse than
  // pointing at nothing.
  const makeable = candidates.filter((c) => c.clearance?.status !== "blocked");
  const winner = makeable.find((c) => c.winner) ?? null;
  const lead = winner ?? makeable[0] ?? null;
  const leadWords = lead
    ? sourcingNext({
        title: lead.title,
        top: Boolean(winner),
        made: Boolean(lead.madeAs),
      })
    : null;

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <div className="flex items-baseline justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">
            {STORY_LIST_TITLE}
          </h1>
          {/* The search that produced this list is the natural way back into
              it, and this line was the only place naming it — as inert text.
              /home held the app's single link to the replay. */}
          <p className="label mt-2">
            <Link href="/scout" className="hover:text-ochre transition-colors">
              {assembled ? SEARCH_RAN.earlier : SEARCH_RAN.latest}
              {builtAt && ` · searched ${builtAt.slice(0, 10)}`}
              {` · ${SEARCH_RAN.replay} →`}
            </Link>
          </p>
        </div>

        {candidates.length > 0 && (
          <div className="flex items-baseline gap-6 text-sm">
            <span>
              <span className="font-mono text-lg">{candidates.length}</span>{" "}
              <span className="label">found</span>
            </span>
            <span>
              <span className="font-mono text-lg text-clear">{canMake}</span>{" "}
              <span className="label">we can make</span>
            </span>
            <span>
              <span
                className={`font-mono text-lg ${blocked ? "text-halt" : "text-faint"}`}
              >
                {blocked}
              </span>{" "}
              <span className="label">we can&rsquo;t</span>
            </span>
          </div>
        )}
      </div>

      {candidates.length > 0 && (
        <p className="mt-4 text-sm text-faint prose-col">
          Sorted best first. {BAR_EXPLAINED} Anything we legally can&rsquo;t make
          sits at the bottom.
        </p>
      )}

      {lead && leadWords && (
        <div className="mt-8 max-w-2xl">
          <NextStep
            action={leadWords.action}
            href={`/candidates/${encodeURIComponent(lead.id)}`}
            cost={FREE_CLICK}
          >
            {leadWords.plain}
          </NextStep>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-8 space-y-3">
          {warnings.map((w, i) => (
            <Notice key={i}>{w}</Notice>
          ))}
        </div>
      )}

      {candidates.length === 0 ? (
        <div className="mt-16 border border-rule rounded-sm p-10">
          <h2 className="font-serif text-xl">No stories yet</h2>
          <p className="mt-3 text-sm text-muted prose-col leading-relaxed">
            Nobody has run a search yet. When one runs, it reads court records
            and news for real events that could carry a series, rates them, and
            checks whether we&rsquo;re allowed to make each one. What it finds
            is saved, so this list stays put until someone searches again.
          </p>
          {/* The command is real and someone needs it — but it is addressed to
              whoever runs the machine, not to the person reading this page. */}
          <details className="mt-6">
            <summary className="label cursor-pointer hover:text-ochre">
              {FOR_THE_OPERATOR}
            </summary>
            <code className="mt-3 block font-mono text-sm text-ochre">
              python tasks.py corpus
            </code>
          </details>
        </div>
      ) : (
        <div className="mt-8 divide-y divide-rule border-y border-rule">
          {candidates.map((c) => (
            <Row key={c.id} candidate={c} />
          ))}
        </div>
      )}
    </div>
  );
}
