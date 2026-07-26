"use client";

import { usePathname } from "next/navigation";

import { PATH_DESCRIBED, PATH_LABEL, STAGES, stageFor } from "@/components/pathWords";

/**
 * Where this screen sits in the four steps, on every screen, quietly.
 *
 * The complaint that produced this was not that the console lacks links — it has
 * far too many — but that nothing said which of four jobs you were doing. So this
 * is a ribbon, not a menu: one line of the same recessed type the rest of the
 * chrome uses, the current step in ochre and the other three left alone. It adds
 * no clickable thing to a screen already carrying dozens.
 *
 * Deliberately not links. The header nav above it already reaches the two
 * top-level areas, and steps three and four cannot be reached without picking a
 * show first — a row of links where half of them are honest and half of them
 * guess at a show would be worse than a row of none. `/home` spells the same
 * four steps out in full, with the routes, and says what each one costs.
 *
 * The one client component in the chrome, because a stage is a fact about the
 * route and a server layout cannot read the route. Nothing else here needs the
 * browser: no state, no effect, no handler.
 */
export function Pipeline() {
  const here = stageFor(usePathname());

  return (
    <div className="border-b border-rule">
      <nav
        aria-label={PATH_DESCRIBED}
        className="mx-auto max-w-6xl px-8 py-2.5 flex items-baseline gap-x-4 gap-y-1 flex-wrap"
      >
        {/* Was `text-rule-strong` — a border colour used as text, at roughly
            2:1. The label naming the whole strip was the least readable thing
            on it. */}
        <span className="label text-faint shrink-0">{PATH_LABEL}</span>

        <ol className="flex items-baseline gap-y-1 flex-wrap">
          {STAGES.map((s, i) => (
            <li key={s.key} className="flex items-baseline">
              {i > 0 && (
                <span className="label px-2.5 text-faint" aria-hidden="true">
                  →
                </span>
              )}
              <span
                className={`label ${
                  s.key === here
                    ? // Ochre alone was a hue shift at almost the same
                      // brightness as the other three — on a projector, which
                      // flattens exactly this kind of difference, all four
                      // stages read identically and the strip stopped
                      // answering the question it exists for. The rule under
                      // the current stage survives that, and survives being
                      // photographed or colour-blind.
                      "text-ochre border-b-2 border-ochre pb-1"
                    : "text-faint"
                }`}
                // The step marker, so a screen reader is told which of the four
                // it is standing in rather than being read four equal names.
                aria-current={s.key === here ? "step" : undefined}
              >
                {s.n}. {s.name}
              </span>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
