"""evidence_finder — 외부 지식 검색 에이전트 (코드, LLM 0회).

Supervisor가 "리포트만으로 부족하다"고 판단하면 호출된다.
NewsAPI(해외) + 네이버 뉴스 검색(국내)로 외부 근거를 긁어온다.

소스 라우팅 (질문 성격 → 어디서 가져오나):
  해외(연준·미국채·글로벌)  → NewsAPI /v2/everything
                              domains=reuters.com,bloomberg.com (API가 직접 필터)
  국내(금통위·국고채·가계부채) → 네이버 뉴스 검색 API
                              → 응답의 originallink를 화이트리스트로 코드 필터
                              (네이버는 언론사 지정 파라미터가 없어서 후처리 필수)

원칙:
  - 뉴스는 '보조' 근거다. 리포트(Chroma/시드)가 먼저고, 부족할 때만 붙인다.
  - description(요약)만 근거로 쓴다 — 본문은 페이월이라 링크만 제공.
  - 실패해도 죽지 않는다: 키 없음/쿼터 초과/타임아웃 → 빈 리스트.
  - NewsAPI 무료 티어 하루 100요청 → 30분 인메모리 캐시로 아낀다.

.env:
  NEWSAPI_KEY=...           (newsapi.org)
  NAVER_CLIENT_ID=...       (네이버 개발자센터 검색 API)
  NAVER_CLIENT_SECRET=...
"""

from __future__ import annotations

import os
import re
import time

import requests

NEWS_PARAMS = {
    "max_items": 3,        # 답변에 붙일 최대 뉴스 수
    "cache_ttl_sec": 1800,  # 30분 — NewsAPI 하루 100요청 절약
    "timeout_sec": 6,
}

# 국내 경제매체 화이트리스트 — originallink 도메인으로 필터
NAVER_WHITELIST = [
    "hankyung.com",   # 한국경제
    "mk.co.kr",       # 매일경제
    "sedaily.com",    # 서울경제
    "yna.co.kr",      # 연합뉴스
    "edaily.co.kr",   # 이데일리
]

# 해외/국내 이슈 판별 — triage 태그와 별개로 뉴스 소스만 고른다
_GLOBAL_PAT = re.compile(r"연준|미국|미국채|fed|fomc|글로벌|달러|파월|국제|해외|워시", re.I)
_DOMESTIC_PAT = re.compile(r"금통위|한은|한국은행|국고채|가계부채|국내|원화|한국")

_cache: dict[str, tuple[float, list[dict]]] = {}


def pick_region(text: str) -> str:
    """'global' | 'domestic' — 둘 다 걸리면 해외 우선(연준이 국내 금리도 흔든다)."""
    if _GLOBAL_PAT.search(text):
        return "global"
    if _DOMESTIC_PAT.search(text):
        return "domestic"
    return "domestic"  # 기본값: 국내 (사용자 눈높이 기준)


def _cached(key: str) -> list[dict] | None:
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < NEWS_PARAMS["cache_ttl_sec"]:
        return hit[1]
    return None


def _store(key: str, rows: list[dict]) -> list[dict]:
    _cache[key] = (time.time(), rows)
    return rows


def _from_newsapi(query: str) -> list[dict]:
    """해외 — Reuters/Bloomberg 한정. language=en만 안정적."""
    key = os.environ.get("NEWSAPI_KEY", "")
    if not key:
        return []
    ck = f"newsapi:{query}"
    if (hit := _cached(ck)) is not None:
        return hit
    try:
        resp = requests.get(
            "https://newsapi.org/v2/everything",
            params={
                "q": query,
                "domains": "reuters.com,bloomberg.com",
                "language": "en",
                "sortBy": "publishedAt",
                "pageSize": NEWS_PARAMS["max_items"],
                "apiKey": key,
            },
            timeout=NEWS_PARAMS["timeout_sec"],
        )
        resp.raise_for_status()
        rows = [{
            "source": (a.get("source") or {}).get("name", "Reuters/Bloomberg"),
            "title": a.get("title", ""),
            "description": a.get("description") or "",
            "url": a.get("url", ""),
            "published_at": (a.get("publishedAt") or "")[:10],
            "region": "global",
        } for a in resp.json().get("articles", [])]
        return _store(ck, rows)
    except (requests.RequestException, ValueError) as exc:
        print(f"[news_store] NewsAPI 실패(무시): {exc}")
        return []


def _domain_of(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/]+)", url or "")
    return m.group(1).lower() if m else ""


def _strip_tags(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s or "").replace("&quot;", '"').replace("&amp;", "&")


def _from_naver(query: str) -> list[dict]:
    """국내 — 네이버 뉴스 검색 후 originallink 화이트리스트 필터."""
    cid = os.environ.get("NAVER_CLIENT_ID", "")
    sec = os.environ.get("NAVER_CLIENT_SECRET", "")
    if not cid or not sec:
        return []
    ck = f"naver:{query}"
    if (hit := _cached(ck)) is not None:
        return hit
    try:
        resp = requests.get(
            "https://openapi.naver.com/v1/search/news.json",
            params={"query": query, "display": 20, "sort": "date"},
            headers={"X-Naver-Client-Id": cid, "X-Naver-Client-Secret": sec},
            timeout=NEWS_PARAMS["timeout_sec"],
        )
        resp.raise_for_status()
        rows = []
        for a in resp.json().get("items", []):
            origin = a.get("originallink") or a.get("link", "")
            domain = _domain_of(origin)
            if not any(w in domain for w in NAVER_WHITELIST):
                continue  # 블로그성 매체·재게시물은 버린다
            rows.append({
                "source": domain,
                "title": _strip_tags(a.get("title", "")),
                "description": _strip_tags(a.get("description", "")),
                "url": origin,
                "published_at": (a.get("pubDate") or "")[:16],
                "region": "domestic",
            })
            if len(rows) >= NEWS_PARAMS["max_items"]:
                break
        return _store(ck, rows)
    except (requests.RequestException, ValueError) as exc:
        print(f"[news_store] 네이버 뉴스 실패(무시): {exc}")
        return []


def search_news(query: str) -> list[dict]:
    """질문 성격에 맞는 소스에서 뉴스 검색. 키 없으면 조용히 빈 리스트."""
    region = pick_region(query)
    if region == "global":
        # NewsAPI는 영어만 안정적 — 한국어 질문이면 핵심 영문 키워드로 치환
        q = "federal reserve rates bonds" if re.search(r"[가-힣]", query) else query
        return _from_newsapi(q)
    return _from_naver(query)
