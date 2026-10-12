import type { Metadata } from "next";
import Link from "next/link";
import { StudioNav } from "@/components/StudioNav";
import "./globals.css";

export const PRODUCT = "FlakersFM";
export const metadata: Metadata = {
  title: PRODUCT,
  description: "Real events become series. Side characters become their own story.",
};

/** Persistent app chrome. Show-specific navigation lives in the nested layout. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en">
    <body className="studio-app">
      <a href="#workspace" className="skip-link">Skip to workspace</a>
        <aside className="studio-rail">
          <Link href="/home" className="studio-brand"><span aria-hidden="true">f.</span>{PRODUCT}</Link>
          <p className="studio-eyebrow">Story studio</p>
          <StudioNav />
        </aside>
        <div className="studio-body">
          <main id="workspace" tabIndex={-1}>{children}</main>
          <footer className="studio-footer">Scores are a guide · The legal check is final</footer>
        </div>
    </body>
  </html>;
}
