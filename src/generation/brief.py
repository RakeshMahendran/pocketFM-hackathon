"""
The brief — everything a writer is given about one character, and nothing else.

String assembly, no LLM. The intelligence of this slice is not in the machinery; it
is in what goes into this file and what is deliberately kept out of it.

The prohibition block is the product. `constrained=False` removes that block and
nothing else, so the leak proof at Gate 3 is a controlled experiment with one
variable rather than a second code path that happens to behave differently.
"""

from typing import Any, Dict, List, Optional

from src.canon import store, views

# Not the guarantee — that is `cites` checked against `allowed_ids` in
# validation/checks.py, with no model involved. This is the instruction that makes
# a well-behaved model easy to keep honest.
PRECEDENCE = (
    "Stance, genre and pitch steer tone. The prohibition list overrides all three. "
    "Canon overrides everything: where an instruction here conflicts with a fact "
    "you were given, the fact wins and you write around it."
)


# ---------------------------------------------------------------------------
# RENDERERS — shared by the promotion call and the spinoff writer
# ---------------------------------------------------------------------------

def render_immutable(payload: Dict[str, Any], name: str) -> str:
    lines = [f"IMMUTABLE — these happened to {name} and cannot change:"]
    lines += [f"- [{f['beat_id']}] {f['fact']}" for f in payload["allowed"]]
    return "\n".join(lines)


def render_prohibitions(payload: Dict[str, Any], name: str) -> str:
    """
    Every blind beat, not just the ones an author marked.

    The emphasised ones are flagged, but the block is complete on purpose: the
    delivered `hidden_from` lists are non-exhaustive and their omissions are not
    random, so absence from the emphasis is never permission.
    """
    upper = name.upper()
    lines = [
        f"{upper} DOES NOT KNOW ANY OF THIS, AND MAY NOT STATE, IMPLY OR ACT AS IF SHE DOES:"
    ]
    for f in payload["forbidden"]:
        mark = " **" if f["emphasised"] else ""
        lines.append(f"- [{f['beat_id']}]{mark} {f['fact']}")
    lines.append(
        "\nItems marked ** were explicitly sealed against her. The rest are sealed "
        "because she was not there. Both are equally binding."
    )
    return "\n".join(lines)


def render_everything(payload: Dict[str, Any], name: str) -> str:
    """
    Every beat in the season, undifferentiated — what a writer gets without this
    system. No `knows`, no `blind`, just "here is the show, write her episode".
    """
    beats = sorted(payload["allowed"] + payload["forbidden"],
                   key=lambda b: b["beat_id"])
    lines = [f"THE SEASON — everything that happens. Write {name}'s episode from it:"]
    lines += [f"- [{b['beat_id']}] {b['fact']}" for b in beats]
    return "\n".join(lines)


def render_open_space(gaps: List[Dict[str, Any]]) -> str:
    lines = ["OPEN SPACE — canon says nothing here, so nothing here can contradict it:"]
    for g in gaps:
        after = g["after_beat"] or "the season opening"
        before = g["before_beat"] or "the season end"
        lines.append(
            f"- between {after} and {before}: {g['span']} beats across episode(s) "
            f"{', '.join(str(e) for e in g['eps'])}, in which she does not appear. "
            f"This is yours."
        )
    return "\n".join(lines)


def render_voice(samples: List[str], name: str) -> str:
    """
    Style reference, explicitly not source material.

    These lines are lifted verbatim from the mainline scripts, and the mainline
    scripts do not always agree with the beat sheet. Ratnamma reads the pension
    order aloud in ep11 of the delivered story while the beats mark her excluded
    from the beat that sanctioned it. Beats win — that is the project rule — which
    means a voice sample can carry a fact this character is not allowed to have.

    So the block says imitate the manner, not the content. Without that sentence the
    brief hands over a forbidden fact and then the panel flags the writer for using
    it, which is entrapment rather than a guarantee.
    """
    lines = [
        f"VOICE — {name}'s own lines from the mainline. Imitate the RHYTHM: sentence "
        f"length, what she repeats, how she deflects, what she does when frightened.",
        "Do NOT reuse their content. Some were spoken in scenes this serial has no "
        "access to, and the prohibition list overrides anything a sample implies.",
    ]
    lines += [f'- "{s}"' for s in samples]
    return "\n".join(lines)


def render_clearance(dossier: Dict[str, Any]) -> str:
    """
    The names and claims that may not reach a script.

    Checks the *keys* of `fictionalization_map` rather than `people[].name`: the
    delivered dossiers deliberately record people by role ("The arrested teacher"),
    so the name list is empty by design and the real exposure is the place names.
    """
    clearance = dossier.get("clearance", {})
    lines = [f"CLEARANCE — status {clearance.get('status', 'unknown')}."]

    real = [k for k in dossier.get("fictionalization_map", {})]
    if real:
        lines.append("These are real and must never appear in a script. Use the "
                     "fictional name in every case:")
        for k, v in dossier.get("fictionalization_map", {}).items():
            lines.append(f"- {k}  ->  {v}")

    never = dossier.get("never_narrate_as_fact", [])
    if never:
        lines.append("\nA character may assert these. The narrator may not state them "
                     "as fact:")
        lines += [f"- {n}" for n in never]
    return "\n".join(lines)


def render_moment(anchor: Dict[str, Any], name: str) -> str:
    """
    The one block that branches.

    A model can write either job well; it cannot guess which one was meant. Told to
    "write this moment" about a beat that also sits on the prohibition list, it has
    to choose, and it chooses differently on different runs — which is not something
    you want in the only live call of a demo.
    """
    head = (f"THE MOMENT — beat {anchor['beat_id']}, episode {anchor['ep']}, "
            f"{anchor.get('location') or 'location unrecorded'}"
            f" ({anchor.get('world_time')}).")
    fact = f"Objectively: {anchor['what_happened']}"
    change = f"What it does to {name}: {anchor['fact']} (valence {anchor['valence']:+d})."

    if anchor["kind"] == "witnessed":
        instruction = (
            f"{name} is there and takes it in. This episode IS this moment. Its "
            "objective facts are fixed — the same action, the same words spoken "
            "aloud, the same outcome. Everything else is yours: what it costs her, "
            "what she notices, what she does not. The mainline gave this twenty "
            "seconds. Give it an episode."
        )
    else:
        instruction = (
            f"{name} is NOT there and never learns this happened. Do not reveal it. "
            "Write the episode beside it — the hours before, the hours after, the "
            "room next door — while this is going on elsewhere. The listener knows. "
            "She does not. Every ordinary thing she does while it happens is the "
            "episode."
        )
    return "\n".join([head, fact, change, "", instruction])


# ---------------------------------------------------------------------------
# THE TWO ASSEMBLED INPUTS
# ---------------------------------------------------------------------------

def build_promotion_input(story: Dict[str, Any], char_id: str) -> str:
    """The user message for the promotion call. Smaller than the spinoff brief:
    no anchor, no crossings — a bible is about the person, not one episode."""
    view = views.character_view(story, char_id)
    payload = views.forbidden_facts(story, char_id)
    name = view["name"]

    return "\n\n".join([
        f"CHARACTER: {name} ({char_id})\n{view['role']}\nStated want: {view['want']}",
        render_immutable(payload, name),
        render_prohibitions(payload, name),
        render_open_space(view["gaps"]),
        render_voice(view["voice_samples"], name),
        f"THE MAINLINE ENGINE (yours must differ from it):\n"
        f"{story['dossier'].get('engine', 'not recorded')}",
    ])


def build_brief(story: Dict[str, Any], char_id: str, anchor_beat_id: str,
                bible: Optional[Dict[str, Any]] = None,
                constrained: bool = True) -> Dict[str, Any]:
    """
    Assemble the spinoff writer's user message.

    Blocks with nothing in them are omitted rather than rendered empty — an empty
    heading teaches the model that the block is optional, and the prohibition block
    is the one that must never read as optional.
    """
    view = views.character_view(story, char_id)
    payload = views.forbidden_facts(story, char_id)
    name = view["name"]

    anchor = next((a for a in view["anchors"] if a["beat_id"] == anchor_beat_id), None)
    if anchor is None:
        anchor = _anchor_from_beat(story, char_id, anchor_beat_id)
    crossings = views.crossing_points(story, char_id, anchor)

    blocks: List[str] = [_who(view, bible)]
    blocks.append(render_moment(anchor, name))

    if constrained:
        blocks.append(render_immutable(payload, name))
        blocks.append(render_prohibitions(payload, name))
    else:
        # The naive baseline, and the thing the leak proof has to compare against:
        # hand the writer the whole season and ask for a point-of-view retelling.
        #
        # Simply dropping the prohibition block is NOT that comparison — it removes
        # the forbidden facts from the prompt as well as the rule about them, and a
        # writer cannot leak what it was never shown. The first version of this
        # produced an unconstrained run cleaner than the constrained one, which
        # proved nothing except that the experiment was built wrong.
        blocks.append(render_everything(payload, name))

    if view["present_not_witnessed"]:
        lines = [f"IN THE ROOM, DID NOT REGISTER — {name} was physically present and "
                 "did not take these in. She cannot recall them as knowledge:"]
        lines += [f"- [{b['beat_id']}] {b['what_happened']}"
                  for b in view["present_not_witnessed"]]
        blocks.append("\n".join(lines))

    if view["gaps"]:
        blocks.append(render_open_space(view["gaps"]))

    if crossings:
        lines = ["CROSSING POINTS — beats this episode shares with the mainline. The "
                 "action, the words spoken aloud and the outcome must match exactly. "
                 "What they mean to her is yours:"]
        lines += [f"- [{c['beat_id']}] {c['what_happened']}" for c in crossings]
        blocks.append("\n".join(lines))

    blocks.append(render_voice(view["voice_samples"], name))
    blocks.append(render_clearance(story["dossier"]))
    blocks.append(PRECEDENCE)

    return {"text": "\n\n".join(blocks), "forbidden": payload, "anchor": anchor,
            "crossings": crossings, "view": view, "constrained": constrained}


def _who(view: Dict[str, Any], bible: Optional[Dict[str, Any]]) -> str:
    lines = [f"WHO: {view['name']} ({view['char_id']})",
             view["role"],
             f"Stated want: {view['want']}"]
    if not bible:
        return "\n".join(lines)

    lines.append("")
    for field in ("stance", "genre", "pitch"):
        if bible.get(field):
            lines.append(f"{field.upper()}: {bible[field]}")
    for field in ("want", "wound", "voice", "engine", "reframe"):
        if bible.get(field):
            lines.append(f"\n{field.upper()}\n{bible[field]}")
    ledger = bible.get("offscreen_ledger") or []
    if ledger:
        lines.append("\nOFFSCREEN LEDGER — what she was doing while canon was elsewhere:")
        lines += [f"- {e.get('window', '?')}: {e.get('what', '')}" for e in ledger]
    return "\n".join(lines)


def _anchor_from_beat(story: Dict[str, Any], char_id: str,
                      beat_id: str) -> Dict[str, Any]:
    """
    An anchor for a beat the ranking did not surface.

    Any beat may be requested explicitly — the top three are a suggestion, not the
    permitted set — but `kind` is still derived from the canon and never from the
    caller, because it decides whether the episode dramatises the beat or hides it.
    """
    beat = store.get_beat(story, beat_id)
    change = next((c for c in beat.get("state_changes", [])
                   if views._entity_is(c.get("entity", ""), char_id)), {})
    return {
        "beat_id": beat_id, "ep": beat["ep"], "seq": beat["seq"],
        "world_time": beat.get("world_time"), "location": beat.get("location"),
        "what_happened": beat["what_happened"],
        "fact": change.get("fact", "nothing recorded against her"),
        "valence": change.get("valence", 0),
        "n_present": len(beat.get("present", [])),
        "kind": "witnessed" if char_id in beat.get("witnessed_by", []) else "offscreen",
    }
