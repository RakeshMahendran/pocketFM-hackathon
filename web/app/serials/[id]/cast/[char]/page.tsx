import Link from "next/link";
import { notFound } from "next/navigation";

import { ClearanceBadge } from "@/components/ClearanceBadge";
import { ContinuityVerdict } from "@/components/ContinuityVerdict";
import { EpisodeScript, listenMinutes } from "@/components/EpisodeScript";
import { Fold } from "@/components/Fold";
import { KnowledgeSplit } from "@/components/KnowledgeSplit";
import { NextStep } from "@/components/NextStep";
import {
  ALIGNMENT_FOLD,
  CHARACTER_TOO_THIN,
  CHARACTER_WRITE,
  FOLD_EXPLAINED,
  FREE_CLICK,
  WRITER_FOLD,
  bibleLineCount,
  characterDone,
  crossingCount,
  momentCount,
  scriptLength,
  stretchCount,
} from "@/components/pathWords";
import { Notice } from "@/components/Notice";
import {
  AnchorCard,
  ControlComparison,
  Crossings,
  SpinoffHeader,
} from "@/components/SpinoffEpisode";
import { SpinoffRunPanel } from "@/components/SpinoffRunPanel";
import { loadSerial } from "@/lib/serials";
import { readSpinoffRun, spinoffRunIsOffline } from "@/lib/spinoff-run";
import {
  listSpinoffs,
  loadCharacter,
  loadSpinoff,
  type Character,
  type Spinoff,
  type SpinoffListing,
} from "@/lib/spinoffs";
import { requireEditor } from "@/lib/session";
import {
  BIBLE,
  CANON_TIER,
  CAST_LIST_TITLE,
  CHARACTER_VIEW,
  PROMOTION,
  SPINOFF_HEADING,
  SPINOFF_TITLE,
  rosterStanding,
} from "@/lib/words";

/**
 * WHAT IS OPEN AND WHAT IS FOLDED, AND WHY
 *
 * This screen rendered six thousand words, four and a half thousand of them two
 * complete scripts printed inline, and it is the screen the product is sold on.
 * A producer arriving at it needed to scroll past two full episodes to find the
 * second one's verdict.
 *
 * What decides something stays open, always:
 *   - what they saw and what went on behind their back, as counts
 *   - the verdict on every episode, with both counts beside it
 *   - the constrained version against its control, and the findings the control
 *     picked up — that pair IS the guarantee, and it is not foldable
 *
 * What is looked up rather than read stays, one click away:
 *   - the script
 *   - the moment in the main show the episode is built on, and the crossings
 *   - the ledger of where they were while the season looked elsewhere
 *   - everything the season records them being there for
 *   - what the check tried and ruled out
 *
 * Nothing is deleted. `FOLD_EXPLAINED` says so on the screen, because a reader
 * who suspects something was cut trusts the rest of it less.
 */

export const dynamic = "force-dynamic";

/**
 * How often the page reloads itself while an episode is being written. The same
 * five seconds `/commissioning/[id]` uses, and the same reason: somebody who
 * has just pressed a button should not have to know to press F5. It is only
 * emitted while a run is actually going.
 */
const REFRESH_SECONDS = 5;

/**
 * One side character, and the show made out of what they were never told.
 *
 * The click that gets here is the product claim: a name in a finished season,
 * opened, turns out to have an episode of its own with a continuity verdict
 * attached. So the page answers three questions in order — who is this, what
 * don't they know, and can what was written for them go out.
 *
 * Everything a spin-off writes back is `branch_canon`. Nothing on this screen
 * is allowed to suggest it changes a word of the season it came from.
 */

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

/** What promotion produced, minus the fields that are only meaningful in code. */
function Brief({ character }: { character: Character }) {
  const held = character.bible;
  if (!held) {
    return (
      <Section title={BIBLE.label}>
        <p className="text-sm text-muted leading-relaxed prose-col">
          {PROMOTION.plain}
        </p>
        <p className="text-sm text-caution leading-relaxed mt-4 prose-col">
          It has not been run for this character, so there is no brief to read
          and nothing for a writer to work from yet.
        </p>
      </Section>
    );
  }

  const b = held.bible;
  const lines: [string, string | null][] = [
    [SPINOFF_HEADING.want, b.want],
    ["What it cost them", b.wound],
    [SPINOFF_HEADING.voice, b.voice],
    ["Why their show won’t run out of story", b.engine],
    ["What their show is about instead", b.reframe],
  ];
  const filled = lines.filter((l): l is [string, string] => Boolean(l[1]));

  return (
    <Section title={BIBLE.label} aside={b.genre ?? undefined}>
      <p className="text-sm text-muted leading-relaxed prose-col">
        {BIBLE.plain}
      </p>

      {b.pitch && (
        <p className="font-serif text-2xl leading-snug mt-6 prose-col text-paper">
          {b.pitch}
        </p>
      )}

      {/* The pitch above is what a commissioner reads; these five are what a
          writer works from, and they run to four hundred words of prose the
          screen was printing before anybody had decided to make the thing. */}
      <div className="mt-8">
        <Fold title={WRITER_FOLD} aside={bibleLineCount(filled.length)}>
          <dl className="border-t border-rule">
            {filled.map(([label, value]) => (
              <div key={label} className="border-b border-rule py-4">
                <dt className="label">{label}</dt>
                <dd className="text-[0.9375rem] text-muted leading-relaxed mt-2 prose-col">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Fold>
      </div>

      {/* The constraint set, in full. It is the writer's input rather than the
          reader's — the counts above already say how much of it there is. */}
      {held.facts.length > 0 && (
        <div className="mt-8">
          <Fold
            title="Everything the season records them being there for"
            aside={momentCount(held.facts.length)}
          >
            <ul className="border-t border-rule">
              {held.facts.map((f, i) => (
                <li
                  key={i}
                  className="border-b border-rule py-3 text-sm text-muted leading-relaxed prose-col"
                >
                  {f}
                </li>
              ))}
            </ul>
          </Fold>
        </div>
      )}
    </Section>
  );
}

/** knows / blind / gaps, said as three things an editor can act on. */
function ThreeViews({ character }: { character: Character }) {
  const ledger = character.bible?.bible.offscreenLedger ?? [];

  return (
    <Section title="What this character knows">
      <KnowledgeSplit
        witnessed={character.witnessed}
        blind={character.blind}
        size="lg"
        explain
      />

      <div className="mt-10 grid md:grid-cols-3 gap-x-10 gap-y-8">
        <div>
          <h3 className="label text-ochre">{CHARACTER_VIEW.knows.label}</h3>
          <p className="text-sm text-muted leading-relaxed mt-2">
            {CHARACTER_VIEW.knows.plain}
          </p>
        </div>
        <div>
          <h3 className="label">{CHARACTER_VIEW.blind.label}</h3>
          <p className="text-sm text-muted leading-relaxed mt-2">
            {CHARACTER_VIEW.blind.plain}
          </p>
        </div>
        <div>
          <h3 className="label">{CHARACTER_VIEW.gaps.label}</h3>
          <p className="text-sm text-muted leading-relaxed mt-2">
            {CHARACTER_VIEW.gaps.plain}
          </p>
        </div>
      </div>

      {/* The offscreen ledger IS the gaps, filled in — the one part of the
          brief that is about the runs of the season this person is absent
          from, which is where a spin-off is free to invent. */}
      {ledger.length > 0 && (
        <div className="mt-10">
          <Fold
            title="Where they were while the main show looked elsewhere"
            aside={stretchCount(ledger.length)}
          >
            <ul className="border-t border-rule">
              {ledger.map((w, i) => (
                <li key={i} className="border-b border-rule py-4">
                  {w.window && <span className="label">{w.window}</span>}
                  {w.what && (
                    <p className="text-[0.9375rem] text-muted leading-relaxed mt-2 prose-col">
                      {w.what}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Fold>
        </div>
      )}

      {ledger.length === 0 && character.bible && (
        <p className="text-sm text-faint leading-relaxed mt-8 prose-col">
          Nothing was written down about where this character was during the
          stretches they do not appear in.
        </p>
      )}
    </Section>
  );
}

/**
 * One episode. The verdict and the control pair are open; the rest is one click.
 *
 * The order is the order a producer asks in — what is this, can it go out, does
 * the guarantee hold — and then, only for whoever wants it, how it is pinned to
 * the main show and the script itself. Six section headings became two folds.
 */
function Episode({ spinoff }: { spinoff: Spinoff }) {
  return (
    <article className="mt-16 border-t-2 border-rule-strong pt-10">
      <SpinoffHeader run={spinoff} />

      <div className="border-t border-rule pt-6 mt-10">
        <ContinuityVerdict verdict={spinoff.verdict} />
      </div>

      <div className="mt-10">
        <ControlComparison spinoff={spinoff} />
      </div>

      <p className="mt-10 text-xs text-faint leading-relaxed prose-col">
        {FOLD_EXPLAINED}
      </p>

      <div className="mt-3">
        <Fold
          title={ALIGNMENT_FOLD}
          aside={crossingCount(spinoff.crossings.length)}
        >
          <div className="space-y-10">
            <AnchorCard anchor={spinoff.anchor} beatId={spinoff.anchorBeatId} />
            <Crossings crossings={spinoff.crossings} />
          </div>
        </Fold>

        {/* `EpisodeScript` directly rather than `SpinoffScript`, which carries a
            heading of its own — inside a fold that would print "The episode"
            twice on the same line's worth of screen. */}
        <Fold
          title={SPINOFF_HEADING.script}
          aside={scriptLength(listenMinutes(spinoff.words), spinoff.words)}
        >
          {spinoff.script ? (
            <EpisodeScript body={spinoff.script} />
          ) : (
            <p className="text-sm text-caution leading-relaxed prose-col">
              The script for this episode is missing from the file.
            </p>
          )}
        </Fold>
      </div>
    </article>
  );
}

/**
 * A run whose file could not be read back in full. It is still on disk and the
 * console still lists it, because a file the screen never mentions is worse
 * than a row that says it is unreadable.
 */
function Unreadable({ listing }: { listing: SpinoffListing }) {
  return (
    <article className="mt-16 border-t-2 border-rule-strong pt-10">
      <SpinoffHeader run={listing} />
      <div className="mt-8">
        <Notice tone="warn">
          The rest of this episode could not be read back, so there is no script
          and no verdict to show for it.
        </Notice>
      </div>
    </article>
  );
}

/**
 * A control version with no episode beside it — somebody generated the
 * unconstrained twin and not the real one. Listed, and labelled as what it is,
 * so it can never be mistaken for something meant to go out.
 */
function ControlOnly({ listing }: { listing: SpinoffListing }) {
  return (
    <article className="mt-16 border-t-2 border-rule-strong pt-10 space-y-10">
      <SpinoffHeader run={listing} />
      <div className="border-t border-rule pt-6">
        <ContinuityVerdict verdict={listing.verdict} />
      </div>
    </article>
  );
}

export async function generateMetadata(
  props: PageProps<"/serials/[id]/cast/[char]">,
) {
  const { id, char } = await props.params;
  const character = await loadCharacter(
    decodeURIComponent(id),
    decodeURIComponent(char),
  );
  return { title: character ? `${character.name} — ${SPINOFF_TITLE}` : SPINOFF_TITLE };
}

export default async function CharacterPage(
  props: PageProps<"/serials/[id]/cast/[char]">,
) {
  await requireEditor();
  const { id, char } = await props.params;
  const storyId = decodeURIComponent(id);
  const charId = decodeURIComponent(char);

  const [serial, character, listings, run, offline] = await Promise.all([
    loadSerial(storyId),
    loadCharacter(storyId, charId),
    listSpinoffs(storyId),
    readSpinoffRun(storyId, charId),
    spinoffRunIsOffline(),
  ]);

  // The season's own cast list is the fallback identity: when the roster query
  // is down, the name and the want still come off the dossier, and the reader
  // gets a page that says what is missing rather than a 404 that says the
  // person does not exist.
  const fromSeason = serial?.cast.find((c) => c.id === charId) ?? null;
  if (!character && !fromSeason) notFound();

  // Only a constrained run has a full body worth loading; a listing that is
  // itself a control twin has no episode file of its own to open.
  const mine = listings.filter((l) => l.charId === charId);
  const loaded = await Promise.all(
    mine.map(async (l) => ({
      listing: l,
      spinoff: l.constrained
        ? await loadSpinoff(storyId, charId, l.anchorBeatId)
        : null,
    })),
  );

  const name = character?.name ?? fromSeason?.name ?? charId;
  const role = character?.role ?? fromSeason?.role ?? null;
  const want = character?.want ?? fromSeason?.want ?? null;
  const standing = character ? rosterStanding(character) : null;
  const castHref = `/serials/${encodeURIComponent(storyId)}/cast`;

  // The end of the path. A spin-off that has been written and cleared is the
  // whole product claim discharged, and until now the screen simply stopped
  // there — the last thing on it was the closing line of a script.
  const written = mine.filter((l) => l.constrained).length;
  const doneWords = characterDone({
    name,
    showTitle: serial?.title ?? name,
  });

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      {/* Only while there is something to watch. A page that reloads itself
          forever is a page nobody can read. */}
      {run?.state === "running" && (
        <meta httpEquiv="refresh" content={String(REFRESH_SECONDS)} />
      )}

      <div className="flex items-baseline gap-6 flex-wrap">
        <Link href={castHref} className="label hover:text-ochre transition-colors">
          ← {CAST_LIST_TITLE}
        </Link>
        {serial && (
          <Link
            href={`/serials/${encodeURIComponent(storyId)}`}
            className="label hover:text-ochre transition-colors"
          >
            {serial.title}
          </Link>
        )}
      </div>

      <header className="mt-6">
        <div className="flex items-center gap-3 flex-wrap">
          {character?.bible?.clearance && (
            <ClearanceBadge
              clearance={{ status: character.bible.clearance, reasons: [] }}
            />
          )}
          {standing && (
            <span className={`label ${standing.className}`}>{standing.label}</span>
          )}
          {(character?.bible?.composite ?? fromSeason?.composite) && (
            <span
              className="label"
              title="Invented by combining several real people, so no single real person is being portrayed."
            >
              several people in one
            </span>
          )}
        </div>

        <h1 className="font-serif text-4xl tracking-tight mt-4 leading-tight">
          {name}
        </h1>

        {role && (
          <p className="mt-3 text-[0.9375rem] text-muted leading-relaxed prose-col">
            {role}
          </p>
        )}

        {want && (
          <p className="mt-6 font-serif text-xl leading-relaxed prose-col text-paper">
            <span className="label block mb-2">{SPINOFF_HEADING.want}</span>
            {want}
          </p>
        )}

        {standing && (
          <p className="mt-4 text-sm text-muted leading-relaxed prose-col">
            {standing.why}
          </p>
        )}
      </header>

      {!character && (
        <div className="mt-8">
          <Notice tone="warn">
            What this character saw and what went on behind their back could not
            be worked out for this season, so only what the season itself
            recorded about them is shown.
          </Notice>
        </div>
      )}

      {/* The one next thing, before the two long sections rather than after
          them. Where the run panel is the move, this names it and walks the
          reader down to it — it never carries a second control, because the
          panel's own button is the one that spends the money and says so. */}
      {character && written === 0 && (
        <div className="mt-10 max-w-2xl">
          {character.promotable ? (
            <NextStep action={CHARACTER_WRITE.action} href="#their-own-episode">
              {CHARACTER_WRITE.plain}
            </NextStep>
          ) : (
            // Python's judgement, not a second one taken here. No control is
            // offered, because the run panel below will refuse this anyway.
            <NextStep
              tone="onward"
              action={CHARACTER_TOO_THIN.action}
              href={castHref}
              cost={FREE_CLICK}
            >
              {CHARACTER_TOO_THIN.plain}
            </NextStep>
          )}
        </div>
      )}

      <div className="mt-12 space-y-12">
        {character && <ThreeViews character={character} />}
        {character && <Brief character={character} />}
      </div>

      <div className="mt-16" id="their-own-episode">
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h2 className="font-serif text-3xl tracking-tight">{SPINOFF_TITLE}</h2>
          <span className="label" title={CANON_TIER.branch_canon.plain}>
            {CANON_TIER.branch_canon.label}
          </span>
        </div>

        {/* Stated on every character screen, not buried in a tooltip: the one
            thing a producer must not walk away believing is that generating a
            spin-off can move the season it came from. */}
        <p className="mt-4 text-sm text-muted leading-relaxed prose-col">
          {CANON_TIER.branch_canon.plain} {CANON_TIER.core_canon.plain}
        </p>

        {loaded.length === 0 && (
          <p className="mt-8 text-sm text-caution leading-relaxed prose-col">
            No episode has been written for {name} yet.
            {character?.promotable === false &&
              " The season does not leave them enough to build one from."}
          </p>
        )}

        {/*
          The click the whole product is sold on. It is placed inside this
          section rather than at the top of the page because what it produces
          appears directly under it — start the run, watch the three stages,
          and the episode and its verdict render in the same place when it
          lands.

          Only shown when the roster query answered: `promotable` is Python's
          judgement and this screen does not have a second one. When the query
          is down the notice above already says so.
        */}
        {character && (
          <SpinoffRunPanel
            storyId={storyId}
            charId={charId}
            run={run}
            hasBible={character.hasBible}
            written={written}
            promotable={character.promotable}
            whyNot={
              standing && !character.promotable ? standing.why : null
            }
            offline={offline}
          />
        )}

        {loaded.length > 0 &&
          loaded.map(({ listing, spinoff }) =>
            spinoff ? (
              <Episode key={listing.file} spinoff={spinoff} />
            ) : listing.constrained ? (
              <Unreadable key={listing.file} listing={listing} />
            ) : (
              <ControlOnly key={listing.file} listing={listing} />
            ),
          )}
      </div>

      {/* The page used to end on the last line of a script. This is the end of
          the whole path, and the only honest move from it is the next name. */}
      {written > 0 && (
        <div className="mt-16 max-w-2xl">
          <NextStep
            tone="onward"
            action={doneWords.action}
            href={castHref}
            cost={FREE_CLICK}
          >
            {doneWords.plain}
          </NextStep>
        </div>
      )}
    </div>
  );
}
