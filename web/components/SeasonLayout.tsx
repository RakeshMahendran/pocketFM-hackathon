import Link from "next/link";

import { EPISODE_LIST_ANCHOR } from "@/components/ReleaseControls";
import { CAST_LIST_TITLE, EPISODE_LIST_TITLE } from "@/lib/words";

/**
 * How the season screen is arranged, and the words that arrangement needs.
 *
 * The screen holds everything a commissioning team could ever ask about a show,
 * and it used to hold all of it at the same weight: sixteen headings, four
 * thousand words, no way in. An editor visiting it has four questions in a fixed
 * order — what is this and is it good, what is written, what is out, and who
 * else could carry a show — and everything else is a thing they look up when a
 * question comes up. Nothing is dropped here; the reference half is put behind
 * one heading and one click each.
 *
 * `<details>` rather than tabs: the codebase already opens detail that way (the
 * "For whoever runs it" blocks), it needs no JavaScript, and — the part that
 * matters for a page this long — the browser's own find-in-page can still reach
 * the closed content in modern browsers.
 */

/**
 * LOCAL WORDING — these belong in `lib/words.ts` and are written here because
 * that file is owned elsewhere this session. Every string that was already on
 * the season page is kept verbatim; the genuinely new ones are the jump bar and
 * the reference heading, and both are marked below.
 */
export const SEASON_WORDS = {
  /** Was inline on the page. Unchanged. */
  episodes: "The season, episode by episode",
  /** NEW. The one-line label above the three routes out of the top of the page. */
  jump: "Go to",
  /** NEW. The heading the whole reference half sits under. */
  reference: "Look something up",
  /** NEW. What that half is, so it does not read as more of the main flow. */
  referenceExplained:
    "The record this season was built from, and the checks made on it. Nothing here changes from visit to visit — open one when a question comes up.",
  /** NEW. The collapsed spine, named by what it shows. */
  shape: "The shape of the season",
  shapeAside: "cliffhangers, and how the lead rises and falls",
  /** NEW. The per-episode toggle. */
  whatHappens: "What happens in it",

  // Headings that were already on the page, moved here so the page holds no
  // loose strings of its own. Wording untouched.
  whatHappened: "What really happened, in order",
  neverNarrate: "Claims the narrator can never state as fact",
  questions: "Questions the show raises, and where it answers them",
  calendar: "When things happen",
  protagonist: "Who it follows",
  antagonist: "Who is against them",
  names: "Real name → name in the show",
  whyItWorks: "Why it works",
};

/** NEW. Counted people, said once so no screen writes "1 characters". */
export function characterCount(n: number): string {
  return `${n} ${n === 1 ? "character" : "characters"}`;
}

/** Where the reference half starts. Named once so the jump link cannot drift. */
export const REFERENCE_ANCHOR = "look-something-up";

/**
 * The three routes out of the top of the page.
 *
 * The cast link is the reason this exists. It is the door to half the product —
 * every name behind it is a show that could be made out of what that person was
 * never told — and it used to sit a third of the way down the page, inside a
 * section, under fourteen episode summaries. Nobody found it. Here it is the one
 * thing on this row drawn as a button.
 */
export function SeasonJump({
  storyId,
  castCount,
  released,
}: {
  storyId: string;
  castCount: number;
  /** How far the season has got, already said in words by the caller. */
  released: string;
}) {
  return (
    <nav className="mt-8 border-y border-rule py-3 flex items-center gap-x-8 gap-y-3 flex-wrap">
      <span className="label text-faint">{SEASON_WORDS.jump}</span>

      <Link
        href={`#${EPISODE_LIST_ANCHOR}`}
        className="label hover:text-ochre transition-colors"
      >
        {EPISODE_LIST_TITLE} · {released}
      </Link>

      <Link
        href={`#${REFERENCE_ANCHOR}`}
        className="label hover:text-ochre transition-colors"
      >
        {SEASON_WORDS.reference}
      </Link>

      {castCount > 0 && (
        <Link
          href={`/serials/${encodeURIComponent(storyId)}/cast`}
          className="ml-auto border border-ochre/60 text-ochre px-4 py-2 text-sm rounded-sm hover:bg-ochre/10 transition-colors whitespace-nowrap"
        >
          {CAST_LIST_TITLE} → <span className="label">{characterCount(castCount)}</span>
        </Link>
      )}
    </nav>
  );
}

/** The little open/shut mark, drawn the way `ScoutReplay` already draws it. */
function Caret() {
  return (
    <>
      <span className="group-open:hidden" aria-hidden="true">
        {" "}
        ▸
      </span>
      <span className="hidden group-open:inline" aria-hidden="true">
        {" "}
        ▾
      </span>
    </>
  );
}

/**
 * One thing you can look up. Closed by default, and the count stays on the
 * summary line so the group can be scanned without opening anything.
 */
export function ReferenceItem({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-b border-rule">
      <summary className="py-4 cursor-pointer list-none flex items-baseline justify-between gap-6 hover:text-ochre transition-colors">
        <span className="font-serif text-lg">
          {title}
          <Caret />
        </span>
        {aside && <span className="label shrink-0">{aside}</span>}
      </summary>
      <div className="pb-8">{children}</div>
    </details>
  );
}

/** The reference half, under one heading, at the foot of the page. */
export function ReferenceGroup({ children }: { children: React.ReactNode }) {
  return (
    <section id={REFERENCE_ANCHOR} className="mt-16 border-t border-rule-strong pt-6">
      <h2 className="label">{SEASON_WORDS.reference}</h2>
      <p className="mt-3 text-sm text-muted leading-relaxed prose-col">
        {SEASON_WORDS.referenceExplained}
      </p>
      <div className="mt-6 border-t border-rule">{children}</div>
    </section>
  );
}

/**
 * A collapsed block in the main flow — the season's shape, which is a picture
 * plus the planner's brief for all fourteen episodes.
 */
export function FoldedBlock({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group border border-rule rounded-sm px-5">
      <summary className="py-3 cursor-pointer list-none flex items-baseline justify-between gap-6 hover:text-ochre transition-colors">
        <span className="label">
          {title}
          <Caret />
        </span>
        {aside && <span className="label text-faint shrink-0">{aside}</span>}
      </summary>
      <div className="pb-6">{children}</div>
    </details>
  );
}
