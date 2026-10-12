import { PageHead } from "@/components/ui";
import { AgentCard } from "@/components/AgentCard";
import { PipelinePath } from "@/components/PipelinePath";
import { DETAIL_HEADING, HOME_NEXT } from "@/components/pathWords";
import { NEXT_CLICK, READY, SHOWS_TITLE, STORY_LIST_TITLE } from "@/lib/words";

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <PageHead title="How the studio works" eyebrow="Studio guide" />
        <div data-testid="studio-methods">
          <h2 className="text-xl">What you can do here</h2>
          <p className="mt-3 text-sm text-muted">Two halves. Find real events worth turning into a series and check we’re allowed to make them — then get more series out of the ones we’ve already made.</p>
          <p className="mt-3">{HOME_NEXT.plain}</p>
          <div className="mt-8"><PipelinePath /></div>
          <h2 className="mt-8">{DETAIL_HEADING}</h2>
      <div className="mt-8 grid md:grid-cols-2 gap-5">
        <AgentCard
          name="Find new stories"
          status={READY}
          href="/scout"
          command="python tasks.py corpus"
        >
          Searches court records and news for real events strange enough to
          carry a series. It only keeps a story if it can open the page it came
          from, so nothing here is invented. Then it rates how long each one
          could run and says whether we&rsquo;re allowed to make it.
        </AgentCard>

        <AgentCard name={STORY_LIST_TITLE} status={READY} href="/sourcing">
          Everything the last search turned up, best first. Anything we
          can&rsquo;t legally make sinks to the bottom and stays there — however
          good it is, nobody can push it through.
        </AgentCard>

        <AgentCard
          name={SHOWS_TITLE}
          status={READY}
          href="/serials"
          command={"python tasks.py serial --event <id>"}
        >
          The series we have already said yes to, with the episode-by-episode
          plan for each one and a check on whether it kept the promises it was
          written to keep.
        </AgentCard>

        <AgentCard
          name="Give a side character their own show"
          status={READY}
          href="/serials"
          command={"python tasks.py spinoff --char <id>"}
        >
          Picks someone from the edge of a finished series and builds a season
          around them. They can only know what they actually saw happen, so
          their show cannot contradict the one they came from. {NEXT_CLICK}
        </AgentCard>

        <AgentCard
          name="Check nothing contradicts"
          status={READY}
          href="/serials"
          command="python tasks.py validate"
        >
          Before anything goes out, six separate checks go looking for places
          the new season clashes with the original. They&rsquo;re built to find
          problems rather than to confirm there aren&rsquo;t any — a check that
          always passes isn&rsquo;t telling you anything. Every spin-off episode
          carries its result. {NEXT_CLICK}
        </AgentCard>
      </div>
        </div>
    </div>
  );
}
