import Link from "next/link";

/**
 * Reached when a candidate id is not in the corpus — most often a stale link
 * after the corpus was refrozen, since ids are a hash of the source URL and a
 * rerun of the hunt produces different ones. On screen that has to become one
 * plain sentence: saved links go stale when a new search runs.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-8 py-24">
      <div className="label">Not found</div>
      <h1 className="font-serif text-3xl tracking-tight mt-3">
        That story isn&rsquo;t here
      </h1>
      <p className="mt-4 text-sm text-muted prose-col leading-relaxed">
        A link you saved earlier stops working once a new search has run, because
        every story gets a new link each time. The story itself is most likely
        still in the list.
      </p>
      <Link
        href="/sourcing"
        className="inline-block mt-8 border border-ochre/50 text-ochre px-4 py-2 text-sm rounded-sm hover:bg-ochre/10 transition-colors"
      >
        Back to the list
      </Link>
    </div>
  );
}
