import { redirect } from "next/navigation";

import { EDITORS, getEditor, signIn } from "@/lib/session";

// Reads a cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

// Real apostrophes, not HTML entities: these are string values, and `&rsquo;`
// would render literally.
const LANDING_LABEL: Record<string, string> = {
  "/scout": "the story search",
  "/sourcing": "the story list",
  "/serials": "the shows we’re making",
};

export default async function SignIn() {
  // Nobody should have to look at the picker twice; the console is not a place
  // you log into, it is a place you already are.
  const signedIn = await getEditor();
  if (signedIn) redirect(signedIn.landing);

  return (
    <div className="mx-auto max-w-6xl px-8 py-24">
      <h1 className="font-serif text-3xl tracking-tight">
        Who&rsquo;s using this?
      </h1>

      <p className="mt-4 text-sm text-muted prose-col leading-relaxed">
        Pick your name. There is no password and there are no accounts — this
        runs on one laptop, for one demo. Your name is simply what gets recorded
        against anything you decide to make, and it sets which screen you land
        on first. Everyone can see everything. Nobody, whichever name you pick,
        can make a story the legal check has ruled out.
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
            {/* Naming the destination is what stops four names reading as four
                identical accounts. */}
            <span className="label ml-auto shrink-0 transition-colors group-hover:text-ochre">
              starts at {LANDING_LABEL[e.landing] ?? e.landing} →
            </span>
          </button>
        ))}
      </form>
    </div>
  );
}
