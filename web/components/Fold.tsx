/**
 * One thing you can open, closed by default.
 *
 * The same idiom the season screen uses for its reference half: a `<details>`,
 * a summary that carries enough on its closed line to be scanned, and no
 * JavaScript. Written here rather than imported from `SeasonLayout` because that
 * file belongs to the season redesign and this is used on the character screens;
 * two small components beat two tracks editing one file.
 *
 * The rule it exists to keep: fold, never delete. A producer defending a
 * commissioning decision still needs the script and the crossing points, and
 * they are one click from where they always were.
 */
export function Fold({
  title,
  aside,
  open,
  children,
}: {
  title: string;
  /** Enough on the closed line to decide whether to open it. */
  aside?: string;
  /** Open on arrival. For the one thing a screen exists to show. */
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="group border-t border-rule">
      <summary className="py-4 cursor-pointer list-none flex items-baseline justify-between gap-6 hover:text-ochre transition-colors">
        <span className="label">
          {title}
          <span className="group-open:hidden" aria-hidden="true">
            {" "}
            ▸
          </span>
          <span className="hidden group-open:inline" aria-hidden="true">
            {" "}
            ▾
          </span>
        </span>
        {aside && <span className="label shrink-0">{aside}</span>}
      </summary>
      <div className="pb-8">{children}</div>
    </details>
  );
}
