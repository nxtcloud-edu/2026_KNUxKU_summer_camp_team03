"""캘린더 탭 API 테스트 — 하드코딩된 일정 23개(FOMC 8 + 금통위 8 + 지수 리밸런싱 7)가
날짜순으로 다 나오는지만 확인한다.

Treasury Fiscal Data 소스는 키가 필요 없어 calendar_sources.all_api_events()가
실제 네트워크를 호출하는데, 그대로 두면 테스트가 그날그날의 실제 입찰
건수에 따라 흔들리고 CI가 네트워크에 의존하게 된다. 이 파일의 테스트는
하드코딩 데이터만 검증하는 게 목적이므로 all_api_events를 빈 리스트로
막아 둔다 — 실시간 API 자체의 동작은 test_calendar_sources.py가 맡는다.
"""

from fastapi.testclient import TestClient

from app import calendar_data
from app.main import app

client = TestClient(app)


def test_calendar_returns_all_events_sorted(monkeypatch):
    monkeypatch.setattr(calendar_data.calendar_sources, "all_api_events", lambda: [])
    res = client.get("/api/calendar")
    assert res.status_code == 200

    events = res.json()["events"]
    assert len(events) == 23

    for e in events:
        assert "id" in e
        assert "date_start" in e
        assert "category" in e

    dates = [e["date_start"] for e in events]
    assert dates == sorted(dates)


def test_calendar_covers_all_three_categories(monkeypatch):
    monkeypatch.setattr(calendar_data.calendar_sources, "all_api_events", lambda: [])
    res = client.get("/api/calendar")
    categories = {e["category"] for e in res.json()["events"]}
    assert categories == {"FOMC", "금통위", "지수 리밸런싱"}
