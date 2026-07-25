import type { Metadata } from "next";
import Link from "next/link";

import { Notice } from "@/components/Notice";
import { ScoutReplay } from "@/components/ScoutReplay";
import { loadCorpus } from "@/lib/data";
import { loadReplay } from "@/lib/replay";
import { requireEditor } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CanonForge — Story scout",
  description:
    "The discovery agent: what it hunts for, and a playback of the run that filled the queue.",
};

/**
 * The eight categories are defined in src/discovery/prompts/hunter.md, which is
 * the prompt actually sent. Restated here rather than parsed out of it: this is
 * a page of prose, and a markdown scrape would break on the first edit to the
 * prompt's formatting while quietly rendering nothing.
 */
const CATEGORIES: [string, string][] = [
  [
    "Denied identity",
    "someone is not recognised as who they are, by people who should know",
  ],
  [
    "Secret status",
    "someone holds power, wealth or knowledge nobody around them suspects",
  ],
  ["Revenge", "a specific wrong was done, and someone comes back to collect"],
  [
    "The long deception",
    "a lie that must be maintained daily, by many people, at growing cost",
  ],
  ["Family betrayal", "inheritance, a will, a sibling, a marriage made for money"],
  ["The bargain comes due", "a debt or a promise made in desperation, arriving"],
  ["Supernatural intrusion", "a place, object or event with a memory"],
  ["The double life", "two families, two names, and the day they meet"],
];

function group(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function normalise(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function Vital({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-rule py-2.5">
      <span className="label">{label}</span>
      <span className="font-mono text-sm text-paper tabular-nums text-right break-all">
        {value}
      </span>
    </div>
  );
}

export default async function ScoutPage() {
  // Behind the same gate as the queue it links into. A screen that renders for
  // a signed-out visitor but whose every onward link bounces them to the picker
  // is just a broken door.
  await requireEditor();

  const replay = await loadReplay();

  // The blocked candidate is the point of the whole screen, so it should be
  // one click from the brief that explains the refusal. Matched by title
  // because the recording predates the ids the corpus builder assigns.
  let noveltyHref: string | null = null;
  if (replay.ok && replay.novelty[0]) {
    const wanted = normalise(replay.novelty[0].title);
    const { candidates } = await loadCorpus();
    const row = candidates.find((c) => normalise(c.title) === wanted);
    if (row) noveltyHref = `/candidates/${encodeURIComponent(row.id)}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <Link href="/sourcing" className="label hover:text-ochre transition-colors">
        ← Sourcing queue
      </Link>

      <header className="mt-6">
        <div className="label">Discovery</div>
        <h1 className="font-serif text-4xl tracking-tight mt-3 leading-tight">
          The story scout
        </h1>
        <p className="mt-7 font-serif text-xl leading-relaxed prose-col">
          One agent, one hunt. It searches the open web for real events whose
          mechanism could still be generating conflict at episode 150, grades
          each out of fifty, and says which of them we are allowed to adapt.
        </p>
      </header>

      {/*
        Permanently visible, above everything the playback shows. If a judge
        asks whether this is running now, the screen has already answered.
      */}
      <div className="mt-9 border border-rule-strong bg-surface rounded-sm px-6 py-5">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="label text-ochre shrink-0">Recording</span>
          <p className="text-sm text-muted prose-col leading-relaxed">
            {replay.ok ? (
              <>
                This is a playback of one real run
                {replay.savedAt ? ` recorded on ${replay.savedAt}` : ""}, read
                from{" "}
                <span className="font-mono text-faint">
                  data/cache/{replay.file}
                </span>
                . No model is called while you watch it. Discovery runs once,
                offline, into a committed corpus — the same file the sourcing
                queue is built from.
              </>
            ) : (
              <>
                This screen only ever plays back a recorded run — it never calls
                a model. There is no recording on disk to play.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-12 grid lg:grid-cols-[1fr_18rem] gap-x-14 gap-y-10 items-start">
        <div className="space-y-10 min-w-0">
          <section>
            <h2 className="label">What it is looking for</h2>
            <div className="mt-4 space-y-4 text-[0.9375rem] leading-relaxed prose-col text-muted">
              <p>
                Mechanism, not magnitude. Searching for the biggest fraud returns
                the six cases everyone has already adapted; searching for the
                strange thing that was actually done — a substitution, a
                fabricated institution, a person declared dead who came back —
                returns the local case no editor has read.
              </p>
              <p>
                Every citation must be a page it opened during the search. A
                candidate built on a remembered URL is discarded before it
                reaches the corpus, because everything downstream treats a corpus
                row as sourced.
              </p>
              <p>
                And it searches against itself. Before backing a candidate it
                looks for a film or series about that exact event, and blocks
                what it finds — however well the thing scored.
              </p>
            </div>
          </section>

          <section>
            <h2 className="label">The eight categories — a candidate must fit one</h2>
            <ol className="mt-4 border-t border-rule">
              {CATEGORIES.map(([name, gloss], i) => (
                <li
                  key={name}
                  className="border-b border-rule py-3 flex gap-4 items-baseline"
                >
                  <span className="font-mono text-xs text-faint tabular-nums shrink-0 w-4">
                    {i + 1}
                  </span>
                  <span className="font-serif w-52 shrink-0">{name}</span>
                  <span className="text-sm text-muted flex-1 min-w-0">
                    {gloss}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-faint prose-col">
              Anything fitting none of them is out, however remarkable.
            </p>
          </section>
        </div>

        <aside>
          <h2 className="label mb-1">The recorded run</h2>
          {replay.ok ? (
            <div>
              <Vital label="Model" value={replay.model ?? "—"} />
              <Vital
                label="Wall clock"
                value={
                  replay.durationSeconds !== null
                    ? `${replay.durationSeconds}s`
                    : "—"
                }
              />
              <Vital label="Response items" value={group(replay.outputItems)} />
              {replay.usage && (
                <>
                  <Vital label="Input tokens" value={group(replay.usage.input)} />
                  <Vital
                    label="Output tokens"
                    value={group(replay.usage.output)}
                  />
                </>
              )}
              <div className="border-t border-rule pt-3 mt-1">
                <p className="text-xs text-faint leading-relaxed">
                  Read from the cached response, not from a run happening now.
                  The counts the playback fills in are read from the same file.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-faint">Nothing recorded.</p>
          )}
        </aside>
      </div>

      {replay.ok ? (
        <ScoutReplay replay={replay} noveltyHref={noveltyHref} />
      ) : (
        <div className="mt-14 border-t border-rule-strong pt-8">
          <h2 className="label mb-4">Playback</h2>
          <Notice tone="warn">{replay.reason}</Notice>
          <p className="mt-5 text-sm text-muted prose-col">
            There is nothing to replay, and this screen will not stand in a
            simulation for it. The sourcing queue still renders whatever the
            corpus holds.
          </p>
          <Link
            href="/sourcing"
            className="mt-8 inline-block border border-rule-strong px-5 py-2.5 text-sm rounded-sm hover:border-ochre hover:text-ochre transition-colors"
          >
            Open the sourcing queue →
          </Link>
        </div>
      )}
    </div>
  );
}
