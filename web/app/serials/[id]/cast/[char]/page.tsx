import Link from "next/link";
import { notFound } from "next/navigation";

import { ClearanceBadge } from "@/components/ClearanceBadge";
import { ContinuityVerdict } from "@/components/ContinuityVerdict";
import { KnowledgeSplit } from "@/components/KnowledgeSplit";
import { Notice } from "@/components/Notice";
import {
  AnchorCard,
  ControlComparison,
  Crossings,
  SpinoffHeader,
  SpinoffScript,
} from "@/components/SpinoffEpisode";
import { loadSerial } from "@/lib/serials";
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

export const dynamic = "force-dynamic";

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

      <dl className="mt-8 border-t border-rule">
        {lines
          .filter((l): l is [string, string] => Boolean(l[1]))
          .map(([label, value]) => (
            <div key={label} className="border-b border-rule py-4">
              <dt className="label">{label}</dt>
              <dd className="text-[0.9375rem] text-muted leading-relaxed mt-2 prose-col">
                {value}
              </dd>
            </div>
          ))}
      </dl>

      {held.facts.length > 0 && (
        <div className="mt-8">
          <h3 className="label mb-3">
            Everything the season records them being there for
          </h3>
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
          <h3 className="label">
            Where they were while the main show looked elsewhere
          </h3>
          <ul className="mt-4 border-t border-rule">
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

/** One episode in full. The verdict sits second because it decides everything. */
function Episode({ spinoff }: { spinoff: Spinoff }) {
  return (
    <article className="mt-16 border-t-2 border-rule-strong pt-10 space-y-10">
      <SpinoffHeader run={spinoff} />
      <div className="border-t border-rule pt-6">
        <ContinuityVerdict verdict={spinoff.verdict} />
      </div>
      <AnchorCard anchor={spinoff.anchor} beatId={spinoff.anchorBeatId} />
      <ControlComparison spinoff={spinoff} />
      <Crossings crossings={spinoff.crossings} />
      <SpinoffScript run={spinoff} />
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

  const [serial, character, listings] = await Promise.all([
    loadSerial(storyId),
    loadCharacter(storyId, charId),
    listSpinoffs(storyId),
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

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
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

      <div className="mt-12 space-y-12">
        {character && <ThreeViews character={character} />}
        {character && <Brief character={character} />}
      </div>

      <div className="mt-16">
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

        {loaded.length === 0 ? (
          <p className="mt-8 text-sm text-caution leading-relaxed prose-col">
            No episode has been written for {name} yet.
            {character?.promotable === false &&
              " The season does not leave them enough to build one from."}
          </p>
        ) : (
          loaded.map(({ listing, spinoff }) =>
            spinoff ? (
              <Episode key={listing.file} spinoff={spinoff} />
            ) : listing.constrained ? (
              <Unreadable key={listing.file} listing={listing} />
            ) : (
              <ControlOnly key={listing.file} listing={listing} />
            ),
          )
        )}
      </div>
    </div>
  );
}
