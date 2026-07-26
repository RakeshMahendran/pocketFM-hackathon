import { AgentCard } from "@/components/AgentCard";
import { NextStep } from "@/components/NextStep";
import { PipelinePath } from "@/components/PipelinePath";
import { DETAIL_HEADING, FREE_CLICK, HOME_NEXT } from "@/components/pathWords";
import { requireEditor } from "@/lib/session";
import { NEXT_CLICK, READY, SHOWS_TITLE, STORY_LIST_TITLE } from "@/lib/words";

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
 *
 * The two spin-off cards sat greyed out as "Not built yet" for a while after
 * both halves shipped, which left the front page disowning half the product.
 * They point at the slate rather than at a character, because a spin-off only
 * exists inside a season — there is no route to a cast without picking a show
 * first, and hard-coding one season's id into the front door would be a claim
 * about the slate that stops being true the next time we commission anything.
 *
 * Five cards of equal weight is a menu, though, not a path, and a stranger
 * reading it could not tell which one to press first or what any of them led to
 * afterwards. So the screen now opens with the one first click, then the four
 * steps in order, and the cards keep their place underneath as the detail behind
 * each step rather than as the way in.
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
        we&rsquo;ve already made.
      </p>

      <div className="mt-8 max-w-2xl">
        <NextStep action={HOME_NEXT.action} href="/sourcing" cost={FREE_CLICK}>
          {HOME_NEXT.plain}
        </NextStep>
      </div>

      <div className="mt-14">
        <PipelinePath />
      </div>

      <h2 className="font-serif text-2xl tracking-tight mt-16">
        {DETAIL_HEADING}
      </h2>

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
  );
}
