import Link from "next/link";

import { Notice } from "@/components/Notice";
import { ScoreStrip } from "@/components/ScoreStrip";
import { StoryArt } from "@/components/StoryArt";
import { Action, ArtCard, Pill, SectionHead, Stat, Reveal } from "@/components/ui";
import { hook } from "@/lib/presentation";
import { loadCorpus } from "@/lib/data";
import { requireEditor } from "@/lib/session";
import {
  BAR_EXPLAINED,
  CASE_AGAINST,
  FOR_THE_OPERATOR,
  SEARCH_RAN,
  STORY_LIST_TITLE,
  category,
} from "@/lib/words";
import type { Candidate } from "@/lib/types";

// Reads the filesystem on every request, so a fresh search shows up without a
// rebuild.
export const dynamic = "force-dynamic";

/**
 * The slate, as a catalogue rather than a document.
 *
 * What this replaces: thirty rows, each a title plus two paragraphs of equal
 * weight, first row 680px down the page. To compare three stories you scrolled
 * past 1,400px of prose and re-read it.
 *
 * The shape now is the one every catalogue converged on, because it is the one
 * that works: one thing offered at full size, then art in a grid, and text only
 * once something has been chosen. Nothing was removed — the ranked table is
 * still here behind `?view=table`, and every field it showed is on the brief.
 *
 * Filtering is a query parameter rather than client state, so this stays a
 * server component: no JavaScript ships for a row of links.
 */

/**
 * The hook, out of the sell.
 *
 * `why_this_sells` runs to a median of 24 words and a maximum of 111 — and the
 * scout's current winner is the 111. Rendered whole at display size that is not
 * a hook, it is an essay in a headline slot.
 *
 * The rest is not dropped: the brief renders the field in full, one click away.
 */
function clearanceWord(c: Candidate): {
  word: string;
  short: string;
  blocked: boolean;
} {
  const status = c.clearance?.status;
  if (status === "blocked")
    return { word: "Blocked", short: "Blocked", blocked: true };
  if (status === "fictionalize_first")
    return { word: "Fictionalize first", short: "Fictionalize", blocked: false };
  // Greenlight earns no badge. With thirty rows carrying the same label a pill
  // on every one says nothing; absence is the signal.
  return { word: "", short: "", blocked: false };
}

function months(episodes: number | null): string | null {
  if (!episodes) return null;
  // Daily unlocks, which is how a season is scheduled and the only reason the
  // episode count is a money number rather than trivia.
  const m = Math.max(1, Math.round(episodes / 30));
  return `${episodes} eps · ~${m} month${m === 1 ? "" : "s"}`;
}

/** The scout's pick, at the size of a decision. */
function TopPick({ c }: { c: Candidate }) {
  const legal = clearanceWord(c);
  return <section data-testid="top-pick" className="studio-hero">
    <Link href={`/candidates/${encodeURIComponent(c.id)}`} className="block no-underline">
      <StoryArt id={c.id} className="studio-hero-art" />
    </Link>
    <div>
      <p className="label mb-3">Recommended by the search</p>
      <h2 className="text-2xl leading-tight tracking-tight">{c.title}</h2>
      {c.why_this_sells && <p data-testid="sells" className="text-sm text-muted leading-relaxed mt-3">{hook(c.why_this_sells)}</p>}
      <div className="flex items-end gap-7 mt-5">
        <div data-testid="total"><Stat value={<span className="sorted-value">{c.scores ? `${c.scores.total}/50` : "—"}</span>} name="score" /></div>
        <div data-testid="episodes"><Stat value={c.episode_estimate ?? "—"} name="possible episodes" /></div>
        <ScoreStrip scores={c.scores} size="lg" />
      </div>
      <p className="label mt-3">{legal.word || (c.clearance ? "Cleared to make" : "Legal check not recorded")}</p>
      <div className="mt-5"><Action href={`/candidates/${encodeURIComponent(c.id)}`}>Open the brief →</Action></div>
      <div className="mt-5"><Reveal summary="Why this story" group="sourcing-evidence">
        <p>{c.why_this_sells}</p>{c.why_not && <p className="mt-3 text-muted">{CASE_AGAINST}: {c.why_not}</p>}
      </Reveal></div>
    </div>
  </section>;
}

/** One story, as art. Carries no sentence — that is the whole point. */
function StoryCard({ c }: { c: Candidate }) {
  const legal = clearanceWord(c);
  return (
    <article data-testid="story-row"><ArtCard
      href={`/candidates/${encodeURIComponent(c.id)}`}
      id={c.id}
      title={c.title}
      meta={[category(c.category), months(c.episode_estimate)]
        .filter(Boolean)
        .join(" · ")}
      dimmed={legal.blocked}
      corner={
        <span className="t-num sorted-value rounded-full border border-white/15 bg-white/95 px-2.5 py-0.5 text-[0.8rem]">
          {c.scores?.total ?? "—"}
        </span>
      }
      footer={
        <div className="flex items-center justify-between">
          <ScoreStrip scores={c.scores} />
          <span data-testid={legal.blocked ? "blocked" : undefined}><Pill tone={legal.blocked ? "halt" : "quiet"}>{legal.word || (c.clearance ? "Cleared" : "Unchecked")}</Pill></span>
        </div>
      }
    /><div className="px-2 mt-2"><Reveal summary="Why it sells" group="story-rows">
      <div data-testid="case-against"><p>{c.why_this_sells}</p><p className="mt-3">{c.why_not}</p>{c.one_line && <p className="mt-3">{c.one_line}</p>}</div>
    </Reveal></div></article>
  );
}

/** The comparison view, kept for the one job a grid is bad at. */
function TableView({ rows }: { rows: Candidate[] }) {
  const cols =
    "grid-cols-[1fr_11rem_4rem_2.75rem_3.5rem_6.5rem] items-center gap-5 px-4";
  return (
    <div className="comparison-table">
      <div className={`comparison-head grid ${cols} border-b border-white/10 py-1.5`}>
        <span className="label">Story</span>
        <span className="label">Kind</span>
        <span className="label whitespace-nowrap text-right">Scores</span>
        <span className="label text-right">Total</span>
        <span className="label text-right">Eps</span>
        <span className="label">Legal</span>
      </div>
      {rows.map((c) => {
        const legal = clearanceWord(c);
        return (
          <Link
            key={c.id}
            href={`/candidates/${encodeURIComponent(c.id)}`}
            data-testid="story-row"
            className={`comparison-row grid ${cols} border-b border-white/5 py-2.5 no-underline transition-colors hover:bg-tile ${
              legal.blocked ? "bg-raised text-warm-muted" : ""
            }`}
          >
            <span className="compare-title t-card truncate text-warm-paper">{c.title}</span>
            <span data-label="Kind" className="label truncate">{category(c.category)}</span>
            <div data-label="Five axes"><ScoreStrip scores={c.scores} /></div>
            <span data-label="Total" className="t-num sorted-value text-right text-[0.95rem]">
              {c.scores?.total ?? "—"}
            </span>
            <span data-label="Episodes" className="t-num text-right text-[0.8rem] text-warm-muted">
              {c.episode_estimate ?? "—"}
            </span>
            <span
              data-label="Legal"
              className={`label truncate ${legal.blocked ? "text-halt" : ""}`}
              data-testid={legal.blocked ? "blocked" : undefined}
            >
              {legal.short || (c.clearance ? "Cleared" : "Unchecked")}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export default async function SourcingQueue({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  await requireEditor();
  const { candidates, assembled, builtAt, warnings } = await loadCorpus();
  const q = await searchParams;
  const kind = typeof q.kind === "string" ? q.kind : null;
  const asTable = q.view === "table";

  const blocked = candidates.filter((c) => c.clearance?.status === "blocked").length;
  const canMake = candidates.length - blocked;

  // Never a blocked row: pointing at a story nobody may commission is worse
  // than pointing at nothing.
  const makeable = candidates.filter((c) => c.clearance?.status !== "blocked");
  const lead = makeable.find((c) => c.winner) ?? makeable[0] ?? null;

  const rest = candidates.filter((c) => c.id !== lead?.id);
  const kinds = [...new Set(rest.map((c) => c.category).filter(Boolean))] as string[];
  const shown = kind ? rest.filter((c) => c.category === kind) : rest;

  const href = (next: { kind?: string | null; view?: string | null }) => {
    const p = new URLSearchParams();
    const k = "kind" in next ? next.kind : kind;
    const v = "view" in next ? next.view : asTable ? "table" : null;
    if (k) p.set("kind", k);
    if (v) p.set("view", v);
    const s = p.toString();
    return s ? `/sourcing?${s}` : "/sourcing";
  };

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[0.7rem] uppercase tracking-[0.12em] no-underline transition-colors ${
      on
        ? "border-gold/60 text-gold"
        : "border-white/15 text-warm-muted hover:text-warm-paper"
    }`;

  return (
    <div className="mx-auto max-w-[88rem] px-10 py-9">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="t-title">{STORY_LIST_TITLE}</h1>
          <p className="label mt-2">
            <Link href="/scout" className="transition-colors hover:text-gold">
              {assembled ? SEARCH_RAN.earlier : SEARCH_RAN.latest}
              {builtAt && ` · searched ${builtAt.slice(0, 10)}`}
              {` · ${SEARCH_RAN.replay} →`}
            </Link>
          </p>
        </div>

        {candidates.length > 0 && (
          <div className="flex items-end gap-8">
            <Stat value={candidates.length} name="found" />
            <Stat value={canMake} name="we can make" tone="clear" />
            <Stat value={blocked} name="we can't" tone={blocked ? "halt" : "muted"} />
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="mt-6 space-y-3">
          {warnings.map((w, i) => (
            <Notice key={i}>{w}</Notice>
          ))}
        </div>
      )}

      {candidates.length === 0 ? (
        <div className="mt-14 rounded-2xl border border-white/10 p-10">
          <h2 className="t-section">No stories yet</h2>
          <p className="t-body mt-3 max-w-[34rem] text-warm-muted">
            Nobody has run a search yet. When one runs, it reads court records
            and news for real events that could carry a series, rates them, and
            checks whether we&rsquo;re allowed to make each one.
          </p>
          {/* Addressed to whoever runs the machine, not to the person reading
              this page. */}
          <details name="sourcing-operator" className="mt-6">
            <summary className="label cursor-pointer hover:text-gold">
              {FOR_THE_OPERATOR}
            </summary>
            <code className="mt-3 block font-mono text-sm text-gold">
              python tasks.py corpus
            </code>
          </details>
        </div>
      ) : (
        <>
          {lead && (
            <div className="mt-8">
              <TopPick c={lead} />
            </div>
          )}

          <section className="mt-14">
            <SectionHead
              title={kind ? (category(kind) ?? "The rest") : "The rest of the slate"}
              aside={`${shown.length} of ${rest.length}`}
            />

            {/* Filter and view as links, not client state — a row of chips does
                not need a hydrated bundle. */}
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <Link href={href({ kind: null })} className={chip(!kind)}>
                Everything
              </Link>
              {kinds.map((k) => (
                <Link key={k} href={href({ kind: k })} className={chip(kind === k)}>
                  {category(k)}
                </Link>
              ))}

              <span className="ml-auto flex items-center gap-1.5">
                <Link
                  href={href({ view: null })}
                  className={`label no-underline ${asTable ? "" : "text-gold"}`}
                >
                  Cards
                </Link>
                <span className="label">/</span>
                <Link
                  href={href({ view: "table" })}
                  className={`label no-underline ${asTable ? "text-gold" : ""}`}
                >
                  Table
                </Link>
              </span>
            </div>
            <div className="mb-5"><Reveal summary="Sorted by total score · Reading the scores" group="sourcing-evidence"><p>Engine · Hook · Feeling · Conflict · Cast. Each axis is out of 10, in this fixed order.</p><p className="mt-2">The search recommendation leads. Remaining stories are ordered by total; blocked stories stay last.</p><p className="mt-2">{BAR_EXPLAINED}</p></Reveal></div>

            {asTable ? (
              <TableView rows={shown} />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {shown.map((c) => (
                  <StoryCard key={c.id} c={c} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
