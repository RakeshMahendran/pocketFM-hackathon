import { redirect } from "next/navigation";

import { EDITORS, getEditor, signIn } from "@/lib/session";

// Reads a cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

export default async function SignIn() {
  // Nobody should have to look at the picker twice; the console is not a place
  // you log into, it is a place you already are.
  if (await getEditor()) redirect("/home");

  return (
    <div className="mx-auto max-w-6xl px-8 py-24">
      <h1 className="font-serif text-3xl tracking-tight">Who is commissioning?</h1>

      <p className="mt-4 text-sm text-muted prose-col leading-relaxed">
        Pick a name. There is no password because there are no accounts — this
        console runs on one machine, for one demo, and the name only decides
        whose byline goes on a commission.
      </p>

      <form action={signIn} className="mt-10 max-w-2xl border-y border-rule divide-y divide-rule">
        {EDITORS.map((e) => (
          <button
            key={e.id}
            type="submit"
            name="editor"
            value={e.id}
            className="group w-full text-left px-4 py-5 flex items-baseline gap-4 transition-colors hover:bg-surface"
          >
            <span className="font-serif text-lg transition-colors group-hover:text-ochre">
              {e.name}
            </span>
            <span className="label">{e.role}</span>
            <span className="label ml-auto shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              Continue →
            </span>
          </button>
        ))}
      </form>
    </div>
  );
}
