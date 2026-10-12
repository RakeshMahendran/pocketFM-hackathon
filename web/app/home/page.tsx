import Link from "next/link";
import { Action, PageHead, Panel } from "@/components/ui";
import { StoryArt } from "@/components/StoryArt";

/** The studio front door: start a story or continue existing work. */
export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <PageHead title="Your story studio" description="Find a real story. Build a show. Discover who leads the next one." />
      <div className="studio-hero mb-10">
        <Panel>
          <p className="label mb-5">Start something new</p>
          <h2 className="text-3xl leading-tight tracking-tight">The next great series<br />starts with a real story.</h2>
          <p className="text-muted text-sm mt-4 mb-7">Discover stories with room to grow—and a legal check before you commit.</p>
          <Action href="/sourcing">Explore new stories →</Action>
        </Panel>
        <StoryArt id="studio-home" className="studio-hero-art" />
      </div>
      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <Panel><p className="label">Continue creating</p><h2 className="text-xl mt-3">Your shows</h2><p className="text-sm text-muted mt-2">Episodes, recordings and release decisions.</p><Link href="/serials" className="inline-block mt-6">Open your shows →</Link></Panel>
        <Panel><p className="label">A different point of view</p><h2 className="text-xl mt-3">A side character. A new lead.</h2><p className="text-sm text-muted mt-2">Choose a show, then explore its cast.</p><Link href="/serials" className="inline-block mt-6">Find a character →</Link></Panel>
      </div>
    </div>
  );
}
