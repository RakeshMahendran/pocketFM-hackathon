import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Demo sign-in. This is NOT authentication and must not become it.
 *
 * `docs/BUILD_PLAN.md` cuts auth and accounts by name. A password field on
 * stage is a live failure point — a typo, a stale autofill, a keyboard layout —
 * and it earns nothing from a judge who is watching for continuity, not login.
 * So: a name picker, a signed-nothing cookie, four hardcoded editors.
 *
 * The cookie exists to give the console a byline, not to keep anyone out.
 * Anyone who can reach the machine is authorised by standing in front of it.
 * If real accounts are ever needed, this file is replaced wholesale rather than
 * hardened in place — do not add hashing, sessions or a user table here and
 * leave the rest of the shape intact, because that produces something that
 * looks like auth and isn't.
 */

export type Editor = { id: string; name: string; role: string };

export const EDITORS: Editor[] = [
  { id: "priya", name: "Priya Raghavan", role: "Commissioning" },
  { id: "arjun", name: "Arjun Menon", role: "Series editor" },
  { id: "devika", name: "Devika Iyer", role: "Standards & clearance" },
  { id: "farhan", name: "Farhan Qureshi", role: "Development" },
];

const COOKIE = "cf_editor";

/**
 * The cookie holds an id, never a name or role — the id is validated against
 * `EDITORS` on every read, so an edited cookie yields null rather than an
 * editor of the attacker's choosing appearing in the byline.
 */
export async function getEditor(): Promise<Editor | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  return EDITORS.find((e) => e.id === id) ?? null;
}

/** Guard for inner routes. Call it first in a page; it returns or it redirects. */
export async function requireEditor(): Promise<Editor> {
  const editor = await getEditor();
  if (!editor) redirect("/");
  return editor;
}

export async function signIn(formData: FormData): Promise<void> {
  "use server";

  const id = String(formData.get("editor") ?? "");
  // Back to the picker rather than an error page: the only way to get here with
  // an unknown id is a hand-made POST, and there is nothing to explain to it.
  if (!EDITORS.some((e) => e.id === id)) redirect("/");

  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    // No `secure`. The demo is served over plain http from a laptop, and a
    // secure cookie is silently dropped there — the sign-in would appear to do
    // nothing at all, on stage, with no error to point at.
  });

  redirect("/home");
}

export async function signOut(): Promise<void> {
  "use server";

  (await cookies()).delete(COOKIE);
  redirect("/");
}
