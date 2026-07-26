import Link from "next/link";

import {
  PATH_EXPLAINED,
  PATH_HEADING,
  STAGES,
  STAGE_ENTRY,
} from "@/components/pathWords";

/**
 * The four steps spelled out, on the one screen where spelling them out is the
 * job.
 *
 * The ribbon at the top of every screen says which step you are in and nothing
 * else, deliberately — it has to stay quiet enough to ignore. The front door is
 * where a stranger finds out what the four steps *are*, in what order, and where
 * each one starts. Two of them cannot be reached without picking a show first,
 * and that is said rather than papered over with a link that guesses at one.
 */
export function PipelinePath() {
  return (
    <section>
      <h2 className="font-serif text-2xl tracking-tight">{PATH_HEADING}</h2>
      <p className="mt-3 text-sm text-muted leading-relaxed prose-col">
        {PATH_EXPLAINED}
      </p>

      <ol className="mt-8 border-t border-rule">
        {STAGES.map((s) => (
          <li
            key={s.key}
            className="border-b border-rule py-6 grid md:grid-cols-[2.5rem_1fr_11rem] gap-x-6 gap-y-3 items-baseline"
          >
            <span className="font-mono text-lg text-faint tabular-nums leading-none">
              {s.n}
            </span>

            <div className="min-w-0">
              <h3 className="font-serif text-xl leading-snug">{s.name}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed prose-col">
                {s.means}
              </p>
              {/* A step that needs a show picked first says so, rather than
                  being papered over with a link that guesses at one. */}
              {s.needs && (
                <p className="mt-2 text-sm text-faint leading-relaxed prose-col">
                  {s.needs}
                </p>
              )}
            </div>

            {s.href ? (
              <Link
                href={s.href}
                className="label hover:text-ochre transition-colors md:text-right"
              >
                {STAGE_ENTRY} →
              </Link>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
