"use client";

import { useFormStatus } from "react-dom";

import { startAudioRun } from "@/lib/audio-run";
import {
  RECORDABLE_LANGUAGES,
  RECORD_LANGUAGE_HEADING,
  RECORD_STARTING,
  languageName,
} from "./audioWords";

/**
 * The button that sends one episode to the studio.
 *
 * A microphone was asked for, and there is one — but it is a mark on a labelled
 * button, never the whole control. This console has no icon set and no icon-only
 * controls anywhere in it: everything a producer can press says in words what it
 * does, because the actions on these screens spend money and a glyph a reader
 * has to interpret is the wrong place to find that out. The mic is 14px of
 * `currentColor` drawn inline, so it inherits the button's state and adds no
 * dependency to a project that has none for this.
 *
 * The click starts a detached run and lands back on this episode, which watches
 * it — so the only thing this has to cover is the second between the press and
 * the redirect. `StartSpinoffRun` and `CommissionAction` do the same, for the
 * same reason: a button that looks unresponsive gets pressed twice, and twice
 * is two paid runs.
 *
 * What the run costs is NOT stated here. It belongs beside the button in the
 * panel's own prose, where it can be read before the pointer is over the
 * control — a `title` a producer discovers after clicking has told them nothing.
 */

type Variant = "primary" | "quiet";

const STYLE: Record<Variant, string> = {
  primary:
    "inline-flex items-center gap-2.5 border border-ochre/50 text-ochre px-4 py-2 text-sm rounded-sm hover:bg-ochre/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent",
  // Where a recording already exists the player is the point of the panel, so
  // this is weighted as a link among links rather than as a second offer.
  quiet:
    "inline-flex items-center gap-2 border border-rule text-muted px-3 py-1.5 text-sm rounded-sm hover:text-paper hover:border-rule-strong transition-colors disabled:opacity-50",
};

/** A microphone, at the weight of the type beside it. */
function Mic({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
    </svg>
  );
}

function Submit({ label, variant }: { label: string; variant: Variant }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={STYLE[variant]}>
      <Mic />
      {pending ? RECORD_STARTING : label}
    </button>
  );
}

export function StartAudioRun({
  storyId,
  ep,
  label,
  variant = "primary",
  /**
   * Whether to offer the choice of language. Withheld on a retry, where the
   * point is to run the same thing again rather than to order a different cut.
   */
  chooseLanguage = true,
  /** Pre-selected. The season's own language, which is English on everything here. */
  defaultLanguage = "en",
}: {
  storyId: string;
  ep: number;
  label: string;
  variant?: Variant;
  chooseLanguage?: boolean;
  defaultLanguage?: string;
}) {
  return (
    <form action={startAudioRun}>
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="ep" value={ep} />

      {chooseLanguage ? (
        <label className="block max-w-xs">
          <span className="label">{RECORD_LANGUAGE_HEADING}</span>
          <select
            name="language"
            defaultValue={defaultLanguage}
            className="mt-2 w-full bg-surface border border-rule rounded-sm px-3 py-2 text-sm text-paper"
          >
            {RECORDABLE_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {languageName(code)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="language" value={defaultLanguage} />
      )}

      <div className={chooseLanguage ? "mt-4" : ""}>
        <Submit label={label} variant={variant} />
      </div>
    </form>
  );
}
