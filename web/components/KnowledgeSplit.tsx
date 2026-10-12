import { SPLIT_EXPLAINED } from "@/lib/words";
import { Reveal, Split } from "@/components/ui";

/** Compatibility adapter: all character views share the same split primitive. */
export function KnowledgeSplit({ witnessed, blind, explain = false, size = "sm" }: {
  witnessed: number; blind: number; explain?: boolean; size?: "sm" | "lg";
}) {
  return <div><Split knows={witnessed} blind={blind} size={size} />
    {explain && <div className="mt-4"><Reveal summary="What these limits mean" group="knowledge-help">
      <p>{SPLIT_EXPLAINED}</p>
      <p className="mt-2">Knows: was there for these moments. Blind: never found out about them.</p>
    </Reveal></div>}
  </div>;
}
