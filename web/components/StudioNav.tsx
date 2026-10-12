"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const destinations = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/sourcing", label: "Discover", icon: "discover" },
  { href: "/serials", label: "Shows", icon: "shows" },
  { href: "/scout", label: "Search replay", icon: "replay" },
  { href: "/how-it-works", label: "How it works", icon: "guide" },
] as const;

function Icon({ kind }: { kind: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "home" ? <path d="m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7" /> :
      kind === "discover" ? <><circle cx="12" cy="12" r="9" /><path d="m15 9-2 4-4 2 2-4 4-2Z" /></> :
      kind === "shows" ? <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M8 3v4m8-4v4M3 10h18" /></> :
      kind === "guide" ? <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.01" /></> :
      <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /><path d="m11 9 5 3-5 3V9Z" /></>}
  </svg>;
}

export function StudioNav() {
  const pathname = usePathname();
  return <nav aria-label="Studio" className="studio-navigation">
    {destinations.map(({ href, label, icon }) => {
      const active = pathname === href || (href === "/serials" && pathname.startsWith("/serials/")) || (href === "/sourcing" && /^\/(candidates|commissioning)\//.test(pathname));
      return <Link key={href} href={href} aria-current={active ? "page" : undefined}><Icon kind={icon} /><span>{label}</span></Link>;
    })}
  </nav>;
}

export function ShowTabs({ storyId, title }: { storyId: string; title: string }) {
  const pathname = usePathname();
  const base = `/serials/${encodeURIComponent(storyId)}`;
  const cast = pathname.startsWith(`${base}/cast`);
  const episode = !cast && pathname !== base;
  return <div className="show-context">
    <Link href={base} className="show-context-title">{title}</Link>
    <nav aria-label="Show workspace">
      <Link href={base} aria-current={!cast && !episode ? "page" : undefined}>Overview</Link>
      <Link href={`${base}#whats-out`} aria-current={episode ? "page" : undefined}>Episodes</Link>
      <Link href={`${base}/cast`} aria-current={cast ? "page" : undefined}>Cast</Link>
      <Link href={`${base}#look-something-up`}>Reference</Link>
    </nav>
  </div>;
}
