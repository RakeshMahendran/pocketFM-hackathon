import type { Metadata } from "next";
import Link from "next/link";

import { getEditor, signOut } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "CanonForge",
  description:
    "Real events worth turning into a series, rated and legally checked.",
};

/**
 * Two top-level areas, because that is how a commissioning editor's week
 * actually splits — what we could make, and what we have made. Both hang off
 * /home, the screen an editor lands on, which lists the jobs the tool can do.
 *
 * Signed out, the nav offers nothing. Not for security — the guard that matters
 * is in each page — but because links into an app you cannot read are noise on
 * the one screen that has a single job.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const editor = await getEditor();

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-rule">
          <div className="mx-auto max-w-6xl px-8 h-16 flex items-center gap-10">
            <Link
              href={editor ? "/home" : "/"}
              className="flex items-baseline gap-2.5 shrink-0"
            >
              <span className="font-serif text-lg tracking-tight">CanonForge</span>
              <span className="label">Pocket FM</span>
            </Link>

            {editor && (
              <>
                <nav className="flex items-center gap-7 text-sm">
                  <Link href="/home" className="hover:text-ochre transition-colors">
                    Home
                  </Link>
                  <Link href="/sourcing" className="hover:text-ochre transition-colors">
                    Stories
                  </Link>
                  <Link href="/serials" className="hover:text-ochre transition-colors">
                    Shows
                  </Link>
                </nav>

                <div className="ml-auto flex items-baseline gap-5">
                  <span className="label">
                    {editor.name} · {editor.role}
                  </span>
                  <form action={signOut}>
                    <button type="submit" className="label hover:text-ochre transition-colors">
                      Sign out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-rule">
          <div className="mx-auto max-w-6xl px-8 py-5 label">
            Scores are a guide · The legal check is final
          </div>
        </footer>
      </body>
    </html>
  );
}
