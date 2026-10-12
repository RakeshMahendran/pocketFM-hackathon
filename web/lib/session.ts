import { cookies } from "next/headers";

/**
 * Demo attribution only, NOT authentication. BUILD_PLAN excludes accounts.
 * Existing cookies retain their bylines; fresh visits use the default.
 * Real authentication needs a separate design, not a hardened demo cookie.
 */
export type Editor = { id: string; name: string; role: string; landing: string };

// Preserve historical editor identities for existing work and demo fixtures.
export const EDITORS: Editor[] = [
  { id: "farhan", name: "Farhan Qureshi", role: "Development", landing: "/scout" },
  { id: "priya", name: "Priya Raghavan", role: "Commissioning", landing: "/sourcing" },
  { id: "devika", name: "Devika Iyer", role: "Standards & clearance", landing: "/sourcing" },
  { id: "arjun", name: "Arjun Menon", role: "Series editor", landing: "/serials" },
];

export const DEFAULT_EDITOR: Editor =
  EDITORS.find((e) => e.id === "priya") ?? EDITORS[0];

/** Missing or invalid cookies use a known byline, never arbitrary names. */
export async function getEditor(): Promise<Editor> {
  const id = (await cookies()).get("cf_editor")?.value;
  return EDITORS.find((e) => e.id === id) ?? DEFAULT_EDITOR;
}

/** Existing callers receive attribution without an entry gate. */
export async function requireEditor(): Promise<Editor> {
  return getEditor();
}
