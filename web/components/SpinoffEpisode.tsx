import Link from "next/link";

import { ContinuityVerdict, VerdictCounts, verdictWord } from "@/components/ContinuityVerdict";
import { EpisodeScript, listenMinutes } from "@/components/EpisodeScript";
import {
  EPISODE_OPEN,
  moreFindings,
  pairFound,
  scriptLength,
} from "@/components/pathWords";
import type {
  AnchorBeat,
  Crossing,
  Spinoff,
  SpinoffListing,
  SpinoffRun,
} from "@/lib/spinoffs";
import {
  ANCHOR,
  CONTROL_EXPLAINED,
  CROSSING_POINT,
  SPINOFF_HEADING,
  anchorKind,
  contradictionCount,
  severity,
  writingMode,
} from "@/lib/words";

/**
 * One generated spin-off episode, and the control version written beside it.
 *
 * The order on screen is the order a producer asks in: what is this, can it go
 * out, where does it sit against the main show, then the script. The verdict
 * comes second rather than last because it is the only thing that decides
 * anything.
 *
 * All of it now renders on the episode's own page. What the character screen
 * keeps is `SpinoffRow` at the foot of this file: enough of a verdict to decide
 * whether to open it, and no more. `AnchorCard` and `Crossings` lost the
 * section frames and headings they used to carry, because both are now read
 * inside a fold that names them — a heading inside a fold prints the same words
 * twice a line apart.
 */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 items-baseline">
      <span className="label w-28 shrink-0">{label}</span>
      <span className="text-sm text-muted leading-relaxed min-w-0">{children}</span>
    </div>
  );
}

export function AnchorCard({
  anchor,
  beatId,
}: {
  anchor: AnchorBeat | null;
  beatId: string;
}) {
  const kind = anchor?.kind ? anchorKind(anchor.kind) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-6 mb-4 flex-wrap">
        <span className="label">{SPINOFF_HEADING.anchor}</span>
        <span
          className="font-mono text-[0.6875rem] text-faint"
          title="The reference the moment in the main show is filed under."
        >
          {beatId}
        </span>
      </div>

      <p className="text-sm text-muted leading-relaxed prose-col">
        {ANCHOR.plain}
      </p>

      {!anchor ? (
        <p className="text-sm text-caution leading-relaxed mt-4 prose-col">
          The moment this episode was built on is not recorded in the file, so
          there is nothing here to read it against.
        </p>
      ) : (
        <>
          {kind && (
            <p className={`mt-5 font-serif text-xl leading-tight`} title={kind.plain}>
              {kind.label}
            </p>
          )}
          {kind && (
            <p className="text-sm text-muted leading-relaxed mt-2 prose-col">
              {kind.plain}
            </p>
          )}

          {anchor.whatHappened && (
            <p className="font-serif text-[1.0625rem] leading-relaxed mt-5 prose-col text-paper border-l border-rule-strong pl-4">
              {anchor.whatHappened}
            </p>
          )}

          <div className="mt-5 space-y-2">
            {anchor.ep !== null && (
              <Row label="in the main show">episode {anchor.ep}</Row>
            )}
            {anchor.location && <Row label="where">{anchor.location}</Row>}
            {anchor.worldTime && <Row label="when">{anchor.worldTime}</Row>}
          </div>
        </>
      )}
    </div>
  );
}

export function Crossings({ crossings }: { crossings: Crossing[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-6 mb-4">
        <span className="label">{SPINOFF_HEADING.crossings}</span>
        <span className="label">
          {crossings.length === 1 ? "1 moment" : `${crossings.length} moments`}
        </span>
      </div>

      <p className="text-sm text-muted leading-relaxed prose-col">
        {CROSSING_POINT.plain}
      </p>

      {crossings.length === 0 ? (
        <p className="text-sm text-faint leading-relaxed mt-4 prose-col">
          This episode never touches a moment the main show already told, so
          there is nothing here that had to be kept identical.
        </p>
      ) : (
        <ul className="mt-6 border-t border-rule divide-y divide-rule">
          {crossings.map((c, i) => (
            <li key={i} className="py-4">
              {c.mainlineBeatId && (
                <span
                  className="font-mono text-[0.6875rem] text-faint"
                  title="The reference the moment in the main show is filed under."
                >
                  {c.mainlineBeatId}
                </span>
              )}
              {c.objectiveFactsKept && (
                <p className="text-[0.9375rem] leading-relaxed mt-2 prose-col text-muted">
                  <span className="label block mb-1">
                    What happened — fixed by the main show
                  </span>
                  {c.objectiveFactsKept}
                </p>
              )}
              {c.renderedAs && (
                <p className="font-serif text-[1.0625rem] leading-relaxed mt-3 prose-col border-l border-ochre/50 pl-4">
                  <span className="label block mb-1 text-ochre">
                    The same moment, from their side
                  </span>
                  {c.renderedAs}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The two numbers, side by side, whatever they are.
 *
 * The pair is the proof, so it has to be stated from the data every time. One
 * of the committed episodes is 1 against 7 and another is 0 against 0, and a
 * layout that only reads correctly when the left-hand number is zero would be
 * lying on both. Written here rather than in `lib/words.ts`, which another
 * track owns; it belongs there.
 */
function contrastSentence(mine: SpinoffRun, control: SpinoffRun): string {
  const both = `Written to what they know, the check found ${contradictionCount(
    mine.verdict.errorCount,
  )}. Written without the limits, it found ${contradictionCount(
    control.verdict.errorCount,
  )}.`;

  if (control.verdict.errorCount > mine.verdict.errorCount) return both;

  if (control.verdict.errorCount === mine.verdict.errorCount) {
    return `${both} The two came out level, so this pair on its own does not show the limits doing anything — the difference has to be read somewhere it did.`;
  }

  return `${both} The control came out cleaner than the version written to the limits, which is the wrong way round and worth someone looking at.`;
}

function VersionPanel({
  run,
  constrained,
}: {
  run: SpinoffRun;
  constrained: boolean;
}) {
  const mode = writingMode(constrained);
  const word = verdictWord(run.verdict);

  return (
    <div className="border border-rule bg-surface p-5">
      <div className="label" title={mode.plain}>
        {mode.label}
      </div>
      <div className={`font-serif text-3xl leading-none mt-3 ${word.className}`}>
        {word.word}
      </div>
      <div className="mt-3">
        <VerdictCounts verdict={run.verdict} />
      </div>
      <p className="text-sm text-muted leading-relaxed mt-4">{mode.plain}</p>
    </div>
  );
}

/** The constrained episode against its unconstrained twin. */
export function ControlComparison({ spinoff }: { spinoff: Spinoff }) {
  return (
    <section className="border-t border-rule pt-6">
      <h2 className="label mb-4">{SPINOFF_HEADING.control}</h2>

      <p className="text-sm text-muted leading-relaxed prose-col">
        {CONTROL_EXPLAINED}
      </p>

      {!spinoff.leak ? (
        <p className="text-sm text-faint leading-relaxed mt-5 prose-col">
          No control version was written for this episode, so there is nothing
          here to hold it against. The verdict above stands on its own.
        </p>
      ) : (
        <>
          <div className="mt-6 grid md:grid-cols-2 gap-4">
            <VersionPanel run={spinoff} constrained />
            <VersionPanel run={spinoff.leak} constrained={false} />
          </div>

          <p className="font-serif text-lg leading-relaxed mt-6 prose-col">
            {contrastSentence(spinoff, spinoff.leak)}
          </p>

          {spinoff.leak.verdict.violations.length > 0 && (
            <div className="mt-8">
              <h3 className="label mb-4">
                What the check caught in the control version
              </h3>
              <ContinuityVerdict verdict={spinoff.leak.verdict} heading={false} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Title, logline and length. The header of one generated episode.
 *
 * `level` exists because the same header is now the top of a page of its own.
 * An episode page whose title is an `h2` has no `h1` at all, and a screen
 * reader arriving at it is told nothing about what it landed on.
 */
export function SpinoffHeader({
  run,
  level = 2,
}: {
  run: SpinoffRun;
  level?: 1 | 2;
}) {
  const Title = level === 1 ? "h1" : "h2";
  return (
    <header>
      <div className="flex items-baseline gap-4 flex-wrap">
        <Title
          className={`font-serif tracking-tight leading-tight ${
            level === 1 ? "text-4xl" : "text-3xl"
          }`}
        >
          {run.title ?? "Untitled episode"}
        </Title>
        <span className="label whitespace-nowrap">
          ~{listenMinutes(run.words)} min to listen ·{" "}
          {run.words.toLocaleString()} words
        </span>
      </div>

      {run.logline && (
        <p className="font-serif text-xl text-muted leading-relaxed mt-4 prose-col">
          {run.logline}
        </p>
      )}

      {!run.constrained && (
        <p className="text-sm text-caution leading-relaxed mt-4 prose-col">
          {writingMode(false).plain}
        </p>
      )}
    </header>
  );
}

/**
 * One episode as a row on the character screen: enough to decide with, and a
 * link to the rest.
 *
 * What has to survive the move, because it is the whole product claim:
 *
 *   - the verdict in one word, and the two counts beside it, never merged
 *   - when the pair exists, both of its numbers — the demo's money shot is a 0
 *     against a 5, and it has to be legible here without opening anything
 *   - when something was caught, the beat it names and the line it caught,
 *     because "1 contradiction" with nothing shown is an assertion
 *
 * Everything else — the script, the anchor, the crossings, the control's own
 * findings, the ruled-out list — is on the page this links to.
 */
export function SpinoffRow({
  listing,
  href,
}: {
  listing: SpinoffListing;
  /** Null for a control twin with no episode of its own: there is no page. */
  href: string | null;
}) {
  const word = verdictWord(listing.verdict);
  const title = listing.title ?? "Untitled episode";
  const first = listing.verdict.errors[0] ?? null;
  const rest = listing.verdict.errorCount - (first ? 1 : 0);

  return (
    <li className="py-6">
      <div className="flex items-baseline justify-between gap-x-6 gap-y-2 flex-wrap">
        <h3 className="font-serif text-2xl tracking-tight leading-tight min-w-0">
          {href ? (
            <Link href={href} className="hover:text-ochre transition-colors">
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        <span className="flex items-baseline gap-3 flex-wrap shrink-0">
          <span className={`font-serif text-xl leading-none ${word.className}`}>
            {word.word}
          </span>
          <VerdictCounts verdict={listing.verdict} />
        </span>
      </div>

      {listing.logline && (
        <p className="font-serif text-[1.0625rem] text-muted leading-relaxed mt-3 prose-col">
          {listing.logline}
        </p>
      )}

      {/* A row for the unconstrained twin alone. It must never be mistaken for
          something meant to go out, so it says what it is before anything else
          about it. */}
      {!listing.constrained && (
        <p className="text-sm text-caution leading-relaxed mt-3 prose-col">
          {writingMode(false).plain}
        </p>
      )}

      {listing.leak && (
        <p className="label mt-3" title={CONTROL_EXPLAINED}>
          {pairFound(
            listing.verdict.errorCount,
            listing.leak.verdict.errorCount,
          )}
        </p>
      )}

      {first && (
        <p className="mt-3 text-[0.9375rem] leading-relaxed prose-col border-l border-halt/60 pl-4 text-muted">
          <span className="label block mb-1 text-halt">
            {severity("error").label}
            {first.beatId && (
              <>
                {" — from "}
                <span
                  className="font-mono lowercase tracking-normal"
                  title="The reference the moment in the main show is filed under."
                >
                  {first.beatId}
                </span>
                {" in the main show"}
              </>
            )}
          </span>
          {first.quote ? <>&ldquo;{first.quote}&rdquo;</> : (first.why ?? "")}
          {rest > 0 && (
            <span className="label block mt-2">{moreFindings(rest)}</span>
          )}
        </p>
      )}

      {href && (
        <p className="mt-4 flex items-baseline gap-4 flex-wrap">
          <Link
            href={href}
            className="label text-ochre hover:text-paper transition-colors"
          >
            {EPISODE_OPEN} →
          </Link>
          <span className="label text-faint">
            {scriptLength(listenMinutes(listing.words), listing.words)}
          </span>
        </p>
      )}
    </li>
  );
}

export function SpinoffScript({ run }: { run: Spinoff }) {
  return (
    <section className="border-t border-rule pt-6">
      <div className="flex items-baseline justify-between gap-6 mb-6 flex-wrap">
        <h2 className="label">{SPINOFF_HEADING.script}</h2>
        <span className="label">
          {run.beatCount === 1
            ? "1 thing happens in it"
            : `${run.beatCount} things happen in it`}
        </span>
      </div>
      {run.script ? (
        <EpisodeScript body={run.script} />
      ) : (
        <p className="text-sm text-caution leading-relaxed prose-col">
          The script for this episode is missing from the file.
        </p>
      )}
    </section>
  );
}
