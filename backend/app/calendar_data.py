"""캘린더 탭용 일정 데이터.

지금은 FOMC 하나뿐이지만, 나중에 국채 입찰·경제지표 발표 같은 다른 소스가
추가될 걸 감안해서 이벤트 하나하나에 category를 붙여 둔다 — 프론트는
카테고리별로 분기하지 않고 그냥 리스트를 통째로 받아 날짜순으로 뿌린다.

새 소스를 추가할 때는:
  1) 지금처럼 하드코딩 리스트를 만들거나, 실제 API를 호출하는 함수를 만들고
  2) all_events()에서 리스트를 합쳐서 반환하기만 하면 된다.
프론트 쪽 코드는 건드릴 필요 없다 — 이게 이번에 확보해 두는 확장 지점이다.

FOMC_2026 출처: federalreserve.gov/monetarypolicy/fomccalendars.htm
연준이 이후 일정을 변경하면 이 표도 같이 갱신해야 한다.
"""

from __future__ import annotations

FOMC_2026: list[dict] = [
    {
        "id": "fomc-2026-01",
        "category": "fomc",
        "title": "FOMC 정례회의",
        "date_start": "2026-01-27",
        "date_end": "2026-01-28",
        "note": None,
    },
    {
        "id": "fomc-2026-02",
        "category": "fomc",
        "title": "FOMC 정례회의",
        "date_start": "2026-03-17",
        "date_end": "2026-03-18",
        "note": "경제전망요약(SEP) 포함",
    },
    {
        "id": "fomc-2026-03",
        "category": "fomc",
        "title": "FOMC 정례회의",
        "date_start": "2026-04-28",
        "date_end": "2026-04-29",
        "note": None,
    },
    {
        "id": "fomc-2026-04",
        "category": "fomc",
        "title": "FOMC 정례회의",
        "date_start": "2026-06-16",
        "date_end": "2026-06-17",
        "note": "경제전망요약(SEP) 포함",
    },
    {
        "id": "fomc-2026-05",
        "category": "fomc",
        "title": "FOMC 정례회의",
        "date_start": "2026-07-28",
        "date_end": "2026-07-29",
        "note": None,
    },
    {
        "id": "fomc-2026-06",
        "category": "fomc",
        "title": "FOMC 정례회의",
        "date_start": "2026-09-15",
        "date_end": "2026-09-16",
        "note": "경제전망요약(SEP) 포함",
    },
    {
        "id": "fomc-2026-07",
        "category": "fomc",
        "title": "FOMC 정례회의",
        "date_start": "2026-10-27",
        "date_end": "2026-10-28",
        "note": None,
    },
    {
        "id": "fomc-2026-08",
        "category": "fomc",
        "title": "FOMC 정례회의",
        "date_start": "2026-12-08",
        "date_end": "2026-12-09",
        "note": "경제전망요약(SEP) 포함",
    },
]


def all_events() -> list[dict]:
    """카테고리 상관없이 전부 합쳐서 날짜순으로 반환한다."""
    events = [*FOMC_2026]
    events.sort(key=lambda e: e["date_start"])
    return events
