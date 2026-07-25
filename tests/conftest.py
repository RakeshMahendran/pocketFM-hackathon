"""
Keep the suite out of `data/cache/`.

That directory is committed deliberately — `DELIVERY_PLAN.md` §8 calls it the
demo kill switch, and a cache that only exists on one laptop is not one. So a
test run writing stub responses into it puts junk in the repo, and worse, puts
junk in the thing the demo replays from.
"""

import pytest

from src.discovery import cache


@pytest.fixture(autouse=True)
def cache_to_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE", tmp_path / "cache")
