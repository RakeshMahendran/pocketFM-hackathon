import Link from "next/link";
import { notFound } from "next/navigation";

import { EpisodeScript, listenMinutes } from "@/components/EpisodeScript";
import { Fold, FoldGroup } from "@/components/Fold";
import { ContinuityVerdict } from "@/components/ContinuityVerdict";
import { KnowledgeSplit } from "@/components/KnowledgeSplit";
import { NextStep } from "@/components/NextStep";
import {
  ALIGNMENT_FOLD,
  FOLD_EXPLAINED,
  FREE_CLICK,
  LIMITS_EXPLAINED,
  WRITTEN_FOR,
  crossingCount,
  scriptLength,
  spinoffEpisodeOnward,
} from "@/components/pathWords";
import { SEASON_WORDS } from "@/components/SeasonLayout";
import {
  AnchorCard,
  ControlComparison,
  Crossings,
  SpinoffHeader,
} from "@/components/SpinoffEpisode";
import { loadSerial } from "@/lib/serials";
import { requireEditor } from "@/lib/session";
import { listSpinoffs, loadCharacter, loadSpinoff } from "@/lib/spinoffs";
import { CANON_TIER, SPINOFF_HEADING } from "@/lib/words";

/**
 * One spin-off episode, on a page of its own.
 *
 * The route carries the moment the episode starts from rather than an index,
 * for the same reason the mainline route carries an episode number: a character
 * can have several, and Ratnamma has two. `/…/cast/ratnamma/episode` could
 * address neither of them honestly.
 *
 * Everything here used to render inline on the character screen, four times
 * over for a character with two episodes — the script, the anchor, the crossing
 * points, the control comparison and every finding of the check. A producer
 * looking for the second episode's verdict scrolled past the first episode's
 * script to reach it.
 *
 * What the character screen kept is a row per episode: the verdict, its two
 * counts, both halves of the constrained-against-control pair, and the beat and
 * the line a failing check named. That is what decides whether to open this.
 * This page is what somebody reads once they have decided.
 *
 * The order is the order a producer asks in — what is this, can it go out, does
 * the guarantee hold, and only then how it is pinned to the main show and what
 * it actually says.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/serials/[id]/cast/[char]/[anchor]">,
) {
  const { id, char, anchor } = await props.params;
  const spinoff = await loadSpinoff(
    decodeURIComponent(id),
    decodeURIComponent(char),
    decodeURIComponent(anchor),
  );
  return { title: spinoff?.title ?? SPINOFF_HEADING.script };
}

export default async function SpinoffEpisodePage(
  props: PageProps<"/serials/[id]/cast/[char]/[anchor]">,
) {
  await requireEditor();
  const { id, char, anchor } = await props.params;
  const storyId = decodeURIComponent(id);
  const charId = decodeURIComponent(char);
  const anchorBeatId = decodeURIComponent(anchor);

  const spinoff = await loadSpinoff(storyId, charId, anchorBeatId);
  // An unknown story, an unknown character or an anchor nothing was written
  // from all land here, because the episode is a file keyed on all three. A
  // page that rendered empty for any of them would be claiming an episode
  // exists.
  if (!spinoff) notFound();

  const [serial, character, listings] = await Promise.all([
    loadSerial(storyId),
    loadCharacter(storyId, charId),
    listSpinoffs(storyId),
  ]);

  const name = character?.name ?? spinoff.charId;
  const charHref = `/serials/${encodeURIComponent(storyId)}/cast/${encodeURIComponent(charId)}`;

  // Every other episode written for this person, so the closing line can say
  // how many are waiting rather than leaving the reader at a dead end.
  const others = listings.filter(
    (l) => l.charId === charId && l.constrained && l.anchorBeatId !== anchorBeatId,
  ).length;

  // Read off the verdict, never assumed. `missing` and `inconclusive` arrive
  // with no errors and are not clean — an episode nobody finished checking has
  // not passed.
  const clean =
    spinoff.verdict.status === "clean" && spinoff.verdict.errorCount === 0;
  const onward = spinoffEpisodeOnward({ name, clean, others });

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <div className="flex items-baseline gap-6 flex-wrap">
        <Link href={charHref} className="label hover:text-ochre transition-colors">
          ← {name}
        </Link>
        {serial && (
          <Link
            href={`/serials/${encodeURIComponent(storyId)}`}
            className="label hover:text-ochre transition-colors"
          >
            {serial.title}
          </Link>
        )}
        <span className="label" title={CANON_TIER.branch_canon.plain}>
          {CANON_TIER.branch_canon.label}
        </span>
      </div>

      {/*
        Who this was written for, and the two numbers it was written to.

        A reader can arrive here from a link in a message rather than from the
        character screen, and an episode with no idea whose it is tells them
        nothing. Not a second copy of the character page — the name, what they
        are in the season, and the split, which is the constraint this script
        was actually generated under.
      */}
      {character && (
        <section className="mt-8 border border-rule rounded-sm p-5 grid md:grid-cols-[1fr_16rem] gap-x-10 gap-y-5 items-start">
          <div className="min-w-0">
            <span className="label">{WRITTEN_FOR}</span>
            <p className="mt-1.5 font-serif text-xl leading-tight">
              <Link href={charHref} className="hover:text-ochre transition-colors">
                {name}
              </Link>
            </p>
            {character.role && (
              <p className="text-sm text-muted leading-relaxed mt-2 prose-col">
                {character.role}
              </p>
            )}
            <p className="text-sm text-muted leading-relaxed mt-3 prose-col">
              {LIMITS_EXPLAINED}
            </p>
          </div>
          <KnowledgeSplit
            witnessed={character.witnessed}
            blind={character.blind}
          />
        </section>
      )}

      <div className="mt-10">
        <SpinoffHeader run={spinoff} level={1} />
      </div>

      {/* The verdict, and every finding behind it. Nothing about it is folded:
          the count, the beat it names and the line it caught are the product
          claim, and a claim behind a click is a claim nobody read. */}
      <div className="mt-10 border-t border-rule pt-6">
        <ContinuityVerdict verdict={spinoff.verdict} />
      </div>

      {/* The pair. Same character, same moment, written twice — the comparison
          IS the guarantee, so it is never foldable. */}
      <div className="mt-12">
        <ControlComparison spinoff={spinoff} />
      </div>

      {/* Read rather than decided on: the two ways this episode is pinned to
          the main show, and the script itself. Both were most of the character
          screen's length, and neither answers a question a producer asks before
          they have believed the verdict. */}
      <FoldGroup
        title={SEASON_WORDS.reference}
        explained={FOLD_EXPLAINED}
      >
        <Fold title={ALIGNMENT_FOLD} aside={crossingCount(spinoff.crossings.length)}>
          <div className="space-y-10">
            <AnchorCard anchor={spinoff.anchor} beatId={spinoff.anchorBeatId} />
            <Crossings crossings={spinoff.crossings} />
          </div>
        </Fold>

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
      </FoldGroup>

      <div className="mt-16 max-w-2xl">
        <NextStep
          tone="onward"
          action={onward.action}
          href={charHref}
          cost={FREE_CLICK}
        >
          {onward.plain}
        </NextStep>
      </div>
    </div>
  );
}
