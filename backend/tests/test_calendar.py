"""캘린더 탭 API 테스트 — 하드코딩된 FOMC 8개가 날짜순으로 다 나오는지만 확인한다."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_calendar_returns_all_fomc_events_sorted():
    res = client.get("/api/calendar")
    assert res.status_code == 200

    events = res.json()["events"]
    assert len(events) == 8

    for e in events:
        assert "id" in e
        assert "date_start" in e
        assert "category" in e

    dates = [e["date_start"] for e in events]
    assert dates == sorted(dates)
