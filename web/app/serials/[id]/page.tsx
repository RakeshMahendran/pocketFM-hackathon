import Link from "next/link";
import { notFound } from "next/navigation";

import { ClearanceBadge } from "@/components/ClearanceBadge";
import { Notice } from "@/components/Notice";
import { SeasonSpine } from "@/components/SeasonSpine";
import { PublishPanel } from "@/components/PublishPanel";
import { loadCandidate } from "@/lib/data";
import { readChecks, readPublishState } from "@/lib/publish";
import { loadSerial, type Confidence, type PromiseLedger, type Serial } from "@/lib/serials";
import { requireEditor } from "@/lib/session";
import { loadRoster, type CastRow } from "@/lib/spinoffs";
import { SCORE_LABELS, type Scores } from "@/lib/types";
import {
  CAST_LIST_TITLE,
  HEADING,
  MEASURES,
  PROMOTION,
  ROSTER_EXPLAINED,
  category,
  rosterStanding,
  verdict,
} from "@/lib/words";

export const dynamic = "force-dynamic";

/**
 * The loader names gaps and problems by the file or field they came from. An
 * editor has seen neither, so both are said as the thing they would have been
 * told. Both tables belong in `lib/words.ts`; they are written here because
 * that file is owned elsewhere this session.
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

const NOTE_REWRITES: [RegExp, string][] = [
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
];

function plainNote(note: string): string {
  let out = note;
  for (const [pattern, replacement] of NOTE_REWRITES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * The lead and the opposition are free-form blocks whose keys differ by story.
 * Known ones are said as a question the line answers; anything else falls back
 * to the raw key with its underscores opened out.
 */
const PERSON_WORDS: Record<string, string> = {
  who: "who they are",
  wants: "what they want",
  wants_incompatibly: "what they want instead",
  ashamed_of: "what they are ashamed of",
  does_not_know_at_start: "what they do not know at the start",
};

function personLabel(key: string): string {
  return PERSON_WORDS[key] ?? key.replace(/_/g, " ");
}

/** How solid a claim is, said without the record-keeping vocabulary. */
const CONFIDENCE_WORDS: Record<Confidence, string> = {
  verified: "confirmed",
  reported: "reported at the time",
  alleged: "only alleged",
  disputed: "disputed",
};

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-rule pt-6">
      <div className="flex items-baseline justify-between gap-6 mb-4">
        <h2 className="label">{title}</h2>
        {aside && <span className="label">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * A claim's standing in the record. `alleged` and `disputed` are the two that
 * bind the writer — anything carrying them may only reach the script as an
 * accusation a character makes.
 */
const CONFIDENCE_LOOK: Record<Confidence, string> = {
  verified: "text-clear",
  reported: "text-muted",
  alleged: "text-caution",
  disputed: "text-halt",
};

function ScoreBars({ scores }: { scores: Scores }) {
  const keys = Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[];
  return (
    <div className="space-y-2.5">
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-3">
          <span className="label w-40 shrink-0" title={MEASURES[k]?.asks}>
            {MEASURES[k]?.label ?? SCORE_LABELS[k]}
          </span>
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

function Ledger({ ledger }: { ledger: PromiseLedger }) {
  if (ledger.absent) {
    return (
      <p className="text-sm text-muted leading-relaxed prose-col">
        Nobody tracked the setups and payoffs for this season. That record is
        what says whether a question the show raised ever got answered, so
        without it there is no way to tell a thread still running from one that
        was simply dropped.
      </p>
    );
  }

  if (!ledger.promises.length) {
    return (
      <p className="text-sm text-muted leading-relaxed prose-col">
        Setups and payoffs were tracked for this season, but none were recorded.
      </p>
    );
  }

  return (
    <div>
      <div className="flex gap-x-10 gap-y-4 flex-wrap items-end">
        <div>
          <div
            className={`font-mono text-3xl leading-none tabular-nums ${
              ledger.openCount > 0 ? "text-caution" : "text-clear"
            }`}
          >
            {ledger.openCount}
          </div>
          <div className="label mt-1.5">still unanswered</div>
        </div>
        <div>
          <div className="font-mono text-3xl leading-none tabular-nums">
            {ledger.paidCount}
          </div>
          <div className="label mt-1.5">answered</div>
        </div>
        {ledger.state && (
          <div className="label max-w-xs">where it stands — {ledger.state}</div>
        )}
      </div>

      {ledger.rule && (
        <p className="text-sm text-muted leading-relaxed mt-5 prose-col">
          {ledger.rule}
        </p>
      )}

      <ul className="mt-6 border-t border-rule">
        {ledger.promises.map((p) => (
          <li key={p.id} className="border-b border-rule py-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span
                className="font-mono text-[0.6875rem] text-faint"
                title="The reference this one is filed under."
              >
                {p.id}
              </span>
              <span className="label">
                set up in ep {p.raisedEp ?? "?"}
                {p.mustPayBy !== null && ` · should be answered by ep ${p.mustPayBy}`}
              </span>
              <span
                className={`label ${
                  p.state === "open"
                    ? "text-caution"
                    : p.state === "paid"
                      ? "text-clear"
                      : "text-faint"
                }`}
              >
                {p.state === "paid"
                  ? `answered in ep ${p.paidEp ?? "?"}`
                  : p.state === "open"
                    ? "still unanswered"
                    : "nobody recorded whether it was answered"}
              </span>
              {p.late && (
                <span
                  className="label text-caution"
                  title="Answered later than the season planned to answer it."
                >
                  late
                </span>
              )}
            </div>

            <p className="font-serif text-[1.0625rem] leading-relaxed mt-2 prose-col">
              {p.promise ??
                p.waitingFor ??
                "Nothing was written down about what this one promised."}
            </p>

            {p.promise && p.waitingFor && (
              <p className="text-sm text-muted leading-relaxed mt-2 prose-col">
                What the listener is waiting to find out: {p.waitingFor}
              </p>
            )}

            {p.howPaid && (
              <p className="text-sm text-muted leading-relaxed mt-2 prose-col border-l border-rule-strong pl-4">
                <span className="label block mb-1">How the show answers it</span>
                {p.howPaid}
              </p>
            )}
          </li>
        ))}
      </ul>

      {ledger.deliberatelyOpen.length > 0 && (
        <div className="mt-8">
          <h3 className="label mb-3">Left open on purpose</h3>
          <ul className="space-y-4">
            {ledger.deliberatelyOpen.map((d, i) => (
              <li key={i} className="prose-col">
                <p className="font-serif text-[1.0625rem] leading-relaxed">
                  {d.line}
                </p>
                <p className="text-sm text-muted leading-relaxed mt-1.5">
                  <span className="label">
                    ep {d.raisedEp ?? "?"} →{" "}
                    {d.settledEp ? `ep ${d.settledEp}` : "never settled"}
                  </span>{" "}
                  {d.how}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ledger.audit && (
        <p className="text-sm text-faint leading-relaxed mt-8 prose-col">
          {ledger.audit}
        </p>
      )}
    </div>
  );
}

function Header({ s }: { s: Serial }) {
  const rated = verdict(s.scores ? s.scores.total : null);
  return (
    <header className="mt-6 flex items-start justify-between gap-8 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <ClearanceBadge clearance={s.clearance} size="lg" />
          {s.category && <span className="label">{category(s.category)}</span>}
          <span
            className="font-mono text-[0.6875rem] text-faint"
            title="The reference this show is filed under."
          >
            {s.eventId ?? s.id}
          </span>
        </div>
        <h1 className="font-serif text-4xl tracking-tight mt-4 leading-tight">
          {s.title}
        </h1>
        {s.fantasy && (
          <p className="font-serif text-2xl text-muted italic mt-2">
            &ldquo;{s.fantasy}&rdquo;
          </p>
        )}
      </div>

      <div className="text-right shrink-0">
        <div className={`font-serif text-4xl leading-none ${rated.className}`}>
          {rated.word}
        </div>
        <div className="label mt-2">
          {s.scores ? `${s.scores.total} out of 50` : "never rated"}
        </div>
        <div className="label mt-3">
          {s.episodeCount} of {s.spineLength || s.episodeCount} episodes written
        </div>
      </div>
    </header>
  );
}

export default async function SeasonPage(props: PageProps<"/serials/[id]">) {
  await requireEditor();
  const { id } = await props.params;
  const storyId = decodeURIComponent(id);
  const s = await loadSerial(storyId);
  if (!s) notFound();

  // A commissioned season is written to a directory named after the story it
  // came from, so the id is the link back. The four hand-made seasons predate
  // the search and match nothing — for those there is no story to point at,
  // which is the honest answer rather than a broken link.
  const origin = await loadCandidate(storyId);
  // The roster is what turns the cast list from a credits roll into a set of
  // doors. It degrades to an empty list rather than throwing, so a season whose
  // beats were never seeded still renders the cast exactly as it did before.
  const [publishState, checks, roster] = await Promise.all([
    readPublishState(storyId),
    readChecks(storyId),
    loadRoster(storyId),
  ]);
  const standings = new Map<string, CastRow>(
    roster.rows.map((r) => [r.charId, r]),
  );

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <div className="flex items-baseline gap-6 flex-wrap">
        <Link href="/serials" className="label hover:text-ochre transition-colors">
          ← Shows we’re making
        </Link>
        {origin && (
          <Link
            href={`/candidates/${encodeURIComponent(storyId)}`}
            className="label text-ochre hover:text-paper transition-colors"
          >
            from the story list →
          </Link>
        )}
      </div>

      <Header s={s} />

      {s.oneLine && (
        <p className="mt-8 font-serif text-xl leading-relaxed prose-col text-paper">
          {s.oneLine}
        </p>
      )}

      {(s.notes.length > 0 || s.missing.length > 0) && (
        <div className="mt-8 space-y-3">
          {s.notes.map((n, i) => (
            <Notice key={i} tone="info">
              {plainNote(n)}
            </Notice>
          ))}
          {s.missing.length > 0 && (
            <Notice tone="info">
              Not recorded for this show: {partWords(s.missing)}. It was put
              together before we settled on what every show should come with, so
              these were never filled in.
            </Notice>
          )}
        </div>
      )}

      <div className="mt-12">
        <div className="flex items-baseline justify-between gap-6 mb-4">
          <h2 className="label">The season, episode by episode</h2>
          <span
            className="label"
            title="Everything the season treats as having really happened is recorded one by one, along with who was there — and who never finds out. That second part is what lets a side character carry their own show later without contradicting this one."
          >
            {s.beatCount} things happen · {s.beatsWithHiddenFrom} of them are kept
            from someone
          </span>
        </div>
        <SeasonSpine id={s.id} spine={s.spine} episodes={s.episodes} />
      </div>

      <div className="mt-14 grid lg:grid-cols-[1fr_20rem] gap-x-14 gap-y-8 items-start">
        <div className="space-y-10 min-w-0">
          {s.engine && (
            <Section title={HEADING.engine}>
              <p className="font-serif text-lg leading-relaxed prose-col">
                {s.engine}
              </p>
            </Section>
          )}

          <Section title={HEADING.sells}>
            {s.sells ? (
              <p className="font-serif text-lg leading-relaxed prose-col">
                {s.sells}
              </p>
            ) : (
              <p className="text-sm text-caution leading-relaxed prose-col">
                Nobody wrote a pitch line for this one, so there is no single
                sentence here saying what a listener is buying.
              </p>
            )}
            {s.whyThisWorks && (
              <>
                <h3 className="label mt-6 mb-2">Why it works</h3>
                <p className="text-[0.9375rem] text-muted leading-relaxed prose-col">
                  {s.whyThisWorks}
                </p>
              </>
            )}
          </Section>

          {/*
            The hinge of the whole console. An editor has just read the season;
            every name below is a show that could be made out of what that
            person was never told, and each one opens.
          */}
          <Section
            title={HEADING.cast}
            aside={
              <span className="flex items-baseline gap-4 flex-wrap justify-end">
                <span>
                  {s.castCount
                    ? `${s.castCount}, each wanting something different`
                    : "nobody recorded"}
                </span>
                {s.cast.length > 0 && (
                  <Link
                    href={`/serials/${encodeURIComponent(storyId)}/cast`}
                    className="text-ochre hover:text-paper transition-colors whitespace-nowrap"
                  >
                    {CAST_LIST_TITLE} →
                  </Link>
                )}
              </span>
            }
          >
            {s.cast.length === 0 ? (
              <p className="text-sm text-muted">
                No characters recorded. Every spin-off show starts from this
                list, so a season without one cannot be extended.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted leading-relaxed prose-col mb-5">
                  {ROSTER_EXPLAINED} Open any name to see what they saw, what
                  went on behind their back, and any episode already written for
                  them.
                </p>
                <ul className="divide-y divide-rule border-t border-rule">
                  {s.cast.map((c) => {
                    const row = standings.get(c.id) ?? null;
                    const standing = row ? rosterStanding(row) : null;
                    return (
                      <li key={c.id} className="py-4">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <Link
                            href={`/serials/${encodeURIComponent(storyId)}/cast/${encodeURIComponent(c.id)}`}
                            className="font-serif text-lg hover:text-ochre transition-colors"
                          >
                            {c.name}
                          </Link>
                          {standing && (
                            <span className={`label ${standing.className}`}>
                              {standing.label}
                            </span>
                          )}
                          {row && (row.witnessed > 0 || row.blind > 0) && (
                            <span className="label" title={standing?.why}>
                              in {row.witnessed} · missed {row.blind}
                            </span>
                          )}
                          {c.composite && (
                            <span
                              className="label"
                              title="Invented by combining several real people, so no single real person is being portrayed."
                            >
                              several people in one
                            </span>
                          )}
                        </div>
                        {c.role && (
                          <p className="text-sm text-muted leading-relaxed mt-1">
                            {c.role}
                          </p>
                        )}
                        {c.want && (
                          <p className="font-serif text-[0.9375rem] leading-relaxed mt-2 text-paper prose-col">
                            Wants: {c.want}
                          </p>
                        )}
                        {c.mapsTo && (
                          <p className="label mt-2">stands in for — {c.mapsTo}</p>
                        )}
                        {row && (row.hasBible || row.anchors.length > 0) && (
                          <p className="mt-2 flex items-baseline gap-3 flex-wrap">
                            {row.hasBible && (
                              <span className="label text-clear" title={PROMOTION.plain}>
                                {PROMOTION.done}
                              </span>
                            )}
                            {row.anchors.length > 0 && (
                              <span className="label text-ochre">
                                {row.anchors.length === 1
                                  ? "1 episode written"
                                  : `${row.anchors.length} episodes written`}
                              </span>
                            )}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Section>

          <Section
            title="What really happened, in order"
            aside={`${s.timeline.length} ${s.timeline.length === 1 ? "entry" : "entries"}`}
          >
            {s.timeline.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing recorded. Everything that happens in the scripts is
                supposed to point back to one of these entries, or be marked as
                invented for the show.
              </p>
            ) : (
              <ol className="border-t border-rule">
                {s.timeline.map((t) => (
                  <li key={t.id} className="border-b border-rule py-4">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="font-mono text-sm text-muted">
                        {t.date ?? "undated"}
                      </span>
                      <span
                        className={`label ${
                          t.confidence
                            ? CONFIDENCE_LOOK[t.confidence]
                            : "text-faint"
                        }`}
                        title={
                          t.confidence === "alleged" || t.confidence === "disputed"
                            ? "Not settled fact. A character can accuse someone of this; the narrator can never say it is true."
                            : undefined
                        }
                      >
                        {t.confidence
                          ? CONFIDENCE_WORDS[t.confidence]
                          : "nobody said how solid this is"}
                      </span>
                      <span
                        className="font-mono text-[0.6875rem] text-faint"
                        title="The reference this entry is filed under."
                      >
                        {t.id}
                      </span>
                    </div>
                    <p className="text-[0.9375rem] leading-relaxed mt-2 prose-col text-muted">
                      {t.what}
                    </p>
                    {t.source && (
                      <a
                        href={t.source}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="label mt-2 inline-block hover:text-ochre transition-colors break-all"
                      >
                        {t.source}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section
            title="Claims the narrator can never state as fact"
            aside={`${s.neverNarrateCount} of them`}
          >
            <p className="text-sm text-muted leading-relaxed prose-col mb-4">
              These come from the entries above that were only alleged or are
              still disputed. A character can accuse someone of any of them; the
              narrator can never say one is true.
            </p>
            {s.neverNarrate.length === 0 ? (
              <p className="text-sm text-caution leading-relaxed prose-col">
                Nothing is held back here. Either nothing about this story is
                contested, or nobody drew the list up — worth checking against
                what really happened before any more of this season is written.
              </p>
            ) : (
              <ul className="border-t border-halt/30">
                {s.neverNarrate.map((n, i) => (
                  <li
                    key={i}
                    className="border-b border-halt/30 py-4 text-[0.9375rem] leading-relaxed text-paper prose-col"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Questions the show raises, and where it answers them"
            aside={
              s.ledger.absent
                ? "not tracked"
                : `${s.ledger.openCount} of ${s.totalPromises} still unanswered`
            }
          >
            <Ledger ledger={s.ledger} />
          </Section>

          {s.calendar && (
            <Section
              title="When things happen"
              aside={s.calendar.seasonStart ?? undefined}
            >
              <p className="text-sm text-muted leading-relaxed prose-col">
                The scripts are written a few episodes at a time, so this is how
                episode twelve knows what month it is. Every date the story fixes
                gets written down here and handed to whoever writes the next
                batch.
              </p>

              {s.calendar.dates.length > 0 && (
                <ul className="mt-5 border-t border-rule">
                  {s.calendar.dates.map((d, i) => (
                    <li key={i} className="border-b border-rule py-3 flex gap-4 items-baseline">
                      <span className="label w-16 shrink-0">
                        {d.ep !== null ? `ep ${d.ep}` : "—"}
                      </span>
                      <span className="font-serif w-44 shrink-0">{d.when ?? "—"}</span>
                      <span className="text-sm text-muted flex-1 min-w-0">
                        {d.what ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {s.calendar.periods.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {s.calendar.periods.map((p, i) => (
                    <li key={i} className="text-sm text-muted">
                      {p.between.length === 2
                        ? `Between episodes ${p.between[0]} and ${p.between[1]}: `
                        : "Elapsed: "}
                      <span className="text-paper">{p.elapsed ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/*
                The most useful part. Where the real record contradicts itself,
                the scripts are required to say nothing rather than pick a
                winner — so this is the list of things deliberately left vague.
              */}
              {s.calendar.unresolved.length > 0 && (
                <div className="mt-6 border-l-2 border-caution/60 pl-4">
                  <div className="label text-caution">
                    Left vague on purpose
                  </div>
                  <p className="mt-2 text-sm text-muted leading-relaxed prose-col">
                    The real record disagrees with itself on these, so the
                    scripts never state them outright.
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {s.calendar.unresolved.map((u, i) => (
                      <li key={i} className="text-sm text-faint">
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}
        </div>

        <aside className="space-y-8">
          {/* First in the sidebar: it is the decision this page exists to support. */}
          <PublishPanel
            storyId={storyId}
            episodes={s.episodeCount}
            state={publishState}
            checks={checks}
          />

          {s.scores && (
            <Section title={HEADING.score} aside={`${s.scores.total} of 50`}>
              <ScoreBars scores={s.scores} />
            </Section>
          )}

          {s.clearance && s.clearance.reasons.length > 0 && (
            <Section title={HEADING.clearanceReasons}>
              <ul className="space-y-2.5">
                {s.clearance.reasons.map((r, i) => (
                  <li key={i} className="text-sm text-muted leading-relaxed">
                    {r}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {s.protagonist && (
            <Section title="Who it follows">
              <dl className="space-y-2.5">
                {Object.entries(s.protagonist).map(([k, v]) => (
                  <div key={k}>
                    <dt className="label">{personLabel(k)}</dt>
                    <dd className="text-sm text-muted leading-relaxed mt-1">{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {s.antagonist && (
            <Section title="Who is against them">
              <dl className="space-y-2.5">
                {Object.entries(s.antagonist).map(([k, v]) => (
                  <div key={k}>
                    <dt className="label">{personLabel(k)}</dt>
                    <dd className="text-sm text-muted leading-relaxed mt-1">{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          <Section
            title="Real name → name in the show"
            aside={s.fictionalizationMap.length ? undefined : "none set"}
          >
            {s.fictionalizationMap.length === 0 ? (
              <p className="text-sm text-halt leading-relaxed">
                No name changes recorded. Real names have to be swapped out
                before a word is written, so there is nothing here to prove that
                was done.
              </p>
            ) : (
              <dl className="space-y-3">
                {s.fictionalizationMap.map(([real, fake]) => (
                  <div key={real}>
                    <dt className="text-sm text-faint leading-snug">{real}</dt>
                    <dd className="text-sm text-paper leading-snug mt-0.5">
                      → {fake}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>

          <Section title={HEADING.novelty}>
            {s.priorAdaptations.length === 0 ? (
              <p className="text-sm text-clear">
                Nothing found. As far as we can tell, nobody has told this story
                before.
              </p>
            ) : (
              <ul className="space-y-2">
                {s.priorAdaptations.map((p, i) => (
                  <li key={i} className="text-sm text-muted leading-relaxed">
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={HEADING.sources}>
            {s.sources.length === 0 ? (
              <p className="text-sm text-halt">
                Nothing cited. Nobody recorded where this story came from.
              </p>
            ) : (
              <ul className="space-y-2">
                {s.sources.map((src, i) => (
                  <li key={i}>
                    <a
                      href={src}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-sm text-muted hover:text-ochre transition-colors break-all"
                    >
                      {src}
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
