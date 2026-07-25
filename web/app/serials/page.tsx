import Link from "next/link";

import { ClearanceBadge } from "@/components/ClearanceBadge";
import { Notice } from "@/components/Notice";
import { loadSlate, type SerialSummary } from "@/lib/serials";
import { requireEditor } from "@/lib/session";
import { SHOWS_TITLE, STORY_LIST, category, verdict } from "@/lib/words";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `CanonForge — ${SHOWS_TITLE}`,
  description: "Shows we have commissioned, and how much of each one is written.",
};

/**
 * The loader reports gaps by the name of the field that is missing. An editor
 * has never seen those names, so each one is said as the thing it would have
 * told them. Belongs in `lib/words.ts`; written here because that file is
 * owned elsewhere this session.
 */
const PART_WORDS: Record<string, string> = {
  season: "the episode-by-episode plan",
  cast: "the character list",
  timeline: "what really happened",
  clearance: "the legal check",
  never_narrate_as_fact: "the claims we cannot state as fact",
  fictionalization_map: "the name changes",
  sources: "where it came from",
  scores: "the rating",
  engine: "why it will not run out of story",
  category: "the genre",
  sells: "the pitch line",
};

function partWords(keys: string[]): string {
  return keys.map((k) => PART_WORDS[k] ?? k.replace(/_/g, " ")).join(", ");
}

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

function Stat({
  value,
  label,
  hint,
  tone,
}: {
  value: string | number;
  label: string;
  hint?: string;
  tone?: "ochre" | "caution";
}) {
  const colour =
    tone === "ochre" ? "text-ochre" : tone === "caution" ? "text-caution" : "text-paper";
  return (
    <div title={hint}>
      <div className={`font-mono text-lg tabular-nums leading-none ${colour}`}>
        {value}
      </div>
      <div className="label mt-1.5">{label}</div>
    </div>
  );
}

function Row({ s }: { s: SerialSummary }) {
  const rated = verdict(s.scores ? s.scores.total : null);
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
              {s.category && <span className="label">{category(s.category)}</span>}
              <span
                className="font-mono text-[0.6875rem] text-faint"
                title="The reference this show is filed under."
              >
                {s.id}
              </span>
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
            <div className={`font-serif text-2xl leading-none ${rated.className}`}>
              {rated.word}
            </div>
            <div className="label mt-1.5">
              {s.scores ? `${s.scores.total} out of 50` : "never rated"}
            </div>
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
            hint="Scripts finished, out of the number the plan calls for."
            tone={s.episodeCount === 0 ? "caution" : undefined}
          />
          <Stat
            value={s.castCount}
            label="characters"
            hint="Named people in the show. Each one could carry a spin-off later."
          />
          <Stat
            value={s.beatCount}
            label="things that happen"
            hint="Every event the season treats as having really happened, recorded one by one — including who was there and who never finds out."
          />
          <Stat
            value={s.promisesAbsent ? "—" : `${s.openPromises} / ${s.totalPromises}`}
            label={s.promisesAbsent ? "loose ends not tracked" : "loose ends still open"}
            hint="Questions the show raises for the listener, and how many of them it has answered."
            tone={s.openPromises > 0 ? "caution" : undefined}
          />
          <Stat
            value={s.neverNarrateCount}
            label="unproven claims"
            hint="Things a character may accuse someone of, but the narrator may never state as true."
            tone={s.neverNarrateCount > 0 ? "ochre" : undefined}
          />
        </div>

        {s.missing.length > 0 && (
          <p className="label mt-5 text-caution">
            not recorded for this show: {partWords(s.missing)}
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
          {/* The nav sends you here saying "Shows we're making" and this
              screen used to answer "The slate", which reads as a third
              destination. Both come from the one constant now. */}
          <h1 className="font-serif text-4xl tracking-tight leading-tight">
            {SHOWS_TITLE}
          </h1>
          <p className="mt-3 text-sm text-muted leading-relaxed prose-col">
            The shows we have commissioned. For each one: the plan the writer
            worked to, the scripts as they came back, and what the season leaves
            unanswered. Everything here started as a story in {STORY_LIST}.
          </p>
        </div>

        {serials.length > 0 && (
          <div className="label text-right">
            {serials.length} show{serials.length === 1 ? "" : "s"} ·{" "}
            {episodes} episodes · {open} loose end{open === 1 ? "" : "s"} still open
          </div>
        )}
      </div>

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
          {/* This pointed at "/", which is the sign-in picker — a signed-in
              editor is bounced straight back to their landing screen, and for
              one persona that is this page. */}
          <p className="font-serif text-xl text-muted leading-relaxed">
            Nothing has been commissioned yet. Pick a story from{" "}
            <Link href="/sourcing" className="text-ochre hover:underline">
              {STORY_LIST}
            </Link>{" "}
            and have a season written; it will show up here.
          </p>
          {/* Outside any link, so opening it cannot navigate away. */}
          <details className="mt-6">
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
        <ul className="mt-10 border-t border-rule">
          {serials.map((s) => (
            <Row key={s.id} s={s} />
          ))}
        </ul>
      )}
    </div>
  );
}
