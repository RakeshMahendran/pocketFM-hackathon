import { CLEARANCE, CLEARANCE_UNKNOWN } from "@/lib/words";
import type { Clearance } from "@/lib/types";

const TONE: Record<string, string> = {
  greenlight: "text-clear border-clear/40",
  fictionalize_first: "text-caution border-caution/40",
  blocked: "text-halt border-halt/50 bg-halt/10",
};

/**
 * The first thing an editor reads. It says what they may do, not what the
 * pipeline decided — "Can't make this" rather than `blocked`.
 *
 * Only the refusal carries a fill, because it is the only status that changes
 * what happens next.
 */
export function ClearanceBadge({
  clearance,
  size = "sm",
}: {
  clearance: Clearance | null;
  size?: "sm" | "lg";
}) {
  const words = clearance ? CLEARANCE[clearance.status] : CLEARANCE_UNKNOWN;
  const tone = clearance ? TONE[clearance.status] : "text-faint border-rule";

  return (
    <span
      title={words.plain}
      className={`inline-flex items-center border rounded-sm whitespace-nowrap ${tone} ${
        size === "lg"
          ? "px-2.5 py-1 text-xs tracking-[0.12em] uppercase"
          : "px-2 py-0.5 text-[0.625rem] tracking-[0.14em] uppercase"
      }`}
    >
      {words.short}
    </span>
  );
}
