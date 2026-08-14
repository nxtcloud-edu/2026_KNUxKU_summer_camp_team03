"""캘린더 실시간 API 소스 테스트 — 호출이 실패해도 죽지 않고 빈 리스트를
반환하는지만 확인한다. 실제 API를 때리는 테스트는 만들지 않는다(키 없는
CI에서 깨짐).
"""

import requests

from app import calendar_sources


def _boom(*args, **kwargs):
    raise requests.RequestException("연결 실패(테스트)")


def test_fetch_finnhub_earnings_survives_request_failure(monkeypatch):
    monkeypatch.setenv("FINNHUB_API_KEY", "dummy")
    monkeypatch.setattr(calendar_sources.requests, "get", _boom)
    calendar_sources._cache.clear()
    assert calendar_sources.fetch_finnhub_earnings() == []


def test_fetch_fred_releases_survives_request_failure(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "dummy")
    monkeypatch.setattr(calendar_sources.requests, "get", _boom)
    calendar_sources._cache.clear()
    assert calendar_sources.fetch_fred_releases() == []


def test_fetch_treasury_auctions_survives_request_failure(monkeypatch):
    monkeypatch.setattr(calendar_sources.requests, "get", _boom)
    calendar_sources._cache.clear()
    assert calendar_sources.fetch_treasury_auctions() == []


def test_fetch_finnhub_earnings_without_key_returns_empty(monkeypatch):
    monkeypatch.delenv("FINNHUB_API_KEY", raising=False)
    calendar_sources._cache.clear()
    assert calendar_sources.fetch_finnhub_earnings() == []


def test_fetch_fred_releases_without_key_returns_empty(monkeypatch):
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    calendar_sources._cache.clear()
    assert calendar_sources.fetch_fred_releases() == []
