"""리포트 저장소 — 유일한 검색 진입점.

데이터 소스는 2단:
  1) Supabase (SUPABASE_URL + SUPABASE_ANON_KEY 설정 시) — reports 테이블을
     PostgREST로 조회한다. 네이버 리서치 4개 게시판 크롤 데이터가 여기 쌓인다.
  2) 로컬 시드 (data/reports.json) — FE mock과 동일한 파일이라 리포트 ID가
     화면의 근거 카드와 그대로 맞는다. Supabase가 없거나 죽어도 데모는 산다.

검색은 코드다: 태그 필터 + 키워드 스코어 + 최신순. LLM 없음.
시장정세형(market)은 게시판(debenture/economy/invest) 교차로 최신 리포트를
게시판별 per_board개씩 모은다 — "시장 정세를 생각한다"의 구현 지점.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import requests

# 숫자는 전부 여기 — ALLOCATION_PARAMS와 같은 원칙 (값 확정은 PM 승인)
SEARCH_PARAMS = {
    "top_k": 4,        # analysis LLM에 넘길 최대 리포트 수 (토큰 예산)
    "per_board": 2,    # 시장정세형: 게시판별 최신 몇 건
    "min_score": 1,    # evidence형: 이 미만이면 0건 취급 → 폴백
}

_SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "reports.json"
_seed_cache: list[dict] | None = None

_STOPWORDS = {"뭐야", "뭐예요", "어때", "어때요", "알려줘", "궁금해", "요즘", "지금",
              "하나요", "인가요", "왜", "그럼", "그리고", "후속", "질문"}


def _load_seed() -> list[dict]:
    global _seed_cache
    if _seed_cache is None:
        with open(_SEED_PATH, encoding="utf-8") as f:
            _seed_cache = [r for r in json.load(f) if r.get("published")]
    return _seed_cache


def _from_supabase() -> list[dict] | None:
    """Supabase reports 테이블 전체(발행분). 실패하면 None → 시드 폴백."""
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_ANON_KEY", "")
    if not url or not key:
        return None
    try:
        resp = requests.get(
            f"{url}/rest/v1/reports",
            params={"select": "*", "published": "eq.true",
                    "order": "date.desc", "limit": "300"},
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=5,
        )
        resp.raise_for_status()
        rows = resp.json()
        return rows if isinstance(rows, list) and rows else None
    except (requests.RequestException, ValueError) as exc:
        print(f"[report_store] Supabase 조회 실패, 로컬 시드로 폴백: {exc}")
        return None


def all_reports() -> list[dict]:
    return _from_supabase() or _load_seed()


def _keywords(query: str) -> list[str]:
    toks = re.findall(r"[가-힣A-Za-z]{2,}", query)
    return [t for t in toks if t not in _STOPWORDS][:8]


def _score(report: dict, keywords: list[str], tags: list[str]) -> int:
    text = f"{report.get('title','')} {' '.join(report.get('summary', []))} {report.get('excerpt','')}"
    s = 0
    for t in tags:
        if t in report.get("tags", []):
            s += 3  # 태그 일치가 키워드보다 강한 신호
    for k in keywords:
        if k in text:
            s += 1
    return s


def search(turn_type: str, query: str, tags: list[str]) -> list[dict]:
    """검색 계획(triage 출력) → 근거 리포트 목록. 0건이면 빈 리스트 —
    폴백 문구를 만드는 건 호출자(main)의 몫이다."""
    reports = all_reports()
    p = SEARCH_PARAMS

    if turn_type == "market":
        # 게시판 교차: 최신순으로 게시판별 per_board건
        picked: list[dict] = []
        for board in ("debenture", "economy", "invest"):
            rows = [r for r in reports if r.get("category") == board]
            if tags:  # 태그가 있으면 우선 필터, 부족하면 최신으로 채움
                tagged = [r for r in rows if set(tags) & set(r.get("tags", []))]
                rows = tagged or rows
            rows.sort(key=lambda r: r.get("date", ""), reverse=True)
            picked.extend(rows[: p["per_board"]])
        picked.sort(key=lambda r: r.get("date", ""), reverse=True)
        return picked[: p["top_k"]]

    # evidence형: 태그+키워드 스코어
    kws = _keywords(query)
    scored = [(r, _score(r, kws, tags)) for r in reports]
    scored = [(r, s) for r, s in scored if s >= p["min_score"]]
    scored.sort(key=lambda x: (x[1], x[0].get("date", "")), reverse=True)
    return [r for r, _ in scored[: p["top_k"]]]


def related_for_tags(tags: list[str], limit: int = 2) -> list[dict]:
    """개념형 답변 끝에 붙일 '오늘 관련 리포트' — 교육에서 근거로 연결."""
    if not tags:
        return []
    rows = [r for r in all_reports() if set(tags) & set(r.get("tags", []))]
    rows.sort(key=lambda r: r.get("date", ""), reverse=True)
    return rows[:limit]
