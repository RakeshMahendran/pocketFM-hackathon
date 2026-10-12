import Link from "next/link";

import { StoryArt } from "@/components/StoryArt";
import { CHARACTER_VIEW } from "@/lib/words";

/** Shared surfaces, never page-specific card styling. */
export function SeriesCard({ id, title, href, gist, episodes, audioEpisodes, art, blocked }: {
  id: string; title: string; href: string; gist: string; art?: string | null;
  episodes: number; audioEpisodes: number; blocked?: boolean;
}) {
  return <article className={`series-card${blocked ? " series-card-blocked" : ""}`}>
    <Link href={href} className="series-card-open" aria-label={`Open series: ${title}`}>
      <div className="series-cover-stage" data-testid="series-cover" aria-hidden="true">
        <div className="series-cover-object">
          <StoryArt id={id} src={art} className="series-cover" alt="">
            {!art && <div className="series-cover-type"><span className="series-cover-monogram">{title.replace(/^The /i, "")[0]}</span></div>}
          </StoryArt>
        </div>
      </div>
      <div className="series-card-copy">
        <h2>{title}</h2><p data-testid="series-gist">{gist}</p>
        <div className="series-card-counts">
          <span role="group" aria-label="Episodes written"><strong>{episodes}</strong> episodes written</span>
          <span role="group" aria-label="Audio generated"><strong>{audioEpisodes}</strong> audio generated</span>
        </div>
      </div>
      <span className="series-card-arrow" aria-hidden="true">↗</span>
    </Link>
  </article>;
}

/** Compact show identity; the episode workspace begins immediately below. */
export function SeriesOverview({ id, title, gist, children }: { id: string; title: string; gist: string | null; children: React.ReactNode }) {
  return <section aria-label="Series overview" className="series-overview">
    <StoryArt id={id} className="series-overview-art"><span aria-hidden="true" className="series-cover-monogram">{title.replace(/^The /i, "")[0]}</span></StoryArt>
    <div className="series-overview-copy"><h1>{title}</h1>{gist && <p data-testid="show-gist">{gist}</p>}<div className="series-overview-counts">{children}</div></div>
  </section>;
}

export function Panel({ children, className = "", label }: { children: React.ReactNode; className?: string; label?: string }) {
  return <section aria-label={label} className={`studio-panel ${className}`}>{children}</section>;
}

export function PageHead({ title, eyebrow, description, action }: { title: string; eyebrow?: string; description?: string; action?: React.ReactNode }) {
  return <header className="page-head"><div>{eyebrow && <p className="label">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="text-muted mt-2 text-sm">{description}</p>}</div>{action}</header>;
}

/** Honest art slot: initials until approved character art is supplied. No inferred likeness. */
export function CharacterArt({ name, src, large = false }: { name: string; src?: string; large?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join("");
  return <div className={`character-art ${large ? "character-art-large" : ""}`}>
    {src ? <img src={src} alt={name} /> : <><span className="portrait-shape" aria-hidden="true" /><span className="portrait-initials" aria-hidden="true">{initials}</span></>}
    <span className="portrait-caption">{src ? "Character portrait" : "Portrait not set"}</span>
  </div>;
}

export function CharacterCard({ name, href, selected, dimmed, status, children }: { name: string; href: string; selected?: boolean; dimmed?: boolean; status?: string; children?: React.ReactNode }) {
  return <div className={`character-card ${dimmed ? "character-dimmed" : ""}`} data-selected={selected || undefined}>
    <Link href={href} scroll={false} aria-label={`Select character: ${name}`} aria-current={selected ? "true" : undefined} className="character-select">
      <CharacterArt name={name} /><div className="character-card-caption"><strong>{name}</strong>{status && <span>{status}</span>}</div>
    </Link>{children && <div className="character-card-meta">{children}</div>}
  </div>;
}

/**
 * The primitives every revamped screen is built from.
 *
 * One file, because the failure this replaces was nine screens each inventing
 * their own card, their own heading, their own way of showing a number — which
 * is why the console read as nine designs. If a screen needs a shape that is not
 * here, it goes here first.
 */

/** A section heading with an optional right-hand aside. Never a paragraph. */
export function SectionHead({
  title,
  aside,
  href,
}: {
  title: string;
  aside?: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-6">
      {href ? (
        <Link href={href} className="t-section no-underline transition-colors hover:text-gold">
          {title}
        </Link>
      ) : (
        <h2 className="t-section">{title}</h2>
      )}
      {aside && <span className="label shrink-0">{aside}</span>}
    </div>
  );
}

/**
 * A number with its name under it.
 *
 * The name is the small part. Every stat in the old console was a sentence
 * ("Was there for 17 moments and shut out of 29"), which is a number wearing a
 * paragraph — three of these say the same thing in a quarter of the space.
 */
export function Stat({
  value,
  name,
  tone = "paper",
  size = "md",
}: {
  value: React.ReactNode;
  name: string;
  tone?: "paper" | "gold" | "clear" | "halt" | "muted";
  size?: "md" | "lg";
}) {
  const colour = {
    paper: "text-warm-paper",
    gold: "text-gold",
    clear: "text-clear",
    halt: "text-halt",
    muted: "text-warm-muted",
  }[tone];

  return (
    <div>
      <div className={`t-num ${colour} ${size === "lg" ? "text-3xl" : "text-xl"}`}>
        {value}
      </div>
      <div className="label mt-0.5">{name}</div>
    </div>
  );
}

/** A small standing mark. Used only where a state is an exception. */
export function Pill({
  children,
  tone = "quiet",
}: {
  children: React.ReactNode;
  tone?: "quiet" | "gold" | "halt" | "clear";
}) {
  const skin = {
    quiet: "border-white/15 text-warm-muted",
    gold: "border-gold/50 text-gold",
    halt: "border-halt/50 text-halt",
    clear: "border-clear/50 text-clear",
  }[tone];

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[0.625rem] uppercase tracking-[0.12em] ${skin}`}
    >
      {children}
    </span>
  );
}

/** The one filled control on a screen. There is never a second. */
export function Action({
  href,
  children,
  aside,
}: {
  href: string;
  children: React.ReactNode;
  aside?: string;
}) {
  return (
    <span className="flex items-center gap-4">
      <Link
        href={href}
        className="primary-action"
      >
        {children}
      </Link>
      {aside && <span className="label">{aside}</span>}
    </span>
  );
}

/**
 * One item of art on a shelf.
 *
 * Carries art, a name, one line of metadata and at most one number. No prose:
 * the moment a card holds a sentence, a shelf of eight becomes eight paragraphs
 * and the wall is back.
 */
export function ArtCard({
  href,
  id,
  art,
  title,
  meta,
  corner,
  footer,
  tall = false,
  dimmed = false,
}: {
  href: string;
  id: string;
  art?: string | null;
  title: string;
  meta?: string;
  corner?: React.ReactNode;
  footer?: React.ReactNode;
  tall?: boolean;
  dimmed?: boolean;
}) {
  return (
    <Link
      href={href}
      data-testid="art-card"
      className={`art-card group block no-underline ${
        dimmed ? "opacity-45" : ""
      }`}
    >
      <StoryArt id={id} src={art} alt="" className={tall ? "h-48" : "h-32"}>
        {corner && <span className="absolute right-3 top-3">{corner}</span>}
      </StoryArt>
      <div className="px-4 pb-4 pt-3.5">
        {meta && <div className="label truncate">{meta}</div>}
        <h2 className="t-card mt-1.5 text-warm-paper">
          {title}
        </h2>
        {footer && <div className="mt-2.5">{footer}</div>}
      </div>
    </Link>
  );
}

/** Native single-open disclosure with an independently scrolling right-hand pane. */
export function SidePanel({ summary, group, children }: { summary: string; group: string; children: React.ReactNode }) {
  return <details name={group} className="side-panel">
    <summary><span>{summary}</span><span className="side-panel-close">Close details</span></summary>
    <section aria-label={summary} className="side-panel-body">{children}</section>
  </details>;
}

/** A horizontal run of cards. See `.shelf` in globals.css for why it scrolls. */
export function Shelf({ children }: { children: React.ReactNode }) {
  return <div className="shelf">{children}</div>;
}

/**
 * Text on demand.
 *
 * `name` makes a group single-open, which is what keeps a screen from silting
 * up with every fold a reader ever clicked. Plain `<details>`, so find-in-page
 * still reaches the closed content — nothing here is hidden from a search, only
 * from the eye.
 */
export function Reveal({
  summary,
  group,
  children,
  open = false,
  variant = "inline",
}: {
  summary: React.ReactNode;
  group?: string;
  children: React.ReactNode;
  open?: boolean;
  variant?: "inline" | "cover";
}) {
  return (
    <details name={group ?? "page-reference"} open={open} className={`reveal group${variant === "cover" ? " reveal-cover" : ""}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
        <span>{summary}</span>
      </summary>
      <div className="mt-2.5">{children}</div>
    </details>
  );
}

/**
 * The knows / blind split, as one bar and two numbers.
 *
 * This is the product claim, so it renders the same on every screen it appears
 * on and never becomes a sentence. The old roster printed "Was there for 17
 * moments and shut out of 29" beside a bar already showing 17 and 29.
 */
export function Split({
  knows,
  blind,
  size = "sm",
}: {
  knows: number;
  blind: number;
  size?: "sm" | "lg";
}) {
  const total = Math.max(1, knows + blind);
  const pct = (knows / total) * 100;

  if (knows + blind === 0) return <p className="text-sm text-muted">Nothing is recorded about which moments this character was there for, so there is no split to read.</p>;

  return (
    <div>
      <div className={`flex items-baseline gap-3 ${size === "lg" ? "text-2xl" : "text-base"}`}>
        <span className="t-num text-warm-paper">{knows}</span>
        <span className="label" title={CHARACTER_VIEW.knows.plain}>Knows</span>
        <span className="t-num ml-auto text-warm-paper">{blind}</span>
        <span className="label" title={CHARACTER_VIEW.blind.plain}>Blind</span>
      </div>
      <div
        className={`knowledge-track mt-1.5 w-full overflow-hidden rounded-full ${size === "lg" ? "h-2" : "h-1.5"}`}
        role="img"
        aria-label={`Present for ${knows} moments, excluded from ${blind}`}
      >
        <div className="knowledge-fill h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
