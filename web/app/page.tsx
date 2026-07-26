import { redirect } from "next/navigation";

import { PRODUCT } from "@/app/layout";
import { DEFAULT_EDITOR, getEditor, signIn } from "@/lib/session";

// Reads a cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

/**
 * One button.
 *
 * This used to ask which of four editors you were, and name the screen each of
 * them lands on. That was honest about the byline — the name is what gets
 * recorded against a decision — but it put a choice nobody had an opinion about
 * between a visitor and the product, and the four rows looked enough like
 * accounts to invite a question about login that this console does not answer.
 *
 * The byline did not go anywhere. `DEFAULT_EDITOR` signs the decisions, the
 * release history still reads "put out by Priya Raghavan", and `EDITORS` is
 * untouched for when somebody wants the picker back.
 */
export default async function SignIn() {
  // Nobody should have to look at this twice; the console is not a place you
  // log into, it is a place you already are.
  const signedIn = await getEditor();
  if (signedIn) redirect(signedIn.landing);

  return (
    <div className="mx-auto max-w-6xl px-8 py-24">
      {/*
        Not the product name. The header carries that on every screen including
        this one, and the two sat forty pixels apart reading like a rendering
        fault. What a first-time reader needs here is what the thing does.
      */}
      <h1 className="font-serif text-4xl tracking-tight leading-tight prose-col">
        Real events in, serials out — and every side character can become a
        protagonist without breaking continuity.
      </h1>

      <p className="mt-6 text-sm text-muted prose-col leading-relaxed">
        There is no password and there are no accounts: this runs on one laptop.
        Anything you decide to make is recorded against{" "}
        {DEFAULT_EDITOR.name}, so a show that goes live says who put it there.
      </p>

      <form action={signIn} className="mt-10">
        <input type="hidden" name="editor" value={DEFAULT_EDITOR.id} />
        <button
          type="submit"
          className="inline-block bg-ochre border border-ochre text-ink font-medium px-6 py-3 text-sm rounded-sm hover:bg-ochre/85 transition-colors"
        >
          Get started →
        </button>
      </form>
    </div>
  );
}
