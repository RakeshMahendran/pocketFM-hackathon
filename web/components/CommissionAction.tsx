"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { startCommission } from "@/lib/commission";
import { FOR_THE_OPERATOR } from "@/lib/words";

/**
 * Makes the story.
 *
 * This used to reveal a terminal command and stop — there was no API layer and
 * no key, so handing the line over was the honest thing to do. Both exist now,
 * so the button does the work: it starts the season in a detached process and
 * moves the reader to a page that watches it.
 *
 * The command stays, behind the operator disclosure. Somebody still maintains
 * this and a season can still need starting by hand.
 */

function Submit() {
  // Writing takes minutes, but *starting* takes a moment. This covers the gap
  // between the click and the redirect so nothing looks unresponsive.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="border border-ochre/50 text-ochre px-4 py-2 text-sm rounded-sm hover:bg-ochre/10 transition-colors disabled:opacity-60"
    >
      {pending ? "Starting…" : "Make this one"}
    </button>
  );
}

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
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const command = `python tasks.py commission --event "${id}"`;

  if (blocked) {
    return (
      <div className="border border-halt/40 bg-halt/5 rounded-sm p-4">
        <div className="label text-halt mb-2">We can&rsquo;t make this one</div>
        <p className="text-sm text-muted prose-col">
          {title} can&rsquo;t be made, and changing the names wouldn&rsquo;t fix
          the reason. Nobody can overrule this — not you, not whoever ran the
          search. It gets refused either way.
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
      // Clipboard needs a secure context; over plain http it throws. The
      // command is on screen either way.
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

      <form action={startCommission}>
        <input type="hidden" name="eventId" value={id} />
        <Submit />
      </form>

      <p className="mt-3 text-sm text-muted prose-col leading-relaxed">
        This works out the season, then writes the episodes. It takes a few
        minutes and you can leave the page while it runs.
      </p>

      <details className="mt-5">
        <summary className="label cursor-pointer hover:text-ochre transition-colors">
          {FOR_THE_OPERATOR}
        </summary>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <code className="font-mono text-xs text-faint break-all">{command}</code>
          <button
            onClick={copy}
            className="ml-auto label hover:text-ochre transition-colors shrink-0"
          >
            {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Copy"}
          </button>
        </div>
      </details>
    </div>
  );
}
