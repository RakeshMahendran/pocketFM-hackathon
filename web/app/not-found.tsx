import Link from "next/link";

/**
 * Reached when a candidate id is not in the corpus — most often a stale link
 * after the corpus was refrozen, since ids are a hash of the source URL and a
 * rerun of the hunt produces different ones.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-8 py-24">
      <div className="label">Not found</div>
      <h1 className="font-serif text-3xl tracking-tight mt-3">
        That story isn&rsquo;t here
      </h1>
      <p className="mt-4 text-sm text-muted prose-col leading-relaxed">
        Saved links stop working after a new search — every story gets a fresh
        reference each time. It may well still be in the list under a new one.
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
