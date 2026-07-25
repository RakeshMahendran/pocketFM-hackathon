"""
A candidate citing a URL the model never opened must not survive. Search-sourced
corpora fail this way, the demo puts source links on screen, and everything
downstream treats a corpus item as sourced.
"""

from src.discovery.search import domain_of, ground_candidates


def test_domain_is_reported_without_www():
    assert domain_of("https://www.thehindu.com/news/story.ece") == "thehindu.com"
    assert domain_of("") == ""


def test_candidate_citing_an_unopened_url_is_dropped():
    consulted = {"https://www.thehindu.com/a", "https://en.wikipedia.org/wiki/B"}
    candidates = [
        {"title": "grounded", "sources": ["https://www.thehindu.com/a"]},
        {"title": "invented", "sources": ["https://www.thehindu.com/never-opened"]},
    ]

    kept = ground_candidates(candidates, consulted)

    assert [c["title"] for c in kept] == ["grounded"]


def test_ungrounded_urls_are_stripped_from_a_surviving_candidate():
    consulted = {"https://en.wikipedia.org/wiki/B"}
    candidates = [{
        "title": "half real",
        "sources": ["https://en.wikipedia.org/wiki/B", "https://fake.example.com/x"],
    }]

    kept = ground_candidates(candidates, consulted)

    assert kept[0]["sources"] == ["https://en.wikipedia.org/wiki/B"]
