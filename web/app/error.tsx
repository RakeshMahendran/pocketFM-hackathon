"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";

/**
 * Last line of defence. The realistic cause here is malformed JSON under
 * `data/` — the loader tolerates missing files and missing fields, but not a
 * file that fails to parse.
 *
 * Worth having for its own sake: a stack trace on a projector is a worse
 * outcome than any bug it describes.
 *
 * Note the prop is `unstable_retry`, not the `reset` older versions used.
 * Does not catch failures inside the root layout — that needs `global-error`.
 */
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-24">
      <div className="label text-halt">Something failed</div>
      <h1 className="font-serif text-3xl tracking-tight mt-3">
        The console could not read its data
      </h1>
      <p className="mt-4 text-sm text-muted prose-col leading-relaxed">
        Missing files and missing fields are handled — a file that will not
        parse is not. Check the JSON under <code className="font-mono">data/</code>,
        most likely <code className="font-mono">corpus.json</code> or a story
        dossier edited by hand.
      </p>

      {error.digest && (
        <p className="mt-4 label">
          digest <span className="font-mono">{error.digest}</span>
        </p>
      )}

      <button
        onClick={unstable_retry}
        className="mt-8 border border-ochre/50 text-ochre px-4 py-2 text-sm rounded-sm hover:bg-ochre/10 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
