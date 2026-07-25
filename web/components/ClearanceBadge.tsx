import type { Clearance } from "@/lib/types";

const LOOK: Record<string, { label: string; className: string }> = {
  greenlight: { label: "Greenlight", className: "text-clear border-clear/40" },
  fictionalize_first: {
    label: "Fictionalize first",
    className: "text-caution border-caution/40",
  },
  blocked: { label: "Blocked", className: "text-halt border-halt/50 bg-halt/10" },
};

/**
 * The column an editor reads first. `blocked` is the only one that carries a
 * fill — it is the only status that changes what they are allowed to do.
 */
export function ClearanceBadge({
  clearance,
  size = "sm",
}: {
  clearance: Clearance | null;
  size?: "sm" | "lg";
}) {
  const look = clearance
    ? LOOK[clearance.status]
    : { label: "Uncleared", className: "text-faint border-rule" };

  return (
    <span
      className={`inline-flex items-center border rounded-sm whitespace-nowrap ${
        look.className
      } ${
        size === "lg"
          ? "px-2.5 py-1 text-xs tracking-[0.12em] uppercase"
          : "px-2 py-0.5 text-[0.625rem] tracking-[0.14em] uppercase"
      }`}
    >
      {look.label}
    </span>
  );
}
