import Link from "next/link";
import { notFound } from "next/navigation";

import { EpisodeScript, listenMinutes } from "@/components/EpisodeScript";
import { loadEpisode, loadSerial } from "@/lib/serials";
import { requireEditor } from "@/lib/session";

export const dynamic = "force-dynamic";

function parseEp(raw: string): number | null {
  const n = Number(decodeURIComponent(raw));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata(props: PageProps<"/serials/[id]/[ep]">) {
  const { id, ep } = await props.params;
  const n = parseEp(ep);
  if (n === null) return { title: "CanonForge" };
  const episode = await loadEpisode(decodeURIComponent(id), n);
  return {
    title: episode?.title
      ? `Episode ${n} — ${episode.title}`
      : `Episode ${n} — CanonForge`,
  };
}

export default async function EpisodePage(props: PageProps<"/serials/[id]/[ep]">) {
  await requireEditor();
  const { id: rawId, ep: rawEp } = await props.params;
  const id = decodeURIComponent(rawId);
  const n = parseEp(rawEp);
  if (n === null) notFound();

  const [serial, episode] = await Promise.all([loadSerial(id), loadEpisode(id, n)]);
  if (!serial || !episode) notFound();

  const plan = serial.spine.find((e) => e.ep === n) ?? null;
  const order = serial.episodes.map((e) => e.ep);
  const at = order.indexOf(n);
  const prev = at > 0 ? order[at - 1] : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <div className="flex items-baseline justify-between gap-6 flex-wrap">
        <Link
          href={`/serials/${serial.id}`}
          className="label hover:text-ochre transition-colors"
        >
          ← {serial.title}
        </Link>
        <div className="label">
          Episode {n} of {serial.spineLength || serial.episodeCount} · ~
          {listenMinutes(episode.words)} min · {episode.words.toLocaleString()} words
        </div>
      </div>

      <header className="mt-8 max-w-3xl">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-sm text-faint tabular-nums">
            {String(n).padStart(2, "0")}
          </span>
          {plan && (plan.hookType || plan.hookRaw) && (
            <span className="label text-ochre">
              ends on {plan.hookType ?? plan.hookRaw}
            </span>
          )}
          {plan && plan.status !== null && (
            <span className="label">standing {plan.status}</span>
          )}
        </div>

        <h1 className="font-serif text-4xl tracking-tight mt-3 leading-tight">
          {episode.title ?? `Episode ${n}`}
        </h1>

        {plan?.turn && (
          <p className="mt-5 font-serif text-lg text-muted leading-relaxed">
            {plan.turn}
          </p>
        )}

        {!plan && (
          <p className="mt-5 text-sm text-caution leading-relaxed">
            This episode has no entry in the season plan, so there is nothing to
            check the script against.
          </p>
        )}
      </header>

      <article className="mt-12 border-t border-rule pt-10">
        <EpisodeScript body={episode.body} />
      </article>

      {plan?.endsOn && (
        // Repeated at the foot on purpose: having just read the last line, the
        // planned hook is the one thing an editor wants to compare it against.
        <div className="mt-12 border-t border-rule pt-6 max-w-3xl">
          <h2 className="label text-ochre">The hook it was written to</h2>
          <p className="text-[0.9375rem] text-muted leading-relaxed mt-2 prose-col">
            {plan.endsOn}
          </p>
        </div>
      )}

      <nav className="mt-12 border-t border-rule pt-6 flex items-center justify-between gap-6">
        {prev !== null ? (
          <Link
            href={`/serials/${serial.id}/${prev}`}
            className="label hover:text-ochre transition-colors"
          >
            ← Episode {prev}
          </Link>
        ) : (
          <span className="label text-faint">Start of season</span>
        )}
        {next !== null ? (
          <Link
            href={`/serials/${serial.id}/${next}`}
            className="label hover:text-ochre transition-colors"
          >
            Episode {next} →
          </Link>
        ) : (
          <span className="label text-faint">End of season</span>
        )}
      </nav>
    </div>
  );
}
