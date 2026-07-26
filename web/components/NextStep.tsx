import Link from "next/link";

import {
  HELD_LABEL,
  NEXT_LABEL,
  ONWARD_LABEL,
  SEASON_ALL_OUT,
  SEASON_GO_LIVE,
  SEASON_NOTHING_WRITTEN,
  goToEpisode,
} from "@/components/pathWords";
import { episodeAnchor, refusedRelease } from "@/components/ReleaseControls";
import type { Checks } from "@/lib/publish";
import {
  CHECKED_EVERY_TIME,
  RELEASE_NOT_A_PUSH,
  type SeasonRelease,
  nextRelease,
} from "@/lib/words";

/**
 * The one thing this screen wants you to do, drawn so it cannot be mistaken for
 * the thirty other things on it.
 *
 * Three tones, and they are three different pieces of news:
 *
 *   do     — the next move, in ochre. At most one per screen, ever.
 *   onward — nothing left to do here, but the reader still has somewhere to be.
 *            Quiet, because it is a courtesy rather than an instruction.
 *   held   — the pipeline would refuse this, and the screen must refuse it in
 *            the same place. Drawn as a wall. It never carries a control.
 *
 * Reading order is the whole design: what happens, then what it costs, then the
 * click. A producer who reads top to bottom has met the consequence before their
 * cursor reaches anything. This is the rule the console kept breaking — the
 * spin-off run, the commission and the release all cost minutes or money, and
 * every one of them used to say so underneath the button.
 *
 * `href` is optional on purpose. Some next steps are a control further down the
 * same page that is gated in Python — a release on a failing check, the live
 * toggle on a draft show. Those are *named*, never re-offered: a second button
 * that jumps past a refusal is how a guarantee becomes decorative.
 */
export function NextStep({
  heading,
  tone = "do",
  action,
  href,
  cost,
  level = 2,
  children,
}: {
  /** Defaults by tone. Override only when the screen needs a truer word. */
  heading?: string;
  tone?: "do" | "onward" | "held";
  /** The move, in the words a producer would use for it. */
  action: string;
  href?: string;
  /** What it spends. Every next step carries one, or says it is free. */
  cost?: string | null;
  /**
   * Where this sits in the page's outline. A screen whose next step is about
   * the section it stands in — the season's, which is a fact about the episode
   * list it opens — nests under that section's heading rather than competing
   * with it. Drawn identically either way; this is for the outline, not the eye.
   */
  level?: 2 | 3;
  /** The consequence, before the click. */
  children?: React.ReactNode;
}) {
  const box =
    tone === "do"
      ? "border-ochre/40 bg-ochre/[0.04]"
      : tone === "held"
        ? "border-halt/40 bg-halt/5"
        : "border-rule-strong";

  const label =
    tone === "do" ? "text-ochre" : tone === "held" ? "text-halt" : "";

  const button =
    tone === "do"
      ? "border-ochre/60 text-ochre hover:bg-ochre/10"
      : "border-rule-strong hover:border-ochre hover:text-ochre";

  const title =
    heading ??
    (tone === "do" ? NEXT_LABEL : tone === "held" ? HELD_LABEL : ONWARD_LABEL);

  const Heading = level === 3 ? "h3" : "h2";

  return (
    <section className={`border rounded-sm p-5 ${box}`}>
      <Heading className={`label ${label}`}>{title}</Heading>

      {children && (
        <p className="mt-3 text-[0.9375rem] text-paper leading-relaxed prose-col">
          {children}
        </p>
      )}

      {cost && (
        <p className="mt-3 text-xs text-faint leading-relaxed prose-col">{cost}</p>
      )}

      {href ? (
        <Link
          href={href}
          className={`mt-4 inline-block border px-5 py-2.5 text-sm rounded-sm transition-colors ${button}`}
        >
          {action} →
        </Link>
      ) : (
        // No route, because the control is on this page and gated. Named, not
        // offered.
        <p className="mt-4 font-serif text-lg text-muted">{action}</p>
      )}
    </section>
  );
}

/**
 * The season screen's next step, as one drop-in.
 *
 * It lives here rather than on the page because `/serials/[id]/page.tsx` is
 * owned by another track this session. Everything it needs is already loaded
 * there — see the header comment of that file for the drop-in line.
 *
 * It never renders a release control. `publish_episode()` refuses on a failing
 * check and `EpisodeReleaseList` is where that refusal is shown; this walks the
 * reader to that list and says which episode is the one, or says plainly that
 * nothing goes out at all.
 */
export function SeasonNextStep({
  storyId,
  season,
  checks,
  castCount,
}: {
  storyId: string;
  season: SeasonRelease;
  checks: Checks;
  /** Named people in the finished season — the door into the spin-off half. */
  castCount: number;
}) {
  const next = nextRelease(season);
  const castHref = `/serials/${encodeURIComponent(storyId)}/cast`;

  if (next.kind === "ready") {
    // The same refusal the episode's own row shows, asked of the same function,
    // so the two can never disagree about whether this season can release.
    const refused = refusedRelease(checks, next.ep);
    if (refused) {
      return (
        <NextStep tone="held" action={goToEpisode(next.ep)} cost={CHECKED_EVERY_TIME}>
          {refused.plain}
        </NextStep>
      );
    }
    return (
      <NextStep
        action={goToEpisode(next.ep)}
        href={`#${episodeAnchor(next.ep)}`}
        cost={RELEASE_NOT_A_PUSH}
      >
        {next.plain}
      </NextStep>
    );
  }

  if (next.kind === "all-out") {
    // The end of stage three is the start of stage four, and this is the only
    // screen that can say so with a show already in hand.
    return castCount > 0 ? (
      <NextStep action={SEASON_ALL_OUT.action} href={castHref}>
        {SEASON_ALL_OUT.plain}
      </NextStep>
    ) : (
      <NextStep tone="onward" action={SEASON_NOTHING_WRITTEN.action} href="/serials">
        {next.plain}
      </NextStep>
    );
  }

  if (next.kind === "show-not-live") {
    // Asked here too, and for the same reason it is asked in the `ready` branch
    // above: a season whose checks refuse it cannot go live either, so pointing
    // at the release controls would send a producer down the page to a wall
    // this block had already told them was a door. `story4_family_betrayal` and
    // `story3_revenge` both land here, and both are shows whose whole job is to
    // demonstrate that the refusal is real.
    //
    // Episode 1 is what a not-live season would release first; `refusedRelease`
    // uses the number for wording only, so asking about it is the same question
    // as asking about the season.
    const refused = refusedRelease(checks, 1);
    if (refused) {
      return (
        <NextStep tone="held" action={refused.label} cost={CHECKED_EVERY_TIME}>
          {refused.plain}
        </NextStep>
      );
    }
    return (
      <NextStep action={SEASON_GO_LIVE.action}>{SEASON_GO_LIVE.plain}</NextStep>
    );
  }

  return (
    <NextStep
      tone="onward"
      action={SEASON_NOTHING_WRITTEN.action}
      href="/serials"
    >
      {SEASON_NOTHING_WRITTEN.plain}
    </NextStep>
  );
}
