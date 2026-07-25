"use client";

import { useState } from "react";

/**
 * Commissioning is a real backend action and there is no API to call yet, so
 * this hands over the command rather than pretending to run it. A button that
 * silently does nothing would be worse than one that is honest about the seam.
 *
 * It also exercises the selection fix: before it, an editor could only expand
 * the scout's pick, and any row but the winner had no command at all.
 */
export function CommissionAction({
  id,
  title,
  blocked,
  reasons,
  editor,
}: {
  id: string;
  title: string;
  blocked: boolean;
  reasons: string[];
  editor: { id: string; name: string; role: string } | null;
}) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  // `--by` stamps the dossier. Commissioning is a decision a person made, and
  // until this existed a season recorded only the model that ranked it.
  const command = editor
    ? `python tasks.py score --event "${id}" --by ${editor.id}`
    : `python tasks.py score --event "${id}"`;

  if (blocked) {
    return (
      <div className="border border-halt/40 bg-halt/5 rounded-sm p-4">
        <div className="label text-halt mb-2">Cannot be commissioned</div>
        <p className="text-sm text-muted prose-col">
          Clearance is binding, not advisory. {title} is cleared{" "}
          <span className="font-mono text-halt">blocked</span>, and the expander
          refuses it whether a model or an editor chose it.
        </p>
        {reasons.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {reasons.map((r, i) => (
              <li key={i} className="text-sm text-faint flex gap-2">
                <span aria-hidden>—</span>
                <span className="prose-col">{r}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied("ok");
    } catch {
      // Clipboard needs a secure context; over plain http on a demo machine it
      // throws. The command is on screen either way.
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 2000);
  }

  return (
    <div>
      {editor && (
        <p className="label mb-3">
          as {editor.name} · {editor.role}
        </p>
      )}
      {!shown ? (
        <button
          onClick={() => setShown(true)}
          className="border border-ochre/50 text-ochre px-4 py-2 text-sm rounded-sm hover:bg-ochre/10 transition-colors"
        >
          Commission this
        </button>
      ) : (
        <div className="border border-rule rounded-sm">
          <div className="px-4 py-2 border-b border-rule label">
            Run from the repo root
          </div>
          <div className="p-4 flex items-center gap-3 flex-wrap">
            <code className="font-mono text-sm text-paper break-all">{command}</code>
            <button
              onClick={copy}
              className="ml-auto label hover:text-ochre transition-colors shrink-0"
            >
              {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
