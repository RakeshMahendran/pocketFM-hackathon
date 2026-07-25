import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "CanonForge — Sourcing",
  description:
    "Commissioning console: real events worth adapting, scored and cleared.",
};

/**
 * Two top-level areas, because that is how a commissioning editor's week
 * actually splits — what we could make, and what we have made.
 *
 * Slate belongs to the story-universe half and is not built here yet. It is
 * shown inert rather than hidden: an editor should be able to see the shape of
 * the tool, and a nav that grows later looks unfinished.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-rule">
          <div className="mx-auto max-w-6xl px-8 h-16 flex items-center gap-10">
            <Link href="/" className="flex items-baseline gap-2.5 shrink-0">
              <span className="font-serif text-lg tracking-tight">CanonForge</span>
              <span className="label">Pocket FM</span>
            </Link>

            <nav className="flex items-center gap-7 text-sm">
              <Link href="/" className="hover:text-ochre transition-colors">
                Sourcing
              </Link>
              <span
                className="text-faint cursor-not-allowed"
                title="Commissioned serials — in progress"
              >
                Slate
              </span>
            </nav>

            <div className="ml-auto label">Content · Commissioning</div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-rule">
          <div className="mx-auto max-w-6xl px-8 py-5 label">
            Scores are advisory · Clearance is binding
          </div>
        </footer>
      </body>
    </html>
  );
}
