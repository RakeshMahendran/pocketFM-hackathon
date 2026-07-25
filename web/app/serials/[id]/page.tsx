import Link from "next/link";
import { notFound } from "next/navigation";

import { ClearanceBadge } from "@/components/ClearanceBadge";
import { Notice } from "@/components/Notice";
import { SeasonSpine } from "@/components/SeasonSpine";
import { loadSerial, type Confidence, type PromiseLedger, type Serial } from "@/lib/serials";
import { requireEditor } from "@/lib/session";
import { SCORE_LABELS, type Scores } from "@/lib/types";

export const dynamic = "force-dynamic";

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
          <span className="label w-40 shrink-0">{SCORE_LABELS[k]}</span>
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
        No <span className="font-mono">promises.json</span> for this season. The
        ledger is what says whether a setup was ever paid off, so without it there
        is no way to tell an open thread from an abandoned one.
      </p>
    );
  }

  if (!ledger.promises.length) {
    return (
      <p className="text-sm text-muted leading-relaxed prose-col">
        The ledger file exists but records no promises.
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
          <div className="label mt-1.5">still open</div>
        </div>
        <div>
          <div className="font-mono text-3xl leading-none tabular-nums">
            {ledger.paidCount}
          </div>
          <div className="label mt-1.5">paid off</div>
        </div>
        {ledger.state && (
          <div className="label max-w-xs">ledger {ledger.state}</div>
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
              <span className="font-mono text-[0.6875rem] text-faint">{p.id}</span>
              <span className="label">
                raised ep {p.raisedEp ?? "?"}
                {p.mustPayBy !== null && ` · due by ${p.mustPayBy}`}
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
                  ? `paid ep ${p.paidEp ?? "?"}`
                  : p.state === "open"
                    ? "open"
                    : "state not recorded"}
              </span>
              {p.late && (
                <span className="label text-caution" title="Paid later than the ledger's own deadline">
                  late
                </span>
              )}
            </div>

            <p className="font-serif text-[1.0625rem] leading-relaxed mt-2 prose-col">
              {p.promise ?? p.waitingFor ?? "No statement of the promise recorded."}
            </p>

            {p.promise && p.waitingFor && (
              <p className="text-sm text-muted leading-relaxed mt-2 prose-col">
                Listener is waiting for: {p.waitingFor}
              </p>
            )}

            {p.howPaid && (
              <p className="text-sm text-muted leading-relaxed mt-2 prose-col border-l border-rule-strong pl-4">
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
                    ep {d.raisedEp ?? "?"} → {d.settledEp ?? "unsettled"}
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
  return (
    <header className="mt-6 flex items-start justify-between gap-8 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <ClearanceBadge clearance={s.clearance} size="lg" />
          {s.category && <span className="label">{s.category}</span>}
          <span className="font-mono text-[0.6875rem] text-faint">
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
        <div className="font-mono text-5xl leading-none tabular-nums">
          {s.scores ? s.scores.total : "—"}
        </div>
        <div className="label mt-2">out of 50</div>
        <div className="label mt-3">
          {s.episodeCount} of {s.spineLength || s.episodeCount} written
        </div>
      </div>
    </header>
  );
}

export default async function SeasonPage(props: PageProps<"/serials/[id]">) {
  await requireEditor();
  const { id } = await props.params;
  const s = await loadSerial(decodeURIComponent(id));
  if (!s) notFound();

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <Link href="/serials" className="label hover:text-ochre transition-colors">
        ← Slate
      </Link>

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
              {n}
            </Notice>
          ))}
          {s.missing.length > 0 && (
            <Notice tone="info">
              Absent from this dossier:{" "}
              <span className="font-mono">{s.missing.join(", ")}</span>. It was
              written before the schema settled, so the fields were never produced.
            </Notice>
          )}
        </div>
      )}

      <div className="mt-12">
        <div className="flex items-baseline justify-between gap-6 mb-4">
          <h2 className="label">The season</h2>
          <span className="label">
            {s.beatCount} beats · {s.beatsWithHiddenFrom} carry hidden_from
          </span>
        </div>
        <SeasonSpine id={s.id} spine={s.spine} episodes={s.episodes} />
      </div>

      <div className="mt-14 grid lg:grid-cols-[1fr_20rem] gap-x-14 gap-y-8 items-start">
        <div className="space-y-10 min-w-0">
          {s.engine && (
            <Section title="Engine — why it keeps generating">
              <p className="font-serif text-lg leading-relaxed prose-col">
                {s.engine}
              </p>
            </Section>
          )}

          <Section title="The sell">
            {s.sells ? (
              <p className="font-serif text-lg leading-relaxed prose-col">
                {s.sells}
              </p>
            ) : (
              <p className="text-sm text-caution leading-relaxed prose-col">
                No pitch line in this dossier — it carries none of{" "}
                <span className="font-mono">sells</span>,{" "}
                <span className="font-mono">selling</span> or{" "}
                <span className="font-mono">why_this_sells</span>.
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

          <Section
            title="Cast"
            aside={
              s.castCount
                ? `${s.castCount} with distinct wants`
                : "none recorded"
            }
          >
            {s.cast.length === 0 ? (
              <p className="text-sm text-muted">
                No cast recorded. Every spinoff starts from this list, so a season
                without one cannot be extended.
              </p>
            ) : (
              <ul className="divide-y divide-rule border-t border-rule">
                {s.cast.map((c) => (
                  <li key={c.id} className="py-4">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="font-serif text-lg">{c.name}</span>
                      <span className="font-mono text-[0.6875rem] text-faint">
                        {c.id}
                      </span>
                      {c.composite && <span className="label">composite</span>}
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
                      <p className="label mt-2">maps to — {c.mapsTo}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Timeline of the real event"
            aside={`${s.timeline.length} ${s.timeline.length === 1 ? "entry" : "entries"}`}
          >
            {s.timeline.length === 0 ? (
              <p className="text-sm text-muted">
                No timeline recorded. Every beat is supposed to cite one of these
                or be marked invented.
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
                      >
                        {t.confidence ?? "confidence not stated"}
                      </span>
                      <span className="font-mono text-[0.6875rem] text-faint">
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
            title="Never narrate as fact"
            aside={`${s.neverNarrateCount} held back`}
          >
            <p className="text-sm text-muted leading-relaxed prose-col mb-4">
              Derived from the <span className="font-mono">alleged</span> and{" "}
              <span className="font-mono">disputed</span> lines above. A character
              may assert any of these; the narrator may not state one as true.
            </p>
            {s.neverNarrate.length === 0 ? (
              <p className="text-sm text-caution leading-relaxed prose-col">
                Nothing is held back. Either the record contains no contested
                claim, or the constraint was never derived — worth checking against
                the timeline before this season is written to.
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
            title="Promise ledger"
            aside={
              s.ledger.absent
                ? "no file"
                : `${s.ledger.openCount} open of ${s.totalPromises}`
            }
          >
            <Ledger ledger={s.ledger} />
          </Section>
        </div>

        <aside className="space-y-8">
          {s.scores && (
            <Section title="Adaptability">
              <ScoreBars scores={s.scores} />
            </Section>
          )}

          {s.clearance && s.clearance.reasons.length > 0 && (
            <Section title="Clearance reasoning">
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
            <Section title="Protagonist">
              <dl className="space-y-2.5">
                {Object.entries(s.protagonist).map(([k, v]) => (
                  <div key={k}>
                    <dt className="label">{k.replace(/_/g, " ")}</dt>
                    <dd className="text-sm text-muted leading-relaxed mt-1">{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {s.antagonist && (
            <Section title="Antagonist">
              <dl className="space-y-2.5">
                {Object.entries(s.antagonist).map(([k, v]) => (
                  <div key={k}>
                    <dt className="label">{k.replace(/_/g, " ")}</dt>
                    <dd className="text-sm text-muted leading-relaxed mt-1">{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          <Section
            title="Fictionalization map"
            aside={s.fictionalizationMap.length ? undefined : "none"}
          >
            {s.fictionalizationMap.length === 0 ? (
              <p className="text-sm text-halt leading-relaxed">
                No map. Real names must be replaced before generation, so a season
                without one cannot be shown to have been.
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

          <Section title="Novelty">
            {s.priorAdaptations.length === 0 ? (
              <p className="text-sm text-clear">No prior adaptation found.</p>
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

          <Section title="Sources">
            {s.sources.length === 0 ? (
              <p className="text-sm text-halt">None cited.</p>
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
