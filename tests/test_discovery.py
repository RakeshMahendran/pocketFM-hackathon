"""
Four guarantees this stage makes, and the ways they actually break.

Coverage: the hunt is one call per category, because a single call given eight
categories spent six web searches on them and came back with famous Western
cases. Eight calls cannot cover six categories, and a call whose schema pins one
category cannot answer with another.

Grounding: a candidate citing a page the model never opened must not reach the
corpus. The demo puts source links on screen and everything downstream treats a
corpus item as sourced.

Scores: every number the thresholds read is written by the model being judged.
`total` is derived here instead, and the 0-10 band strict mode cannot express is
enforced here too. Selection across categories reads the derived totals for the
same reason.

Thresholds: the winner is the one candidate taken on the model's say-so and then
expanded into a whole season, so the floors have to be re-checked in code — and
which of them refuse outright is a decision, not an accident.
"""

import json

import pytest

from src.discovery.run import drop_winner_duplicates
from src.discovery.search import (domain_of, ground_candidates, hunt,
                                  load_prompt, normalise_url, BRIEF,
                                  CATEGORIES, MAX_TOOL_CALLS,
                                  MIN_ALSO_CONSIDERED, MIN_PER_CATEGORY,
                                  MIN_SEARCHES_PER_CATEGORY, MIN_TOTAL,
                                  MIN_ENGINE_LONGEVITY, SCORE_FIELDS,
                                  SCORE_MAX, SEARCH_REGION, _CANDIDATE)


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


def requested_category(kwargs):
    """
    Which category a call is hunting, read off the narrowed schema rather than
    the prompt text — the system prompt names all eight, so the enum is the only
    part of the request that says which one this call is for.
    """
    schema = kwargs["text"]["format"]["schema"]
    return schema["properties"]["winner"]["properties"]["category"]["enum"][0]


class StubClient:
    """
    Stands in for the Responses API.

    A single response answers every call, which is all a one-category hunt needs.
    `by_category` answers per category: the sweep sends eight different requests,
    and one body returned to all of them would manufacture eight copies of the
    same event. An Exception as a value is raised instead of returned, which is
    how a category failing mid-sweep is simulated.
    """

    def __init__(self, response=None, by_category=None):
        self.responses = self
        self._response = response
        self._by_category = by_category
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._by_category is None:
            return self._response
        answer = self._by_category[requested_category(kwargs)]
        if isinstance(answer, Exception):
            raise answer
        return answer


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


def _response(pick, others=()):
    """One category's answer, with every cited URL treated as opened."""
    urls = list(pick["sources"]) + [u for o in others for u in o["sources"]]
    return FakeResponse(consulted=urls,
                        body={"winner": pick, "also_considered": list(others)})


def _found_nothing():
    """
    A category that came back with nothing usable: its pick cites a page it never
    opened, so grounding drops it and no also-ran survives either.
    """
    return FakeResponse(
        consulted=["https://thehindu.com/opened"],
        body={"winner": _candidate("unusable", ["https://example.invalid/never-opened"]),
              "also_considered": []})


def _sweep(found):
    """
    A full eight-call sweep. `found` names the categories a test cares about;
    every other category returns nothing, so a test describes only its own
    subject.
    """
    return StubClient(by_category=dict({c: _found_nothing() for c in CATEGORIES},
                                       **found))


def _hunt_one(candidate, others=(), category="REVENGE"):
    """A one-category hunt. `categories` is why a test needs one stub, not eight."""
    return hunt(client=StubClient(_response(candidate, others)),
                categories=[category])


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

    result = hunt(client=StubClient(response), categories=["REVENGE"])

    assert result["winner"]["title"] == "real"
    assert result["also_considered"] == []


def test_a_winner_below_the_engine_floor_is_refused():
    """A high total on a mechanism that stops early is a film with good marks."""
    response = _response(_candidate("weak engine", ["https://thehindu.com/a"],
                                    total=44, engine=MIN_ENGINE_LONGEVITY - 1))

    with pytest.raises(RuntimeError, match="engine longevity"):
        hunt(client=StubClient(response), categories=["REVENGE"])


def test_a_blocked_winner_is_refused_before_the_corpus_is_frozen():
    response = _response(_candidate("blocked", ["https://thehindu.com/a"],
                                    clearance="blocked"))

    with pytest.raises(RuntimeError, match="blocked"):
        hunt(client=StubClient(response), categories=["REVENGE"])


def test_an_empty_source_list_is_not_reported_as_mass_fabrication():
    """
    If the harness returns no consulted URLs, grounding cannot run. Dropping every
    candidate would look identical to the model inventing all of them — so the
    specific failure is re-raised out of the sweep rather than summarised as
    "this category found nothing".
    """
    response = FakeResponse(
        consulted=[],
        body={"winner": _candidate("real", ["https://thehindu.com/a"]),
              "also_considered": []})

    with pytest.raises(RuntimeError, match="grounding cannot run"):
        hunt(client=StubClient(response), categories=["REVENGE"])


def test_below_threshold_also_rans_are_dropped():
    result = _hunt_one(_candidate("winner", ["https://thehindu.com/a"]),
                       [_candidate("thin", ["https://thehindu.com/b"],
                                   total=MIN_TOTAL - 1)])

    assert result["also_considered"] == []


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
    """
    `minItems` is unavailable in strict mode, so the count lives in the brief.
    Per category the ask is small; across eight calls it compounds past the
    aggregate floor an editor needs to reject most of a screen from.
    """
    assert MIN_ALSO_CONSIDERED >= 8
    assert len(CATEGORIES) * (1 + MIN_PER_CATEGORY) - 1 >= MIN_ALSO_CONSIDERED

    brief = BRIEF.format(category="REVENGE", min_total=MIN_TOTAL,
                         min_others=MIN_PER_CATEGORY,
                         min_searches=MIN_SEARCHES_PER_CATEGORY)
    assert str(MIN_PER_CATEGORY) in brief
    assert "REVENGE" in brief


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


# ---------------------------------------------------------------------------
# One call per category
#
# The cached single-sweep run made six web searches for eight categories, left
# THE BARGAIN COMES DUE unrepresented, and filled the rest with Tichborne,
# Piltdown, Poyais and Cassie Chadwick. There is no floor on tool calls to raise,
# so the only lever is the number of calls.
# ---------------------------------------------------------------------------


def test_every_category_is_hunted_in_its_own_call():
    client = _sweep({"REVENGE": _response(_candidate("found", ["https://thehindu.com/a"]))})

    hunt(client=client)

    assert sorted(requested_category(k) for k in client.calls) == sorted(CATEGORIES)


def test_the_schema_pins_the_category_a_call_may_answer_with():
    """
    A brief asking for one category is advice; a one-value enum is enforcement.
    The template it is derived from must survive untouched — a shallow copy would
    leave the seventh call pinned to whatever the sixth asked for.
    """
    client = _sweep({"REVENGE": _response(_candidate("found", ["https://thehindu.com/a"]))})

    hunt(client=client)

    for kwargs in client.calls:
        schema = kwargs["text"]["format"]["schema"]
        expected = [requested_category(kwargs)]
        assert schema["properties"]["also_considered"]["items"]["properties"]["category"]["enum"] == expected
    assert _CANDIDATE["properties"]["category"]["enum"] == CATEGORIES


def test_a_candidate_is_filed_under_the_call_that_found_it(capsys):
    """
    The coverage line is only worth reading if the category on a candidate says
    where it was found rather than what the model typed.
    """
    misfiled = _candidate("misfiled", ["https://thehindu.com/a"])
    misfiled["category"] = "SECRET STATUS"

    result = _hunt_one(misfiled, category="REVENGE")

    assert result["winner"]["category"] == "REVENGE"
    assert "came back as SECRET STATUS" in capsys.readouterr().err


def test_a_failed_category_does_not_cost_the_other_seven(capsys):
    """
    Eight calls is eight times the network surface. One timeout must not throw
    away seven paid searches that succeeded.
    """
    client = _sweep({"REVENGE": _response(_candidate("survivor", ["https://thehindu.com/a"])),
                     "SECRET STATUS": RuntimeError("gateway timeout")})

    result = hunt(client=client)

    assert result["winner"]["title"] == "survivor"
    assert "SECRET STATUS: hunt failed" in capsys.readouterr().err


def test_a_category_that_found_nothing_is_named(capsys):
    """
    The failure the split exists to fix: a category that contributes nothing used
    to be indistinguishable from one that was never hunted.
    """
    hunt(client=_sweep({"REVENGE": _response(_candidate("found", ["https://thehindu.com/a"]))}))

    err = capsys.readouterr().err
    assert "no candidate cleared the floor in" in err
    assert "THE BARGAIN COMES DUE" in err


def test_the_winner_is_the_best_of_the_category_winners():
    """
    No single call sees the whole field any more, so the cross-category choice is
    made here — on the derived totals, which is the only version of a score this
    module believes.
    """
    client = _sweep({
        "REVENGE": _response(_candidate("good", ["https://thehindu.com/a"], total=40)),
        "FAMILY BETRAYAL": _response(_candidate("better", ["https://thehindu.com/b"], total=47)),
    })

    result = hunt(client=client)

    assert result["winner"]["title"] == "better"
    assert "good" in [c["title"] for c in result["also_considered"]]


def test_a_category_winner_below_the_engine_floor_loses_to_one_that_qualifies():
    """
    With one sweep this raised outright, because the sweep's only winner was the
    one under test. With eight, a disqualified pick is just not the pick.
    """
    client = _sweep({
        "REVENGE": _response(_candidate("stops early", ["https://thehindu.com/a"],
                                        total=49, engine=MIN_ENGINE_LONGEVITY - 1)),
        "FAMILY BETRAYAL": _response(_candidate("runs on", ["https://thehindu.com/b"],
                                                total=40, engine=9)),
    })

    assert hunt(client=client)["winner"]["title"] == "runs on"


def test_a_category_pick_beats_a_higher_scoring_also_ran():
    """
    hunter.md tells the scout not to pick mechanically inside its category, so a
    pick that scored lower than the also-ran beside it was a judgement. Ranking
    the merged pool flat would silently overrule eight of those judgements.
    """
    client = _sweep({"REVENGE": _response(
        _candidate("the pick", ["https://thehindu.com/a"], total=40),
        [_candidate("scored higher", ["https://thehindu.com/b"], total=49)])})

    assert hunt(client=client)["winner"]["title"] == "the pick"


def test_the_search_originates_where_the_audience_is():
    """
    The web_search tool defaults to `country: "US"` and the cached run inherited
    it — every candidate it returned was American or European.
    """
    client = _sweep({"REVENGE": _response(_candidate("found", ["https://thehindu.com/a"]))})

    hunt(client=client)

    assert all(k["tools"][0]["user_location"]["country"] == SEARCH_REGION
               for k in client.calls)
    assert SEARCH_REGION == "IN"


def test_the_search_budget_is_floored_in_the_brief_and_capped_in_the_request():
    """
    `max_tool_calls` was null on the cached run and the model simply chose to
    search six times. There is no minimum to set, so the floor is asked for and
    the ceiling is enforced.
    """
    client = _sweep({"REVENGE": _response(_candidate("found", ["https://thehindu.com/a"]))})

    hunt(client=client)

    assert all(k["max_tool_calls"] == MAX_TOOL_CALLS for k in client.calls)
    assert MIN_SEARCHES_PER_CATEGORY * len(CATEGORIES) > 6
    assert str(MIN_SEARCHES_PER_CATEGORY) in BRIEF.format(
        category="REVENGE", min_total=MIN_TOTAL, min_others=MIN_PER_CATEGORY,
        min_searches=MIN_SEARCHES_PER_CATEGORY)


def test_a_candidate_sourced_only_to_encyclopedias_is_reported(capsys):
    """
    Reported, never dropped. Grading a candidate by where it came from is the
    `tier` field this codebase retired, and an obscure case can still have one
    encyclopedia stub — but a hunt whose sources are all Wikipedia is the exact
    regression that produced Tichborne and Piltdown.
    """
    _hunt_one(_candidate("famous", ["https://en.wikipedia.org/wiki/Tichborne_case"]))

    assert "drifted toward famous cases" in capsys.readouterr().err


def test_a_locally_sourced_candidate_is_not_reported(capsys):
    _hunt_one(_candidate("obscure", ["https://thehindu.com/district/story.ece"]))

    assert "drifted toward famous cases" not in capsys.readouterr().err


def test_the_prompt_states_who_is_listening():
    """
    Four seasons hand-written before this ran were all small Indian local events.
    The single-sweep prompt mentioned India only in a defamation footnote, and
    returned nothing set there.
    """
    audience = load_prompt().split("## The eight categories", 1)[0]

    assert "Indian" in audience
    assert "South Asia" in audience


def test_the_prompt_gives_a_checkable_anti_fame_test():
    """
    "Search for mechanism" is a direction and did not bind — the cached run
    searched `site:britannica.com` for famous impostors. A test the scout can
    actually apply to a candidate in front of it does.
    """
    prompt = load_prompt()

    assert "recognition test" in prompt.lower()
    assert "site:britannica.com" in prompt
    assert "Never run these searches" in prompt


def test_an_also_ran_that_is_the_winner_again_is_dropped(capsys):
    """
    Eight independent calls over categories that overlap by design will find one
    event twice. `dedupe()` never sees the winner — it keeps the longest-text
    cluster member and could swap the chosen event out — so the winner's own
    duplicates are removed after clustering instead.
    """
    winner = {"title": "The Cooperative Bank That Never Held Deposits"}
    clustered = [
        {"title": "The Cooperative Bank That Held No Deposits At All",
         "category": "THE LONG DECEPTION"},
        {"title": "A Sarpanch Declared Dead By His Own Brother",
         "category": "FAMILY BETRAYAL"},
    ]

    kept = drop_winner_duplicates(winner, clustered)

    assert [c["title"] for c in kept] == ["A Sarpanch Declared Dead By His Own Brother"]
    assert "the winner again" in capsys.readouterr().err
