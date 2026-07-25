import type { Metadata } from "next";
import Link from "next/link";

import { Notice } from "@/components/Notice";
import { ScoutReplay } from "@/components/ScoutReplay";
import { loadCorpus } from "@/lib/data";
import { loadReplay } from "@/lib/replay";
import { requireEditor } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CanonForge — How stories are found",
  description:
    "What the story search looks for, and a replay of the search that filled the queue.",
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

/**
 * `loadReplay` explains a missing recording in the language of the file system,
 * which is the right language for the person who has to fix it and the wrong
 * one for the editor who just wants to know whether the screen is broken. Said
 * twice: the plain sentence on screen, the original kept underneath for whoever
 * runs the thing.
 */
function plainReason(reason: string): string {
  if (/^No recording/i.test(reason))
    return "No search has been recorded yet, so there is nothing to play back here.";
  if (/could not be read/i.test(reason))
    return "The saved recording is damaged — it looks as though it was cut off while being written, so it cannot be played back.";
  if (/no response output/i.test(reason))
    return "The saved recording opened, but there is nothing inside it to play back.";
  return "The saved recording could not be read, so there is nothing to play back.";
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
        ← Stories worth making
      </Link>

      <header className="mt-6">
        <div className="label">How stories are found</div>
        <h1 className="font-serif text-4xl tracking-tight mt-3 leading-tight">
          The story search
        </h1>
        <p className="mt-7 font-serif text-xl leading-relaxed prose-col">
          One search, run once. It reads the open web for real events that could
          still be finding trouble at episode 150, rates each one out of fifty,
          and says which of them we are allowed to make.
        </p>
      </header>

      {/*
        Permanently visible, above everything the playback shows. If a judge
        asks whether this is running now, the screen has already answered.
      */}
      <div className="mt-9 border border-rule-strong bg-surface rounded-sm px-6 py-5">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="label text-ochre shrink-0">A recording</span>
          <p className="text-sm text-muted prose-col leading-relaxed">
            {replay.ok ? (
              <>
                What follows is a recording of one real search
                {replay.savedAt ? `, made on ${replay.savedAt}` : ""}. Nothing is
                searching while you watch — it ran once, was saved, and every
                line it searched for, every page it opened and every number on
                this screen is read back from that saved copy. It is the same
                saved copy the story list is built from.
              </>
            ) : (
              <>
                This screen only ever plays back a search that already happened.
                Nothing is searching now, and there is no recording saved to
                play.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-12 grid lg:grid-cols-[1fr_18rem] gap-x-14 gap-y-10 items-start">
        <div className="space-y-10 min-w-0">
          <section>
            <h2 className="label">What it looks for</h2>
            <div className="mt-4 space-y-4 text-[0.9375rem] leading-relaxed prose-col text-muted">
              <p>
                How it was done, not how big it was. Ask for the biggest fraud
                and you get the six cases everyone has already made; ask for the
                strange thing somebody actually did — a swap, a whole invented
                institution, a person declared dead who walked back in — and you
                get the local story nobody in the room has read.
              </p>
              <p>
                Every source has to be a page it genuinely opened while
                searching. A story propped up on a half-remembered link is thrown
                out before it ever reaches your queue, because everything after
                this point trusts that the sources are real.
              </p>
              <p>
                And it argues with itself. Before backing a story it goes looking
                for a film or series already made about that exact event, and
                rules out whatever it finds — however well the story rated.
              </p>
            </div>
          </section>

          <section>
            <h2 className="label">The eight kinds of story — one of these, or it is out</h2>
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
              A story that fits none of them is dropped, however remarkable it
              is.
            </p>
          </section>
        </div>

        <aside>
          <h2 className="label mb-1">About this recording</h2>
          {replay.ok ? (
            <div>
              <Vital
                label="Time it took"
                value={
                  replay.durationSeconds !== null
                    ? `${replay.durationSeconds} seconds`
                    : "—"
                }
              />
              <div className="border-t border-rule pt-3 mt-1">
                <p className="text-xs text-faint leading-relaxed">
                  All of this is read from the saved recording, not from
                  anything running now. The counts that fill in as it plays come
                  from the same file.
                </p>
              </div>

              {/*
                Kept, not hidden: someone has to maintain this, and the file
                name is what makes the claim above checkable. It is simply not
                what an editor came here to read.
              */}
              <details className="mt-4 border-t border-rule pt-3">
                <summary className="label cursor-pointer hover:text-ochre transition-colors">
                  For whoever runs it
                </summary>
                <div className="mt-1">
                  <Vital label="Saved file" value={`data/cache/${replay.file}`} />
                  <Vital label="Model" value={replay.model ?? "—"} />
                  <Vital
                    label="Response items"
                    value={group(replay.outputItems)}
                  />
                  {replay.usage && (
                    <>
                      <Vital
                        label="Input tokens"
                        value={group(replay.usage.input)}
                      />
                      <Vital
                        label="Output tokens"
                        value={group(replay.usage.output)}
                      />
                    </>
                  )}
                </div>
              </details>
            </div>
          ) : (
            <p className="text-sm text-faint">No recording saved yet.</p>
          )}
        </aside>
      </div>

      {replay.ok ? (
        <ScoutReplay replay={replay} noveltyHref={noveltyHref} />
      ) : (
        <div className="mt-14 border-t border-rule-strong pt-8">
          <h2 className="label mb-4">Watch the search</h2>
          <Notice tone="warn">{plainReason(replay.reason)}</Notice>
          <p className="mt-5 text-sm text-muted prose-col">
            There is nothing to play back, and this screen will not act one out
            instead. The story list still shows every story that has already
            been found and saved.
          </p>
          <details className="mt-5">
            <summary className="label cursor-pointer hover:text-ochre transition-colors">
              For whoever runs it
            </summary>
            <p className="mt-2 font-mono text-xs text-faint prose-col leading-relaxed break-words">
              {replay.reason}
            </p>
          </details>
          <Link
            href="/sourcing"
            className="mt-8 inline-block border border-rule-strong px-5 py-2.5 text-sm rounded-sm hover:border-ochre hover:text-ochre transition-colors"
          >
            Open the story list →
          </Link>
        </div>
      )}
    </div>
  );
}
