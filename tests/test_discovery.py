"""
Two guarantees this stage makes, and the ways they actually break.

Grounding: a candidate citing a page the model never opened must not reach the
corpus. The demo puts source links on screen and everything downstream treats a
corpus item as sourced.

Thresholds: the winner is the one candidate taken on the model's say-so and then
expanded into a whole season, so the floors have to be re-checked in code.
"""

import json

import pytest

from src.discovery.search import (domain_of, ground_candidates, hunt,
                                  normalise_url, MIN_TOTAL,
                                  MIN_ENGINE_LONGEVITY)


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
    return {"title": title, "sources": sources,
            "scores": {"total": total, "engine_longevity": engine},
            "clearance": {"status": clearance}}


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
