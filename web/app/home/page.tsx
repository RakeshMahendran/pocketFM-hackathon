import { AgentCard } from "@/components/AgentCard";
import { requireEditor } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The front door after signing in.
 *
 * It used to be titled "Agents" and describe pipeline stages — adaptability
 * rubrics, adversarial refuters, immutable constraint lines — with a terminal
 * command printed on every card. That is a map of how the thing was built, and
 * the person reading it is deciding where to spend a production slot.
 *
 * Each card now names a job in the language of the work, and says plainly what
 * is not finished rather than dressing it as a stage.
 */
export default async function Home() {
  const editor = await requireEditor();

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <h1 className="font-serif text-3xl tracking-tight">What you can do here</h1>
      <p className="label mt-2">{editor.role}</p>

      <p className="mt-6 text-sm text-muted prose-col leading-relaxed">
        Two halves. Find real events worth turning into a series and check
        we&rsquo;re allowed to make them — then get more series out of the ones
        we&rsquo;ve already made. The greyed-out cards aren&rsquo;t built yet.
      </p>

      <div className="mt-10 grid md:grid-cols-2 gap-5">
        <AgentCard
          name="Find new stories"
          status="Ready"
          href="/scout"
          command="python tasks.py corpus"
        >
          Searches court records and news for real events strange enough to
          carry a series. It only keeps a story if it can open the page it came
          from, so nothing here is invented. Then it rates how long each one
          could run and says whether we&rsquo;re allowed to make it.
        </AgentCard>

        <AgentCard name="Stories worth making" status="Ready" href="/sourcing">
          Everything the last search turned up, best first. Anything we
          can&rsquo;t legally make sinks to the bottom and stays there — however
          good it is, nobody can push it through.
        </AgentCard>

        <AgentCard
          name="What we’re making"
          status="Ready"
          href="/serials"
          command={"python tasks.py serial --event <id>"}
        >
          The series we have already said yes to, with the episode-by-episode
          plan for each one and a check on whether it kept the promises it was
          written to keep.
        </AgentCard>

        <AgentCard
          name="Give a side character their own show"
          status="Not built yet"
          command={"python tasks.py spinoff --char <id>"}
        >
          Picks someone from the edge of a finished series and builds a season
          around them. They can only know what they actually saw happen, so
          their show cannot contradict the one they came from.
        </AgentCard>

        <AgentCard
          name="Check nothing contradicts"
          status="Not built yet"
          command="python tasks.py validate"
        >
          Before anything goes out, six separate checks go looking for places
          the new season clashes with the original. They&rsquo;re built to find
          problems rather than to confirm there aren&rsquo;t any — a check that
          always passes isn&rsquo;t telling you anything.
        </AgentCard>
      </div>
    </div>
  );
}
