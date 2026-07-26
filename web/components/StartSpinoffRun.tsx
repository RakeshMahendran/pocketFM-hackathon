"use client";

import { useFormStatus } from "react-dom";

import { startSpinoffRun } from "@/lib/spinoff-run";
import { STARTING } from "@/components/spinoffRunWords";

/**
 * The button that gives one side character their own episode.
 *
 * The click starts a detached run and lands on the character's page, which
 * watches it — so the only thing this has to cover is the second between the
 * press and the redirect. `CommissionAction` does the same for a season, and
 * for the same reason: a button that looks unresponsive gets pressed twice, and
 * twice is two paid runs.
 *
 * What the run costs is NOT stated here. It belongs beside the button in the
 * page's own prose, where it can be read before the pointer is over the
 * control — a `title` a producer discovers after clicking has told them
 * nothing.
 */

type Variant = "primary" | "row";

const STYLE: Record<Variant, string> = {
  primary:
    "border border-ochre/50 text-ochre px-4 py-2 text-sm rounded-sm hover:bg-ochre/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent",
  // On a roster row this sits among links, so it is weighted like one.
  row: "label text-ochre hover:text-paper transition-colors disabled:opacity-50 disabled:hover:text-ochre",
};

function Submit({
  label,
  variant,
  disabled,
  title,
}: {
  label: string;
  variant: Variant;
  disabled: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      title={title}
      className={STYLE[variant]}
    >
      {pending ? STARTING : label}
    </button>
  );
}

export function StartSpinoffRun({
  storyId,
  charId,
  label,
  variant = "primary",
  disabled = false,
  title,
}: {
  storyId: string;
  charId: string;
  label: string;
  variant?: Variant;
  /**
   * Set from `promotable`, which is computed by `views.promotable()` in Python.
   * The control is withheld here; the decision is not made here.
   */
  disabled?: boolean;
  title?: string;
}) {
  return (
    <form action={startSpinoffRun}>
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="charId" value={charId} />
      <Submit
        label={label}
        variant={variant}
        disabled={disabled}
        title={title}
      />
    </form>
  );
}
