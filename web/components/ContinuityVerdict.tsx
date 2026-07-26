import { ruledOutCount } from "@/components/pathWords";
import type { Verdict, Violation } from "@/lib/spinoffs";
import {
  ATTEMPTS_EXPLAINED,
  ATTEMPTS_HEADING,
  CHECKER_EXPLAINED,
  CHECKER_TITLE,
  checkName,
  contradictionCount,
  continuityVerdict,
  noteCount,
  severity,
  verdictShort,
} from "@/lib/words";

/**
 * What the continuity check concluded about one generated episode.
 *
 * The product claim is a guarantee, so this block is the only thing on the
 * character screen that must never be read wrong. Three rules it exists to
 * enforce:
 *
 *  - Only `error` is a contradiction. `warn` is a note for whoever reads the
 *    script. Merging the two counts would make a fine episode look broken and
 *    the guarantee stop meaning anything.
 *  - `inconclusive` and `missing` are not clean. A pass that did not report is
 *    not a pass that found nothing, and an episode nobody checked is not an
 *    episode that passed.
 *  - Every number comes off the file. Nothing here is allowed to assume the
 *    answer is zero — one of the committed episodes genuinely has a
 *    contradiction in it, and the screen has to say so.
 */

/**
 * Both helpers just adapt a `Verdict` to the shape `words.ts` takes. The
 * `missing` case used to be guarded here, because `continuityVerdict()` fell
 * through on it to the clean sentence and would have told a producer that an
 * unchecked episode had been checked. That is now handled in `words.ts`
 * alongside `inconclusive`, so there is one place the wording lives.
 */
export function verdictSaid(v: Verdict): {
  label: string;
  plain: string;
  className: string;
  clean: boolean;
} {
  return continuityVerdict({
    status: v.status,
    n_errors: v.errorCount,
    n_warnings: v.warnCount,
  });
}

/** The verdict as one word, for a badge. */
export function verdictWord(v: Verdict): { word: string; className: string } {
  return verdictShort({ status: v.status, n_errors: v.errorCount });
}

/** The two counts, never merged, never "1 contradictions". */
export function VerdictCounts({ verdict }: { verdict: Verdict }) {
  return (
    <span className="label">
      <span className={verdict.errorCount > 0 ? "text-halt" : undefined}>
        {contradictionCount(verdict.errorCount)}
      </span>
      {" · "}
      <span className={verdict.warnCount > 0 ? "text-caution" : undefined}>
        {noteCount(verdict.warnCount)}
      </span>
    </span>
  );
}

function Finding({ v }: { v: Violation }) {
  const sev = severity(v.severity);
  const named = checkName(v.check);
  // An empty `plain` means `words.ts` does not name this check — the panel's
  // refuters come back under names it has no copy for. Showing the raw token
  // would put a field value on screen, so the severity carries the row and the
  // check's own explanation of itself carries the detail.
  const known = named.plain !== "";

  return (
    <li className="border-b border-rule py-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className={`label ${sev.className}`} title={sev.plain}>
          {sev.label}
        </span>
        {known && (
          <span className="label" title={named.plain}>
            {named.label}
          </span>
        )}
        {v.beatId && (
          <span className="label">
            from{" "}
            <span
              className="font-mono lowercase tracking-normal"
              title="The reference the moment in the main show is filed under."
            >
              {v.beatId}
            </span>{" "}
            in the main show
          </span>
        )}
      </div>

      {v.why && (
        <p className="text-[0.9375rem] leading-relaxed mt-2 prose-col text-paper">
          {v.why}
        </p>
      )}

      {v.quote && (
        <p className="font-serif text-[1.0625rem] leading-relaxed mt-3 prose-col border-l border-rule-strong pl-4 text-muted">
          &ldquo;{v.quote}&rdquo;
        </p>
      )}
    </li>
  );
}

/**
 * The full report: the verdict, every finding behind it, and — when it came
 * back clean — what the check tried and could not make stick.
 */
export function ContinuityVerdict({
  verdict,
  heading = true,
  foldAttempts = true,
}: {
  verdict: Verdict;
  heading?: boolean;
  /**
   * Put the attempts list behind a click, keeping its count on the summary line.
   *
   * On by default, because of where this block actually lands: a character with
   * two episodes renders it up to five times on one screen — once per episode,
   * once more inside each control comparison — and each list runs to a dozen
   * paragraphs. Together they were most of the screen's length.
   *
   * Folding does not soften the claim. The count stays on the closed line, and
   * "clean, with fifteen suspicions ruled out" is the sentence that matters;
   * which fifteen is what somebody opens afterwards.
   */
  foldAttempts?: boolean;
}) {
  const said = verdictSaid(verdict);
  const attempts = verdict.attemptsThatFailed.flatMap((a, m) =>
    a.notes.map((note, i) => ({ key: `${m}-${a.member}-${i}`, note })),
  );
  const disagrees =
    verdict.declaredErrorCount !== null &&
    verdict.declaredErrorCount !== verdict.errorCount;

  return (
    <div>
      {heading && <h2 className="label mb-4">{CHECKER_TITLE}</h2>}

      <div className="border border-rule bg-surface p-6">
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <div className={`font-serif text-2xl leading-tight ${said.className}`}>
            {said.label}
          </div>
          <VerdictCounts verdict={verdict} />
        </div>

        <p className="text-[0.9375rem] text-muted leading-relaxed mt-3 prose-col">
          {said.plain}
        </p>

        <p className="label mt-5">{CHECKER_EXPLAINED}</p>

        {verdict.membersRun !== null && verdict.membersExpected !== null && (
          <p className="label mt-2">
            {verdict.membersRun} of {verdict.membersExpected} came back
          </p>
        )}

        {verdict.inconclusive.length > 0 && (
          <p className="label mt-2 text-caution">
            {verdict.inconclusive.length} of them did not answer, so this
            episode has not been cleared either way
          </p>
        )}

        {verdict.deterministic.length > 0 && (
          <p className="label mt-2 text-halt">
            {verdict.deterministic.length} of the findings below were caught by
            matching against the record itself rather than by reading — those
            are not arguable
          </p>
        )}

        {/* The file states its own count. Where the rows disagree with it, the
            rows are what is shown, and the disagreement is worth surfacing
            rather than quietly picking a winner. */}
        {disagrees && (
          <p className="label mt-2 text-caution">
            the check filed a total of {verdict.declaredErrorCount} — the
            findings themselves come to {verdict.errorCount}, and those are what
            is listed
          </p>
        )}
      </div>

      {verdict.violations.length > 0 && (
        <ul className="mt-6 border-t border-rule">
          {verdict.violations.map((v, i) => (
            <Finding key={i} v={v} />
          ))}
        </ul>
      )}

      {/* What a clean result is made of. Without this a green verdict is an
          assertion; with it, it is a list of things somebody tried. */}
      {attempts.length > 0 &&
        (foldAttempts ? (
          <details className="group mt-8 border-t border-rule">
            <summary className="py-3 cursor-pointer list-none flex items-baseline justify-between gap-6 hover:text-ochre transition-colors">
              <span className="label">
                {ATTEMPTS_HEADING}
                <span className="group-open:hidden" aria-hidden="true">
                  {" "}
                  ▸
                </span>
                <span className="hidden group-open:inline" aria-hidden="true">
                  {" "}
                  ▾
                </span>
              </span>
              {/* The count is the part that matters closed: a clean verdict
                  backed by nine ruled-out suspicions reads differently from one
                  backed by none, and that has to survive the fold. */}
              <span className="label shrink-0">
                {ruledOutCount(attempts.length)}
              </span>
            </summary>
            <p className="text-sm text-muted leading-relaxed pb-4 prose-col">
              {ATTEMPTS_EXPLAINED}
            </p>
            <ul className="space-y-2.5 pb-4">
              {attempts.map((a) => (
                <li
                  key={a.key}
                  className="text-sm text-faint leading-relaxed prose-col border-l border-rule pl-4"
                >
                  {a.note}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <div className="mt-8">
            <h3 className="label">{ATTEMPTS_HEADING}</h3>
            <p className="text-sm text-muted leading-relaxed mt-2 prose-col">
              {ATTEMPTS_EXPLAINED}
            </p>
            <ul className="mt-4 space-y-2.5">
              {attempts.map((a) => (
                <li
                  key={a.key}
                  className="text-sm text-faint leading-relaxed prose-col border-l border-rule pl-4"
                >
                  {a.note}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
