"""
The season, as questions a director can ask.

A director given one episode is directing blind. Whether episode 7 is the third
scalp or the dip before it depends on where 6 landed and what 8 does — and which
of its neighbours it needs to look at depends on what it finds in this one.

These read the season plan and the already-directed episodes beside this one.
Nothing here reaches the network.
"""

import json
from typing import Any, Dict, List

from src.agent import Tool
from src.util import DATA, read_json

STORIES = DATA / "stories"


def tools_for(story: str) -> List[Tool]:
    story_dir = STORIES / story

    def _dossier() -> Dict[str, Any]:
        return read_json(story_dir / "dossier.json")

    def season_plan() -> Dict[str, Any]:
        """The whole arc: every episode's turn, hook and intended status."""
        return {"season": [
            {k: e.get(k) for k in ("ep", "turn", "hook_type", "pays_off", "status")}
            for e in _dossier().get("season", [])]}

    def episode_curve(ep: int) -> Dict[str, Any]:
        """How a neighbouring episode was actually directed, if it was."""
        path = story_dir / "audio" / f"ep{int(ep):02d}.json"
        if not path.exists():
            return {"ep": ep, "directed": False,
                    "note": "not converted yet — use the season plan's intended status"}
        episode = read_json(path)
        lines = episode["lines"]
        return {
            "ep": ep,
            "directed": bool(episode.get("directed")),
            "intensity": [l.get("intensity") for l in lines],
            "emotions": [l.get("emotion") for l in lines],
            "beds": sorted({l.get("bgm_cue") for l in lines if l.get("bgm_cue")}),
            "last_line": lines[-1]["text"] if lines else "",
        }

    def protagonist() -> Dict[str, Any]:
        """Who this season is about, and what they are ashamed of."""
        d = _dossier()
        return {"fantasy": d.get("fantasy"),
                "protagonist": d.get("protagonist"),
                "antagonist": d.get("antagonist")}

    return [
        Tool("season_plan",
             "Every episode's turn, hook type, payoff and intended public status. "
             "Use to see whether this episode is a climb, a dip or a scalp.",
             {"type": "object", "required": [], "properties": {}},
             season_plan),
        Tool("episode_curve",
             "How a neighbouring episode was directed: its intensity curve, its "
             "emotions, its beds and its last line. Use to calibrate against what "
             "comes before and after.",
             {"type": "object", "required": ["ep"],
              "properties": {"ep": {"type": "integer"}}},
             episode_curve),
        Tool("protagonist",
             "The fantasy this season sells, and what the protagonist wants and "
             "is ashamed of. A line lands differently against the thing it costs.",
             {"type": "object", "required": [], "properties": {}},
             protagonist),
    ]
