"""캘린더 탭용 일정 데이터.

지금은 FOMC·금통위·지수 리밸런싱 세 소스뿐이지만, 나중에 국채 입찰·경제지표
발표 같은 다른 소스가 추가될 걸 감안해서 이벤트 하나하나에 category를 붙여
둔다 — 프론트는 카테고리별로 분기하지 않고 그냥 리스트를 통째로 받아 날짜순
으로 뿌린다.

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
        "category": "FOMC",
        "title": "FOMC 정례회의",
        "date_start": "2026-01-27",
        "date_end": "2026-01-28",
        "note": None,
    },
    {
        "id": "fomc-2026-02",
        "category": "FOMC",
        "title": "FOMC 정례회의",
        "date_start": "2026-03-17",
        "date_end": "2026-03-18",
        "note": "경제전망요약(SEP) 포함",
    },
    {
        "id": "fomc-2026-03",
        "category": "FOMC",
        "title": "FOMC 정례회의",
        "date_start": "2026-04-28",
        "date_end": "2026-04-29",
        "note": None,
    },
    {
        "id": "fomc-2026-04",
        "category": "FOMC",
        "title": "FOMC 정례회의",
        "date_start": "2026-06-16",
        "date_end": "2026-06-17",
        "note": "경제전망요약(SEP) 포함",
    },
    {
        "id": "fomc-2026-05",
        "category": "FOMC",
        "title": "FOMC 정례회의",
        "date_start": "2026-07-28",
        "date_end": "2026-07-29",
        "note": None,
    },
    {
        "id": "fomc-2026-06",
        "category": "FOMC",
        "title": "FOMC 정례회의",
        "date_start": "2026-09-15",
        "date_end": "2026-09-16",
        "note": "경제전망요약(SEP) 포함",
    },
    {
        "id": "fomc-2026-07",
        "category": "FOMC",
        "title": "FOMC 정례회의",
        "date_start": "2026-10-27",
        "date_end": "2026-10-28",
        "note": None,
    },
    {
        "id": "fomc-2026-08",
        "category": "FOMC",
        "title": "FOMC 정례회의",
        "date_start": "2026-12-08",
        "date_end": "2026-12-09",
        "note": "경제전망요약(SEP) 포함",
    },
]

# 출처: 한국은행 통화정책방향 결정회의 일정 (언론 보도 교차 확인).
# 7/16 회의는 한국은행 보도자료 제목 "통화정책방향(2026.7.16)"으로 재확인됨.
# 한은이 이후 일정을 변경하면 이 표도 같이 갱신해야 한다.
BOK_MPC_2026: list[dict] = [
    {
        "id": "bok-mpc-2026-01",
        "category": "금통위",
        "title": "한국은행 금융통화위원회 통화정책방향 결정회의",
        "date_start": "2026-01-15",
        "date_end": "2026-01-15",
        "note": None,
    },
    {
        "id": "bok-mpc-2026-02",
        "category": "금통위",
        "title": "한국은행 금융통화위원회 통화정책방향 결정회의",
        "date_start": "2026-02-26",
        "date_end": "2026-02-26",
        "note": None,
    },
    {
        "id": "bok-mpc-2026-03",
        "category": "금통위",
        "title": "한국은행 금융통화위원회 통화정책방향 결정회의",
        "date_start": "2026-04-10",
        "date_end": "2026-04-10",
        "note": None,
    },
    {
        "id": "bok-mpc-2026-04",
        "category": "금통위",
        "title": "한국은행 금융통화위원회 통화정책방향 결정회의",
        "date_start": "2026-05-28",
        "date_end": "2026-05-28",
        "note": None,
    },
    {
        "id": "bok-mpc-2026-05",
        "category": "금통위",
        "title": "한국은행 금융통화위원회 통화정책방향 결정회의",
        "date_start": "2026-07-16",
        "date_end": "2026-07-16",
        "note": None,
    },
    {
        "id": "bok-mpc-2026-06",
        "category": "금통위",
        "title": "한국은행 금융통화위원회 통화정책방향 결정회의",
        "date_start": "2026-08-27",
        "date_end": "2026-08-27",
        "note": None,
    },
    {
        "id": "bok-mpc-2026-07",
        "category": "금통위",
        "title": "한국은행 금융통화위원회 통화정책방향 결정회의",
        "date_start": "2026-10-22",
        "date_end": "2026-10-22",
        "note": None,
    },
    {
        "id": "bok-mpc-2026-08",
        "category": "금통위",
        "title": "한국은행 금융통화위원회 통화정책방향 결정회의",
        "date_start": "2026-11-26",
        "date_end": "2026-11-26",
        "note": None,
    },
]

# S&P/Nasdaq 분기 리밸런싱, FTSE Russell 반기 리컨스티튜션, MSCI 11월 정기
# 리뷰. MSCI 2·5·8월 리뷰는 2026년 기준 날짜가 아직 공식 확정 전이라
# 넣지 않는다 — 확정되면 아래에 추가한다.
# TODO: MSCI 2026년 2월/5월/8월 정기 리뷰 — 공식 확정 후 추가
INDEX_REBALANCE_2026: list[dict] = [
    {
        "id": "idx-spdj-2026-q1",
        "category": "지수 리밸런싱",
        "title": "S&P 500 · Nasdaq-100 분기 리밸런싱",
        "date_start": "2026-03-23",
        "date_end": "2026-03-23",
        "note": "3/20(금) 종가 기준, 3/23(월) 반영",
    },
    {
        "id": "idx-spdj-2026-q2",
        "category": "지수 리밸런싱",
        "title": "S&P 500 · Nasdaq-100 분기 리밸런싱",
        "date_start": "2026-06-22",
        "date_end": "2026-06-22",
        "note": "6/19(금) 종가 기준, 6/22(월) 반영",
    },
    {
        "id": "idx-spdj-2026-q3",
        "category": "지수 리밸런싱",
        "title": "S&P 500 · Nasdaq-100 분기 리밸런싱",
        "date_start": "2026-09-21",
        "date_end": "2026-09-21",
        "note": "9/18(금) 종가 기준, 9/21(월) 반영",
    },
    {
        "id": "idx-spdj-2026-q4",
        "category": "지수 리밸런싱",
        "title": "S&P 500 · Nasdaq-100 분기 리밸런싱",
        "date_start": "2026-12-21",
        "date_end": "2026-12-21",
        "note": "12/18(금) 종가 기준, 12/21(월) 반영",
    },
    {
        "id": "idx-ftse-2026-h1",
        "category": "지수 리밸런싱",
        "title": "FTSE Russell Russell US Indexes 반기 리컨스티튜션",
        "date_start": "2026-06-26",
        "date_end": "2026-06-26",
        "note": "미 증시 마감 후 적용",
    },
    {
        "id": "idx-ftse-2026-h2",
        "category": "지수 리밸런싱",
        "title": "FTSE Russell Russell US Indexes 반기 리컨스티튜션",
        "date_start": "2026-12-11",
        "date_end": "2026-12-11",
        "note": "12월 둘째 금요일 마감 후 적용",
    },
    {
        "id": "idx-msci-2026-nov",
        "category": "지수 리밸런싱",
        "title": "MSCI 11월 정기 리뷰(Index Review)",
        "date_start": "2026-12-01",
        "date_end": "2026-12-01",
        "note": "공지일 2026-11-11, 발효 2026-12-01",
    },
]


def all_events() -> list[dict]:
    """카테고리 상관없이 전부 합쳐서 날짜순으로 반환한다."""
    events = [*FOMC_2026, *BOK_MPC_2026, *INDEX_REBALANCE_2026]
    events.sort(key=lambda e: e["date_start"])
    return events
