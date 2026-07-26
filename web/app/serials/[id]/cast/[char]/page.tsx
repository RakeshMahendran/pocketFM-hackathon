import Link from "next/link";
import { notFound } from "next/navigation";

import { ClearanceBadge } from "@/components/ClearanceBadge";
import { Fold, FoldGroup } from "@/components/Fold";
import { KnowledgeSplit } from "@/components/KnowledgeSplit";
import { NextStep } from "@/components/NextStep";
import {
  CHARACTER_LOOKUP_EXPLAINED,
  CHARACTER_TOO_THIN,
  CHARACTER_WRITE,
  EPISODE_ELSEWHERE,
  FREE_CLICK,
  KNOWLEDGE_HEADING,
  NOTHING_RECORDED,
  NOT_WRITTEN_YET,
  VIEWS_FOLD,
  VIEWS_FOLD_ASIDE,
  WRITER_FOLD,
  bibleLineCount,
  characterDone,
  momentCount,
  stretchCount,
  writtenCount,
} from "@/components/pathWords";
import { Notice } from "@/components/Notice";
import { SEASON_WORDS } from "@/components/SeasonLayout";
import { SpinoffRow } from "@/components/SpinoffEpisode";
import { SpinoffRunPanel } from "@/components/SpinoffRunPanel";
import { loadSerial } from "@/lib/serials";
import { readSpinoffRun, spinoffRunIsOffline } from "@/lib/spinoff-run";
import {
  listSpinoffs,
  loadCharacter,
  type Character,
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
 * FIVE BLOCKS, AND WHY THERE USED TO BE THIRTEEN
 *
 * An earlier pass cut this screen from six thousand words to seven hundred, and
 * that part worked. What it did not touch was the shape: thirteen headings, six
 * folds and seventy-seven bordered containers for what is four ideas. Fewer
 * words in more containers is not a simpler screen — it is the same screen with
 * quieter boxes.
 *
 * What it is now, top to bottom:
 *
 *   1. who they are          — name, what they are in the season, what they want
 *   2. what they know and don't — the two counts, and one sentence
 *   3. their episodes        — one row each: verdict, both counts, what was
 *                              caught, and a link to the episode's own page
 *   4. look something up     — the writer's brief, the moment list, the ledger,
 *                              and the definitions of the two counts
 *   5. where to go from here
 *
 * Three headings became one fold. "Was there for", "Never found out about" and
 * "Nobody wrote down where they were" each carried a paragraph explaining a
 * number that had already said it; all three sentences are still on the screen,
 * one click into block four.
 *
 * Four more headings left with the episode body. The script, the moment it
 * starts from, the crossing points and the control comparison now render at
 * `/serials/[id]/cast/[char]/[anchor]` — per episode, because a character can
 * have several and Ratnamma has two.
 *
 * What is never allowed to move behind a click: the verdict on every episode,
 * its two counts, both halves of a constrained-against-control pair, and the
 * beat and the line a failing check named. That is the product claim, and a
 * claim behind a fold is a claim nobody read.
 */

export const dynamic = "force-dynamic";

/**
 * How often the page reloads itself while an episode is being written. The same
 * five seconds `/commissioning/[id]` uses, and the same reason: somebody who
 * has just pressed a button should not have to know to press F5. It is only
 * emitted while a run is actually going.
 */
const REFRESH_SECONDS = 5;

/** Where the writing controls are, so the next step can walk somebody to them. */
const EPISODES_ANCHOR = "their-own-episode";

/**
 * The three views, said once, one click away from the two numbers they define.
 *
 * These were three headings and three paragraphs standing between the counts
 * and everything else on the screen. The counts are what an editor reads; the
 * definitions are what somebody meeting the idea for the first time reads, and
 * that is a different visit.
 */
function ViewsFold() {
  const views = [CHARACTER_VIEW.knows, CHARACTER_VIEW.blind, CHARACTER_VIEW.gaps];
  return (
    <Fold title={VIEWS_FOLD} aside={VIEWS_FOLD_ASIDE}>
      <dl className="divide-y divide-rule">
        {views.map((v) => (
          <div key={v.label} className="py-4 first:pt-0">
            <dt className="label">{v.label}</dt>
            <dd className="text-sm text-muted leading-relaxed mt-2 prose-col">
              {v.plain}
            </dd>
          </div>
        ))}
      </dl>
    </Fold>
  );
}

/**
 * Everything promotion wrote down, behind one heading with one click each.
 *
 * The pitch is not here — it is one sentence saying who this person is as a
 * lead, and it belongs with their name. What is here is the four hundred words
 * of prose underneath it, which is a writer's input rather than a reader's, and
 * the two raw lists: what the season records them being there for, and what
 * they were doing while it looked elsewhere.
 */
function LookUp({ character }: { character: Character }) {
  const held = character.bible;
  const b = held?.bible ?? null;
  const lines: [string, string | null][] = b
    ? [
        [SPINOFF_HEADING.want, b.want],
        ["What it cost them", b.wound],
        [SPINOFF_HEADING.voice, b.voice],
        ["Why their show won’t run out of story", b.engine],
        ["What their show is about instead", b.reframe],
      ]
    : [];
  const filled = lines.filter((l): l is [string, string] => Boolean(l[1]));
  const ledger = b?.offscreenLedger ?? [];

  return (
    <FoldGroup
      title={SEASON_WORDS.reference}
      explained={CHARACTER_LOOKUP_EXPLAINED}
    >
      <ViewsFold />

      {/* No bible at all is a normal state, not a fault — nobody has paid for
          the one expensive call yet. Said in the same place the brief would
          have been, so a reader looking for it finds out why it is not there. */}
      {!held ? (
        <Fold title={BIBLE.label} aside={NOT_WRITTEN_YET}>
          <p className="text-sm text-muted leading-relaxed prose-col">
            {PROMOTION.plain}
          </p>
          <p className="text-sm text-caution leading-relaxed mt-4 prose-col">
            It has not been run for this character, so there is no brief to read
            and nothing for a writer to work from yet.
          </p>
        </Fold>
      ) : (
        <>
          <Fold title={WRITER_FOLD} aside={bibleLineCount(filled.length)}>
            <p className="text-sm text-muted leading-relaxed prose-col mb-4">
              {BIBLE.plain}
            </p>
            <dl className="divide-y divide-rule border-t border-rule">
              {filled.map(([label, value]) => (
                <div key={label} className="py-4">
                  <dt className="label">{label}</dt>
                  <dd className="text-[0.9375rem] text-muted leading-relaxed mt-2 prose-col">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Fold>

          {/* The constraint set, in full. The writer's input rather than the
              reader's — the count on the closed line already says how much of
              it there is. */}
          {held.facts.length > 0 && (
            <Fold
              title="Everything the season records them being there for"
              aside={momentCount(held.facts.length)}
            >
              <ul className="divide-y divide-rule border-t border-rule">
                {held.facts.map((f, i) => (
                  <li
                    key={i}
                    className="py-3 text-sm text-muted leading-relaxed prose-col"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </Fold>
          )}

          {/* The offscreen ledger IS the gaps, filled in — the runs of the
              season this person is absent from, which is where a spin-off is
              free to invent. Shown even when it is empty, because "nobody wrote
              this down" is itself the answer to the question somebody opened
              this expecting to find. */}
          <Fold
            title="Where they were while the main show looked elsewhere"
            aside={ledger.length ? stretchCount(ledger.length) : NOTHING_RECORDED}
          >
            {ledger.length === 0 ? (
              <p className="text-sm text-faint leading-relaxed prose-col">
                Nothing was written down about where this character was during
                the stretches they do not appear in.
              </p>
            ) : (
              <ul className="divide-y divide-rule border-t border-rule">
                {ledger.map((w, i) => (
                  <li key={i} className="py-4">
                    {w.window && <span className="label">{w.window}</span>}
                    {w.what && (
                      <p className="text-[0.9375rem] text-muted leading-relaxed mt-2 prose-col">
                        {w.what}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Fold>
        </>
      )}
    </FoldGroup>
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

  // `listSpinoffs` has already ordered these: within one character, the pair
  // that proves something — a clean constrained arm against a failing control —
  // comes before a pair where both came out level. Filtering preserves that,
  // and re-sorting here would quietly overrule an editorial judgement made in
  // the loader for a good reason.
  const mine = listings.filter((l) => l.charId === charId);

  const name = character?.name ?? fromSeason?.name ?? charId;
  const role = character?.role ?? fromSeason?.role ?? null;
  const want = character?.want ?? fromSeason?.want ?? null;
  const pitch = character?.bible?.bible.pitch ?? null;
  const standing = character ? rosterStanding(character) : null;
  const castHref = `/serials/${encodeURIComponent(storyId)}/cast`;
  const episodeHref = (anchorBeatId: string) =>
    `${castHref}/${encodeURIComponent(charId)}/${encodeURIComponent(anchorBeatId)}`;

  // The end of the path. A spin-off that has been written and cleared is the
  // whole product claim discharged, and until now the screen simply stopped
  // there — the last thing on it was the closing line of a script.
  const constrained = mine.filter((l) => l.constrained);
  const written = constrained.length;
  // Read off the verdicts rather than assumed. The closing line used to claim
  // the episode contradicted nothing whatever the check had found, so a page
  // could carry "1 contradiction — it cannot go out as written" and
  // "contradicting none of it" at the same time.
  const doneWords = characterDone({
    name,
    showTitle: serial?.title ?? name,
    clean: constrained.every(
      (l) => l.verdict.status === "clean" && l.verdict.errorCount === 0,
    ),
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

      {/* BLOCK ONE — who they are. The pitch joins it: one sentence saying who
          this person is as a lead is identity, not reference, and it was the
          only part of the brief worth reading before deciding anything. */}
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

        {pitch && (
          <p className="mt-6 font-serif text-2xl leading-snug prose-col text-paper">
            {pitch}
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

      {/* The one next thing, before the long blocks rather than after them.
          Where the run panel is the move, this names it and walks the reader
          down to it — it never carries a second control, because the panel's
          own button is the one that spends the money and says so.

          Only the move. A character the pipeline would refuse has no move, and
          their way out belongs at the foot of the page with everybody else's
          rather than at the top pre-empting a screen nobody has read yet. */}
      {character && written === 0 && character.promotable && (
        <div className="mt-10 max-w-2xl">
          <NextStep action={CHARACTER_WRITE.action} href={`#${EPISODES_ANCHOR}`}>
            {CHARACTER_WRITE.plain}
          </NextStep>
        </div>
      )}

      {/* BLOCK TWO — the two counts, and the one sentence that says what they
          are. It used to be this plus three headings and three paragraphs
          teaching a reader what the numbers had already told them. */}
      {character && (
        <section className="mt-12 border-t border-rule pt-6">
          <h2 className="label mb-4">{KNOWLEDGE_HEADING}</h2>
          <KnowledgeSplit
            witnessed={character.witnessed}
            blind={character.blind}
            size="lg"
            explain
          />
        </section>
      )}

      {/* BLOCK THREE — their episodes, and the control that writes another. */}
      <section className="mt-16" id={EPISODES_ANCHOR}>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h2 className="font-serif text-3xl tracking-tight">{SPINOFF_TITLE}</h2>
          <span className="flex items-baseline gap-4 flex-wrap justify-end label">
            {written > 0 && <span>{writtenCount(written)}</span>}
            <span title={CANON_TIER.branch_canon.plain}>
              {CANON_TIER.branch_canon.label}
            </span>
          </span>
        </div>

        {/* Stated on every character screen, not buried in a tooltip: the one
            thing a producer must not walk away believing is that generating a
            spin-off can move the season it came from. */}
        <p className="mt-4 text-sm text-muted leading-relaxed prose-col">
          {CANON_TIER.branch_canon.plain} {CANON_TIER.core_canon.plain}
        </p>

        {mine.length === 0 && (
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
            whyNot={standing && !character.promotable ? standing.why : null}
            offline={offline}
          />
        )}

        {mine.length > 0 && (
          <>
            <ul className="mt-10 border-t border-rule divide-y divide-rule">
              {mine.map((listing) => (
                <SpinoffRow
                  key={listing.file}
                  listing={listing}
                  href={listing.constrained ? episodeHref(listing.anchorBeatId) : null}
                />
              ))}
            </ul>

            <p className="mt-5 text-xs text-faint leading-relaxed prose-col">
              {EPISODE_ELSEWHERE}
            </p>
          </>
        )}
      </section>

      {/* BLOCK FOUR — everything looked up rather than read. */}
      {character && <LookUp character={character} />}

      {/* BLOCK FIVE. The page used to end on the last line of a script. This is
          the end of the whole path, and the only honest move from it is the
          next name — whether the path finished here or was never open. */}
      {written > 0 ? (
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
      ) : (
        // Python's judgement, not a second one taken here. No control is
        // offered, because the run panel above will refuse this anyway.
        character?.promotable === false && (
          <div className="mt-16 max-w-2xl">
            <NextStep
              tone="onward"
              action={CHARACTER_TOO_THIN.action}
              href={castHref}
              cost={FREE_CLICK}
            >
              {CHARACTER_TOO_THIN.plain}
            </NextStep>
          </div>
        )
      )}
    </div>
  );
}
