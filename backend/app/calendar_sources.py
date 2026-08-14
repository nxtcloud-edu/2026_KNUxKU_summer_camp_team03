"""캘린더 탭 — 실시간 API 소스 3개.

evidence_finder.py와 똑같은 원칙:
  - 외부 API는 실패해도 캘린더 전체를 죽이지 않는다. 키가 없거나
    호출이 실패하면 조용히 빈 리스트를 반환한다.
  - 30분 인메모리 캐시로 호출 횟수를 아낀다 (evidence_finder.py의
    _cache 패턴 그대로 재사용).

.env:
  FINNHUB_API_KEY=...  (finnhub.io — 실적발표 캘린더)
  FRED_API_KEY=...     (fred.stlouisfed.org — 경제지표 발표일)
  Treasury Fiscal Data는 키가 필요 없다.

FRED release_id는 절대 추측해서 넣지 않는다 — fred.stlouisfed.org의 각
release 페이지(release?rid=N)로 이름을 확인해서 확정한 값이다 (2026-08
기준):
  10 Consumer Price Index
  50 Employment Situation
  53 Gross Domestic Product
  54 Personal Income and Outlays
  91 Surveys of Consumers (University of Michigan)
"""

from __future__ import annotations

import os
import time
from datetime import date, timedelta

import requests

_CACHE_TTL_SEC = 1800
_TIMEOUT_SEC = 6
_cache: dict[str, tuple[float, list[dict]]] = {}


def _cached(key: str) -> list[dict] | None:
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < _CACHE_TTL_SEC:
        return hit[1]
    return None


def _store(key: str, rows: list[dict]) -> list[dict]:
    _cache[key] = (time.time(), rows)
    return rows


_FINNHUB_HOUR_LABEL = {"bmo": "장전", "amc": "장마감후", "dmh": "장중"}


def fetch_finnhub_earnings() -> list[dict]:
    """향후 14일 미국 실적발표. 키 없거나 실패하면 빈 리스트.

    심볼을 지정하지 않으면 미국 상장사 전체가 나와 하루에도 수백 건일 수
    있어, 14일 윈도우로만 개수를 자연스럽게 줄인다 — 그 이상의 필터링은
    이번 범위 밖.
    """
    key = os.environ.get("FINNHUB_API_KEY", "")
    if not key:
        return []
    today = date.today()
    ck = f"finnhub:{today.isoformat()}"
    if (hit := _cached(ck)) is not None:
        return hit
    try:
        resp = requests.get(
            "https://finnhub.io/api/v1/calendar/earnings",
            params={
                "from": today.isoformat(),
                "to": (today + timedelta(days=14)).isoformat(),
                "token": key,
            },
            timeout=_TIMEOUT_SEC,
        )
        resp.raise_for_status()
        rows = []
        for e in resp.json().get("earningsCalendar", []):
            symbol = e.get("symbol")
            d = e.get("date")
            if not symbol or not d:
                continue
            rows.append({
                "id": f"earnings-{symbol}-{d}",
                "category": "실적발표",
                "title": f"{symbol} 실적발표",
                "date_start": d,
                "date_end": d,
                "note": _FINNHUB_HOUR_LABEL.get(e.get("hour")),
            })
        return _store(ck, rows)
    except (requests.RequestException, ValueError) as exc:
        print(f"[calendar_sources] Finnhub earnings 실패(무시): {exc}", flush=True)
        return []


# fred.stlouisfed.org에서 release?rid=N 페이지로 이름을 확인해 확정한 값.
# 모듈 docstring 참고 — 추측으로 채운 값이 아니다.
_FRED_RELEASES = {
    10: "Consumer Price Index (CPI)",
    50: "Employment Situation",
    53: "Gross Domestic Product (GDP)",
    54: "Personal Income and Outlays (PCE)",
    91: "University of Michigan: Surveys of Consumers",
}


def fetch_fred_releases() -> list[dict]:
    """향후 3개월, 지정된 5개 release_id의 발표일. 키 없거나 실패하면 빈 리스트."""
    key = os.environ.get("FRED_API_KEY", "")
    if not key:
        return []
    today = date.today()
    horizon = today + timedelta(days=90)
    ck = f"fred:{today.isoformat()}"
    if (hit := _cached(ck)) is not None:
        return hit
    try:
        rows = []
        for release_id, title in _FRED_RELEASES.items():
            resp = requests.get(
                "https://api.stlouisfed.org/fred/release/dates",
                params={
                    "release_id": release_id,
                    "api_key": key,
                    "file_type": "json",
                    "realtime_start": today.isoformat(),
                    "realtime_end": horizon.isoformat(),
                    # 기본값은 이미 데이터가 나온 날짜만 준다 — 아직 안 나온
                    # "예정" 발표일까지 받으려면 이 플래그가 필요하다.
                    "include_release_dates_with_no_data": "true",
                    "sort_order": "asc",
                },
                timeout=_TIMEOUT_SEC,
            )
            resp.raise_for_status()
            for d in resp.json().get("release_dates", []):
                rows.append({
                    "id": f"fred-{release_id}-{d['date']}",
                    "category": "미국 경제지표",
                    "title": title,
                    "date_start": d["date"],
                    "date_end": d["date"],
                    "note": None,
                })
        return _store(ck, rows)
    except (requests.RequestException, ValueError, KeyError) as exc:
        print(f"[calendar_sources] FRED releases 실패(무시): {exc}", flush=True)
        return []


def fetch_treasury_auctions() -> list[dict]:
    """예정된 미국 국채 입찰. 키 불필요. 실패하면 빈 리스트.

    이 엔드포인트는 과거~미래 전체 레코드를 다 주므로(정렬만 가능,
    기본 필터 없음), filter=auction_date:gte:오늘로 미래분만 걸러 받는다.
    """
    today = date.today()
    ck = f"treasury:{today.isoformat()}"
    if (hit := _cached(ck)) is not None:
        return hit
    try:
        resp = requests.get(
            "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions",
            params={
                "sort": "auction_date",
                "filter": f"auction_date:gte:{today.isoformat()}",
            },
            timeout=_TIMEOUT_SEC,
        )
        resp.raise_for_status()
        rows = []
        for a in resp.json().get("data", []):
            d = a.get("auction_date")
            cusip = a.get("cusip")
            if not d or not cusip:
                continue
            sec_type = (a.get("security_type") or "").strip()
            sec_term = (a.get("security_term") or "").strip()
            issue_date = a.get("issue_date")
            rows.append({
                "id": f"treasury-{cusip}",
                "category": "국채 입찰",
                "title": f"{sec_type} {sec_term} 국채 입찰".strip(),
                "date_start": d,
                "date_end": d,
                "note": f"발행일 {issue_date}" if issue_date else None,
            })
        return _store(ck, rows)
    except (requests.RequestException, ValueError) as exc:
        print(f"[calendar_sources] Treasury auctions 실패(무시): {exc}", flush=True)
        return []


def all_api_events() -> list[dict]:
    """3개 소스를 합친다. 하나가 실패해도 나머지는 살아남는다 —
    각 fetch_* 함수 내부에서 이미 예외를 흡수하므로 여기선 그냥 합치기만."""
    return [*fetch_finnhub_earnings(), *fetch_fred_releases(), *fetch_treasury_auctions()]
