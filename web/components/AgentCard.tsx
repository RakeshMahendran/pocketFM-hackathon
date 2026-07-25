import Link from "next/link";

/**
 * One job the tool can do, described by what it does for you.
 *
 * A card without an `href` is on the roadmap. It renders inert rather than
 * hidden: an editor should be able to read the whole shape of the tool off one
 * screen, and a picker that grows a card later reads as unfinished rather than
 * as progress.
 *
 * `command` is tucked into a disclosure, and that disclosure sits *outside* the
 * link — inside it, opening the command would navigate away instead. It is real
 * and someone needs it, but it is addressed to whoever runs the machine.
 * A terminal command in front of a commissioning editor tells them the tool was
 * not built for them.
 */
export function AgentCard({
  name,
  status,
  href,
  command,
  children,
}: {
  name: string;
  status: string;
  href?: string;
  command?: string;
  children: React.ReactNode;
}) {
  const heading = (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <h2
          className={`font-serif text-xl leading-snug ${
            href ? "transition-colors group-hover:text-ochre" : ""
          }`}
        >
          {name}
        </h2>
        <span className={`label shrink-0 ${href ? "text-ochre" : ""}`}>
          {status}
        </span>
      </div>
      <p className="mt-3 text-sm text-muted leading-relaxed">{children}</p>
    </>
  );

  return (
    <div
      className={`border border-rule rounded-sm flex flex-col ${
        href ? "transition-colors hover:border-rule-strong" : "opacity-55"
      }`}
      aria-disabled={href ? undefined : true}
    >
      {href ? (
        <Link href={href} className="group block p-6 pb-4 flex-1">
          {heading}
        </Link>
      ) : (
        <div className="p-6 pb-4 flex-1">{heading}</div>
      )}

      {command && (
        <details className="px-6 pb-5">
          <summary className="label cursor-pointer hover:text-ochre list-none">
            For whoever runs it
          </summary>
          <code className="mt-2 block font-mono text-xs text-faint break-all">
            {command}
          </code>
        </details>
      )}
    </div>
  );
}
