import Link from "next/link";

/**
 * One stage of the pipeline, as something you run.
 *
 * A card without an `href` is a stage that exists in the architecture but not
 * yet in the app. It renders inert rather than being hidden: an editor should
 * be able to read the whole shape of the tool off one screen, and a picker that
 * grows a card later reads as unfinished rather than as progress.
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
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <h2
          className={`font-serif text-xl leading-snug ${
            href ? "transition-colors group-hover:text-ochre" : ""
          }`}
        >
          {name}
        </h2>
        <span className={`label shrink-0 ${href ? "text-ochre" : ""}`}>{status}</span>
      </div>

      <p className="mt-3 text-sm text-muted leading-relaxed">{children}</p>

      {command && (
        <code className="mt-4 block font-mono text-xs text-faint break-all">
          {command}
        </code>
      )}
    </>
  );

  if (!href) {
    return (
      <div className="border border-rule rounded-sm p-6 opacity-55" aria-disabled>
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group block border border-rule rounded-sm p-6 transition-colors hover:border-rule-strong hover:bg-surface"
    >
      {body}
    </Link>
  );
}
