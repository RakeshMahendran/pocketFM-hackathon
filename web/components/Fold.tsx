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

/**
 * Several folds under one heading, at the foot of a screen.
 *
 * `ReferenceGroup` on the season screen is the same arrangement and the same
 * argument: everything a producer looks up rather than reads goes behind one
 * heading and one click each. It is not imported because its standing text is
 * about a season's sources, and because that file belongs to the season
 * redesign — the heading it uses is passed in here instead, so the two screens
 * still call the idea by one name.
 *
 * The point is the heading count. Four folds loose in the page read as four
 * sections; four folds inside this read as one place to look things up.
 */
export function FoldGroup({
  title,
  explained,
  children,
}: {
  title: string;
  explained: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16 border-t border-rule-strong pt-6">
      <h2 className="label">{title}</h2>
      <p className="mt-3 text-sm text-muted leading-relaxed prose-col">
        {explained}
      </p>
      <div className="mt-6">{children}</div>
    </section>
  );
}
