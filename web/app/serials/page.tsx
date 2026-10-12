import Link from "next/link";
import "../series-motion.css";

import { SeriesCard, PageHead } from "@/components/ui";
import { Notice } from "@/components/Notice";
import { PRODUCT } from "@/app/layout";
import { hook } from "@/lib/presentation";
import { loadSlate, type SerialSummary } from "@/lib/serials";
import { requireEditor } from "@/lib/session";
import {
  STORY_LIST,
} from "@/lib/words";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${PRODUCT} — Your series`,
  description: "Shows we have commissioned, and how much of each one is written.",
};

/**
 * Loader notes name files. An editor needs the consequence instead: which show
 * is affected, and what is missing from the screen because of it.
 */
const NOTE_REWRITES: [RegExp, string][] = [
  [
    /no dossier\.json — not a commissioned season, skipped\./,
    "has no story file, so it is not a commissioned show. Left out.",
  ],
  [
    /dossier\.json will not parse \(.*\) — skipped\./,
    "the story file is damaged and cannot be read. Left out.",
  ],
  [
    /beats\.json will not parse — canon counts unavailable\./,
    "the record of what happens in the story is damaged, so those counts are missing.",
  ],
  [
    /promises\.json will not parse — the ledger is not shown\./,
    "the record of setups and payoffs is damaged, so it is not shown.",
  ],
  [
    /planned but not yet written — no episode files on disk\./,
    "is planned, but no episodes have been written yet.",
  ],
  [
    /the ledger declares (\d+) open and the rows count (\d+)\. The rows are shown\./,
    "the setups-and-payoffs summary says $1 are still open while the rows themselves come to $2. The rows are what is shown.",
  ],
  [
    /the season plans (\d+) episodes and (\d+) are written\./,
    "the plan runs to $1 episodes and $2 have been written.",
  ],
  [
    /No `data\/stories\/` directory\..*$/,
    "No shows have been written yet, so there is nothing to read here.",
  ],
  [
    /Every directory under `data\/stories\/` failed to load as a season\./,
    "Nothing in the shows folder could be read as a show.",
  ],
];

function plainNote(note: string): string {
  let out = note;
  for (const [pattern, replacement] of NOTE_REWRITES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function Row({ s }: { s: SerialSummary }) {
  return <li className="min-w-0">
    <SeriesCard href={`/serials/${s.id}`} id={s.id} title={s.title} gist={hook(s.oneLine ?? s.fantasy) ?? "A story summary hasn’t been added yet."} episodes={s.episodeCount} audioEpisodes={s.audioEpisodeCount} blocked={s.clearance?.status === "blocked"} />
  </li>;
}

export default async function SlatePage() {
  await requireEditor();
  const { serials, warnings } = await loadSlate();

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <PageHead title="Your series" />

      {warnings.length > 0 && (
        <div className="mt-8 space-y-3">
          {warnings.map((w, i) => (
            <Notice key={i} tone="info">
              {plainNote(w)}
            </Notice>
          ))}
        </div>
      )}

      {serials.length === 0 ? (
        <div className="mt-12 prose-col">
          {/* Take an empty library directly to stories available to commission. */}
          <p className="font-serif text-xl text-muted leading-relaxed">
            Nothing has been commissioned yet. Pick a story from{" "}
            <Link href="/sourcing" className="text-ochre hover:underline">
              {STORY_LIST}
            </Link>{" "}
            and have a season written; it will show up here.
          </p>
          {/* Outside any link, so opening it cannot navigate away. */}
          <details name="shows-operator" className="mt-6">
            <summary className="label cursor-pointer hover:text-ochre transition-colors">
              For whoever runs it
            </summary>
            <p className="mt-2 text-sm text-muted leading-relaxed">
              Seasons are written by{" "}
              <span className="font-mono text-[0.8125rem]">
                python tasks.py serial --event &lt;id&gt;
              </span>
              , which writes into{" "}
              <span className="font-mono text-[0.8125rem]">data/stories/</span>.
              This screen reads that folder.
            </p>
          </details>
        </div>
      ) : (
        <ul data-testid="show-library" className="studio-grid series-library mt-10">
          {serials.map((s) => (
            <Row
              key={s.id}
              s={s}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
