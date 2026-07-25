/**
 * Says what is wrong with the data on screen.
 *
 * A console that silently renders assembled or incomplete rows as though they
 * were real pipeline output is worse than one that shows nothing — an editor
 * would make a commissioning decision on it.
 */
export function Notice({
  tone = "warn",
  children,
}: {
  tone?: "warn" | "info";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`border-l-2 pl-4 py-2 text-sm ${
        tone === "warn"
          ? "border-caution/60 text-muted"
          : "border-rule-strong text-faint"
      }`}
    >
      {children}
    </div>
  );
}
