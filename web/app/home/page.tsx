import { AgentCard } from "@/components/AgentCard";
import { requireEditor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const editor = await requireEditor();

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <h1 className="font-serif text-3xl tracking-tight">Agents</h1>
      <p className="label mt-2">{editor.role} desk</p>

      <p className="mt-6 text-sm text-muted prose-col leading-relaxed">
        Every stage of the pipeline is an agent you point at something and run.
        Two are wired to a screen; the rest are on the path and shown here so the
        shape of the tool is legible before it is finished.
      </p>

      <div className="mt-10 grid md:grid-cols-2 gap-5">
        <AgentCard name="Story scout" status="Runnable" href="/scout" command="python tasks.py corpus">
          Hunts real events by mechanism rather than keyword, opens what it cites
          and discards anything it did not, then grades what survives against the
          adaptability rubric and states a clearance verdict with reasons.
        </AgentCard>

        <AgentCard name="Sourcing queue" status="Last hunt" href="/sourcing">
          The scout&rsquo;s output, ranked. Clearance is binding here, not
          advisory: a blocked event sinks below everything clearable however well
          it scored, and the expander refuses it.
        </AgentCard>

        <AgentCard
          name="Slate"
          status="Runnable"
          href="/serials"
          command={"python tasks.py serial --event <id>"}
        >
          What has been commissioned, each season graded against the contract it
          was generated to meet rather than against taste.
        </AgentCard>

        <AgentCard
          name="Spinoff writer"
          status="Not built"
          command={"python tasks.py spinoff --char <id>"}
        >
          Promotes a side character to a full bible on click, compiles what they
          witnessed into immutable constraint lines, and writes their season
          unable to reach anything they are blind to.
        </AgentCard>

        <AgentCard name="Continuity validator" status="Not built" command="python tasks.py validate">
          Three checks and three adversarial refuters, each prompted to find a
          violation rather than confirm the spinoff is clean. A checker that only
          ever shows green reads as decorative.
        </AgentCard>
      </div>
    </div>
  );
}
