import Link from "next/link";

import { ClearanceBadge } from "@/components/ClearanceBadge";
import { Notice } from "@/components/Notice";
import { loadCorpus } from "@/lib/data";
import type { Candidate } from "@/lib/types";

// The corpus is read at build time, not per request: a static export has no
// server to re-read it. Re-freezing a corpus now needs a rebuild to show up.

/** Where a row sits in the editor's pipeline. Derived from data, never invented. */
function stateOf(c: Candidate): { label: string; className: string } {
  if (c.origin === "commissioned")
    return { label: "Commissioned", className: "text-clear" };
  if (c.origin === "also-considered")
    return { label: "Passed over", className: "text-faint" };
  return c.winner
    ? { label: "Scout pick", className: "text-ochre" }
    : { label: "Candidate", className: "text-muted" };
}

function Row({ candidate }: { candidate: Candidate }) {
  const state = stateOf(candidate);
  const blocked = candidate.clearance?.status === "blocked";
  const meta = [
    candidate.category,
    candidate.year,
    candidate.where,
    candidate.sources.length ? candidate.domain : "unsourced",
  ].filter(Boolean);

  return (
    <Link
      href={`/candidates/${encodeURIComponent(candidate.id)}`}
      className={`group grid grid-cols-[3.5rem_1fr] gap-5 px-4 py-5 transition-colors hover:bg-surface ${
        blocked ? "opacity-70" : ""
      }`}
    >
      <div className="text-right">
        <div className="font-mono text-2xl leading-none tabular-nums">
          {candidate.scores ? candidate.scores.total : "—"}
        </div>
        <div className="label mt-1.5">/50</div>
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

        {candidate.why_not && (
          <p className="mt-2.5 text-sm text-faint prose-col leading-relaxed border-l border-rule pl-3">
            <span className="label mr-2">Passed</span>
            {candidate.why_not}
          </p>
        )}
      </div>
    </Link>
  );
}

export default async function SourcingQueue() {
  const { candidates, assembled, builtAt, warnings } = await loadCorpus();

  const blocked = candidates.filter((c) => c.clearance?.status === "blocked").length;
  const clearable = candidates.length - blocked;

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <div className="flex items-baseline justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Sourcing queue</h1>
          <p className="label mt-2">
            {assembled ? "Assembled from committed stories" : "Scout output"}
            {builtAt && ` · frozen ${builtAt.slice(0, 10)}`}
          </p>
        </div>

        {candidates.length > 0 && (
          <div className="flex items-baseline gap-6 text-sm">
            <span>
              <span className="font-mono text-lg">{candidates.length}</span>{" "}
              <span className="label">found</span>
            </span>
            <span>
              <span className="font-mono text-lg text-clear">{clearable}</span>{" "}
              <span className="label">clearable</span>
            </span>
            <span>
              <span
                className={`font-mono text-lg ${blocked ? "text-halt" : "text-faint"}`}
              >
                {blocked}
              </span>{" "}
              <span className="label">blocked</span>
            </span>
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="mt-8 space-y-3">
          {warnings.map((w, i) => (
            <Notice key={i}>{w}</Notice>
          ))}
        </div>
      )}

      {candidates.length === 0 ? (
        <div className="mt-16 border border-rule rounded-sm p-10">
          <h2 className="font-serif text-xl">Nothing to triage</h2>
          <p className="mt-3 text-sm text-muted prose-col leading-relaxed">
            The scout has not run, so there is no queue. Discovery is a live
            network call and never runs on the demo path — freeze a corpus once,
            commit it, and this screen reads it from then on.
          </p>
          <code className="mt-5 block font-mono text-sm text-ochre">
            python tasks.py corpus
          </code>
        </div>
      ) : (
        <div className="mt-10 divide-y divide-rule border-y border-rule">
          {candidates.map((c) => (
            <Row key={c.id} candidate={c} />
          ))}
        </div>
      )}
    </div>
  );
}
