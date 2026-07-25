"""
Three guarantees this stage makes, and the ways they actually break.

Grounding: a candidate citing a page the model never opened must not reach the
corpus. The demo puts source links on screen and everything downstream treats a
corpus item as sourced.

Scores: every number the thresholds read is written by the model being judged.
`total` is derived here instead, and the 0-10 band strict mode cannot express is
enforced here too.

Thresholds: the winner is the one candidate taken on the model's say-so and then
expanded into a whole season, so the floors have to be re-checked in code — and
which of them refuse outright is a decision, not an accident.
"""

import json

import pytest

from src.discovery.search import (domain_of, ground_candidates, hunt,
                                  load_prompt, normalise_url, BRIEF,
                                  MIN_ALSO_CONSIDERED, MIN_TOTAL,
                                  MIN_ENGINE_LONGEVITY, SCORE_FIELDS,
                                  SCORE_MAX, _CANDIDATE)


class FakeResponse:
    """The shape the Responses API actually returns, as plain dicts."""

    def __init__(self, consulted, body, status="completed"):
        self.status = status
        self.output_text = json.dumps(body)
        self.output = [
            {"type": "web_search_call",
             "action": {"type": "search",
                        "sources": [{"url": u} for u in consulted]}},
            {"type": "message", "content": [{"type": "output_text", "text": self.output_text}]},
        ]


class StubClient:
    def __init__(self, response):
        self.responses = self
        self._response = response

    def create(self, **_kwargs):
        return self._response


def _candidate(title, sources, total=45, engine=9, clearance="fictionalize_first"):
    """
    Sub-scores that genuinely add up to `total`. Setting the total alone would
    test nothing these tests claim to: it is recomputed from the five axes.
    """
    base, extra = divmod(total - engine, 4)
    rest = [base + (1 if i < extra else 0) for i in range(4)]
    scores = dict(zip(SCORE_FIELDS[1:], rest), engine_longevity=engine, total=total)
    return {"title": title, "sources": sources, "scores": scores,
            "clearance": {"status": clearance}}


def _hunt_one(candidate, others=()):
    """A hunt where every candidate's sources are treated as opened."""
    urls = list(candidate["sources"]) + [u for o in others for u in o["sources"]]
    return hunt(client=StubClient(FakeResponse(
        consulted=urls,
        body={"winner": candidate, "also_considered": list(others)})))


def test_domain_is_reported_without_www():
    assert domain_of("https://www.thehindu.com/news/story.ece") == "thehindu.com"
    assert domain_of("") == ""


def test_urls_match_across_the_shapes_the_api_returns():
    """
    Inline citations carry a tracking parameter the raw source list does not, and
    trailing slashes and `www.` differ freely. Comparing raw strings would report
    every real candidate as fabricated.
    """
    canonical = normalise_url("https://thehindu.com/a")
    assert normalise_url("https://www.thehindu.com/a/") == canonical
    assert normalise_url("https://thehindu.com/a?utm_source=openai") == canonical
    assert normalise_url("https://thehindu.com/b") != canonical


def test_candidate_citing_an_unopened_url_is_dropped():
    consulted = {"https://www.thehindu.com/a", "https://en.wikipedia.org/wiki/B"}
    kept = ground_candidates(
        [{"title": "grounded", "sources": ["https://www.thehindu.com/a"]},
         {"title": "invented", "sources": ["https://www.thehindu.com/never-opened"]}],
        consulted)

    assert [c["title"] for c in kept] == ["grounded"]


def test_ungrounded_urls_are_stripped_from_a_surviving_candidate():
    kept = ground_candidates(
        [{"title": "half real",
          "sources": ["https://en.wikipedia.org/wiki/B", "https://fake.example.com/x"]}],
        {"https://en.wikipedia.org/wiki/B"})

    assert kept[0]["sources"] == ["https://en.wikipedia.org/wiki/B"]


def test_a_fabricated_citation_never_reaches_the_corpus():
    """End to end: the winner survives a cosmetic URL difference, the fake does not."""
    response = FakeResponse(
        consulted=["https://thehindu.com/a"],
        body={"winner": _candidate("real", ["https://www.thehindu.com/a/?utm_source=openai"]),
              "also_considered": [_candidate("fake", ["https://invented.example/x"])]})

    result = hunt(client=StubClient(response))

    assert result["winner"]["title"] == "real"
    assert result["also_considered"] == []


def test_a_winner_below_the_engine_floor_is_refused():
    """A high total on a mechanism that stops early is a film with good marks."""
    response = FakeResponse(
        consulted=["https://thehindu.com/a"],
        body={"winner": _candidate("weak engine", ["https://thehindu.com/a"],
                                   total=44, engine=MIN_ENGINE_LONGEVITY - 1),
              "also_considered": []})

    with pytest.raises(RuntimeError, match="engine longevity"):
        hunt(client=StubClient(response))


def test_a_blocked_winner_is_refused_before_the_corpus_is_frozen():
    response = FakeResponse(
        consulted=["https://thehindu.com/a"],
        body={"winner": _candidate("blocked", ["https://thehindu.com/a"],
                                   clearance="blocked"),
              "also_considered": []})

    with pytest.raises(RuntimeError, match="blocked"):
        hunt(client=StubClient(response))


def test_an_empty_source_list_is_not_reported_as_mass_fabrication():
    """
    If the harness returns no consulted URLs, grounding cannot run. Dropping every
    candidate would look identical to the model inventing all of them.
    """
    response = FakeResponse(
        consulted=[],
        body={"winner": _candidate("real", ["https://thehindu.com/a"]),
              "also_considered": []})

    with pytest.raises(RuntimeError, match="grounding cannot run"):
        hunt(client=StubClient(response))


def test_below_threshold_also_rans_are_dropped():
    response = FakeResponse(
        consulted=["https://thehindu.com/a", "https://thehindu.com/b"],
        body={"winner": _candidate("winner", ["https://thehindu.com/a"]),
              "also_considered": [_candidate("thin", ["https://thehindu.com/b"],
                                             total=MIN_TOTAL - 1)]})

    assert hunt(client=StubClient(response))["also_considered"] == []


def test_a_weak_winner_is_kept_loudly_rather_than_emptying_the_corpus(capsys):
    """
    The floors are deliberately not equal. A total below the line is a taste
    judgement on a multi-minute paid call, and an editor reading a mediocre winner
    learns more than one reading a failed command against an empty corpus — so it
    survives, but nobody gets to miss it.
    """
    result = _hunt_one(_candidate("thin winner", ["https://thehindu.com/a"],
                                  total=MIN_TOTAL - 5))

    assert result["winner"]["title"] == "thin winner"
    assert f"below the {MIN_TOTAL} floor" in capsys.readouterr().err


def test_the_total_is_recomputed_from_the_sub_scores(capsys):
    """`total` is a number the model typed beside five others it typed."""
    lying = _candidate("bad arithmetic", ["https://thehindu.com/a"], total=45)
    lying["scores"]["total"] = 50

    result = _hunt_one(lying)

    assert result["winner"]["scores"]["total"] == 45
    assert "sub-scores sum to 45" in capsys.readouterr().err


def test_an_inflated_total_cannot_buy_a_place_on_the_queue():
    """Sub-scores summing to 30 under a claimed 45 clear a floor they failed."""
    inflated = _candidate("inflated", ["https://thehindu.com/b"], total=30, engine=8)
    inflated["scores"]["total"] = MIN_TOTAL + 7

    result = _hunt_one(_candidate("winner", ["https://thehindu.com/a"]), [inflated])

    assert result["also_considered"] == []


def test_out_of_range_sub_scores_are_clamped(capsys):
    """Strict mode drops `minimum`/`maximum`, so a 47 on one axis is legal JSON."""
    wild = _candidate("out of range", ["https://thehindu.com/a"])
    wild["scores"]["cast_depth"] = 47
    wild["scores"]["conflict"] = -3

    scores = _hunt_one(wild)["winner"]["scores"]

    assert (scores["cast_depth"], scores["conflict"]) == (SCORE_MAX, 0)
    assert scores["total"] == sum(scores[f] for f in SCORE_FIELDS)
    assert f"outside 0-{SCORE_MAX}" in capsys.readouterr().err


def test_every_candidate_has_to_say_why_it_lost():
    """
    After the title, `why_not` is the most-read line on the queue screen. Strict
    mode requires every property, so the winner answers it too — as the case
    against itself.
    """
    assert "why_not" in _CANDIDATE["properties"]
    assert set(_CANDIDATE["required"]) == set(_CANDIDATE["properties"])
    assert "why_not" in load_prompt()


def test_the_brief_asks_for_a_queue_not_a_shortlist():
    """`minItems` is unavailable in strict mode, so the count lives in the brief."""
    assert MIN_ALSO_CONSIDERED >= 8
    brief = BRIEF.format(min_total=MIN_TOTAL, min_others=MIN_ALSO_CONSIDERED)
    assert str(MIN_ALSO_CONSIDERED) in brief


def test_a_short_queue_is_reported(capsys):
    _hunt_one(_candidate("winner", ["https://thehindu.com/a"]))

    assert "thin hunt" in capsys.readouterr().err


def test_a_blocked_also_ran_reaches_the_corpus():
    """
    The demo turns on an editor visibly refusing something on legal grounds. A
    blocked candidate the scout swallowed is indistinguishable from a hunt that
    found nothing worth refusing.
    """
    refused = _candidate("refused", ["https://thehindu.com/b"], clearance="blocked")

    result = _hunt_one(_candidate("winner", ["https://thehindu.com/a"]), [refused])

    assert [(c["title"], c["clearance"]["status"])
            for c in result["also_considered"]] == [("refused", "blocked")]


def test_the_absolute_exclusions_never_come_back_even_as_blocked_rows():
    """
    Blocking is on-the-record refusal; the content exclusions are not refusals at
    all. Minors and identifiable victims of sexual crime must not surface in any
    form, including as a blocked row with reasons attached.
    """
    dropped, blocked = load_prompt().split("### Return as `blocked`", 1)

    assert "identifiable victims of sexual crime" in dropped
    assert "sexual crime" not in blocked
