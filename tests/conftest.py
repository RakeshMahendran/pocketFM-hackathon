"""
Keep the suite out of `data/cache/`.

That directory is committed deliberately — `DELIVERY_PLAN.md` §8 calls it the
demo kill switch, and a cache that only exists on one laptop is not one. So a
test run writing stub responses into it puts junk in the repo, and worse, puts
junk in the thing the demo replays from.
"""

import pytest

from src.discovery import cache
from src.generation import client


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "lakebase: integration test needing a reachable Lakebase instance",
    )


@pytest.fixture(autouse=True)
def cache_to_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE", tmp_path / "cache")
    # `client.CALLS` is the replay cache, resolved from `src.util.CACHE` at import
    # time, so patching the discovery module alone never reached it. Left unpatched
    # it does worse than pollute: a stub response cached under a real key makes the
    # next demo replay return the stub, and the run looks like it worked.
    monkeypatch.setattr(client, "CALLS", tmp_path / "cache" / "calls")
