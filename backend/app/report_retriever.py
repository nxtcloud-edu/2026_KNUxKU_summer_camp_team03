"""report_retriever — 리포트 검색 에이전트 (코드, LLM 0회).

Supervisor가 "리포트 근거가 필요한 질문"이라고 판단하면 호출된다.
크로마(벡터) → Supabase → 로컬 시드 순으로 긁어온다.

데이터 소스는 3단 (위가 우선, 실패하면 아래로 폴백):
  1) Chroma (CHROMA_HOST 또는 CHROMA_PATH 설정 시) — DB 담당이 적재한
     벡터 컬렉션에서 의미 검색. evidence/decision형 질문에 사용.
  2) Supabase (SUPABASE_URL + SUPABASE_ANON_KEY 설정 시) — reports 테이블.
  3) 로컬 시드 (data/reports.json) — FE mock과 동일한 파일이라 리포트 ID가
     화면의 근거 카드와 그대로 맞는다. 전부 죽어도 데모는 산다.

Chroma 연결 (.env — 키 아님, 주소만):
  서버 모드:  CHROMA_HOST=localhost  CHROMA_PORT=8001
  파일 모드:  CHROMA_PATH=../db/chroma  (DB 담당의 persist 폴더 경로)
  공통:       CHROMA_COLLECTION=reports  (컬렉션 이름 — DB 담당과 합의)
연결 확인: python scripts/test_chroma.py

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
        print(f"[report_store] Supabase 조회 실패, 로컬 시드로 폴백: {exc}", flush=True)
        return None


def all_reports() -> list[dict]:
    return _from_supabase() or _load_seed()


# 인덱싱 스크립트(scripts/index_reports.py)와 반드시 같은 값을 써야 한다 —
# 컬렉션 생성 시 쓴 임베딩 함수와 다르면 쿼리 시 차원 불일치로 깨진다.
CHROMA_EMBEDDING_MODEL = os.environ.get(
    "CHROMA_EMBEDDING_MODEL", "paraphrase-multilingual-mpnet-base-v2"
)


# ── Chroma (벡터 검색) ────────────────────────────────────────
def _chroma_collection():
    """env가 없으면 None — Chroma는 선택 사항이다."""
    host = os.environ.get("CHROMA_HOST", "")
    path = os.environ.get("CHROMA_PATH", "")
    if not host and not path:
        return None
    import chromadb  # 지연 import — 미설치여도 다른 경로는 동작
    from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

    if host:
        client = chromadb.HttpClient(host=host, port=int(os.environ.get("CHROMA_PORT", "8001")))
    else:
        client = chromadb.PersistentClient(path=path)
    # get_collection()에 embedding_function을 명시하지 않으면 Chroma가 생성 시
    # 쓴 함수를 복원하지 않고 조용히 자체 기본값(384차원)으로 대체해버린다 —
    # 그러면 쿼리 시 차원 불일치로 예외가 나서 매번 키워드 검색 폴백으로 빠진다.
    ef = SentenceTransformerEmbeddingFunction(model_name=CHROMA_EMBEDDING_MODEL)
    return client.get_collection(os.environ.get("CHROMA_COLLECTION", "reports"), embedding_function=ef)


def _row_from_chroma(cid: str, doc: str, meta: dict) -> dict:
    """DB 담당의 메타데이터 필드명이 달라도 최대한 흡수한다.
    (정확한 필드명은 scripts/test_chroma.py로 확인 후 여기서 맞출 것)"""
    meta = meta or {}
    tags_v = meta.get("tags") or meta.get("asset_tags") or []
    if isinstance(tags_v, str):
        tags_v = [t.strip() for t in tags_v.split(",") if t.strip()]
    return {
        "id": meta.get("report_id") or meta.get("id") or cid,
        "title": meta.get("title", ""),
        "house": meta.get("house") or meta.get("publisher", ""),
        "date": meta.get("date") or meta.get("published_at", ""),
        "category": meta.get("category") or meta.get("board", ""),
        "tags": tags_v,
        "summary": [doc[:150]] if doc else [],
        "excerpt": doc or "",
        "published": True,
    }


def _search_chroma(query: str, top_k: int, seen_ids: set | None) -> list[dict] | None:
    """의미 검색. 실패/미설정이면 None → 키워드 검색으로 폴백."""
    try:
        col = _chroma_collection()
        if col is None:
            return None
        # seen 제외를 위해 여유 있게 뽑고 뒤에서 거른다
        res = col.query(query_texts=[query], n_results=min(top_k * 3, 20))
        rows = []
        for i, doc in enumerate(res["documents"][0]):
            row = _row_from_chroma(res["ids"][0][i], doc, res["metadatas"][0][i])
            if seen_ids and row["id"] in seen_ids:
                continue
            if row["id"] not in {r["id"] for r in rows}:  # 청크 중복 → 리포트 단위로
                rows.append(row)
            if len(rows) >= top_k:
                break
        return rows or None
    except Exception as exc:  # noqa: BLE001 — 검색은 절대 죽지 않는다
        print(f"[report_store] Chroma 검색 실패, 키워드 검색으로 폴백: {exc}", flush=True)
        return None


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


def search(turn_type: str, query: str, tags: list[str],
           seen_ids: set | None = None) -> list[dict]:
    """검색 계획(triage 출력) → 근거 리포트 목록. 0건이면 빈 리스트 —
    폴백 문구를 만드는 건 호출자(main)의 몫이다.

    seen_ids: 이 세션에서 이미 근거로 쓴 리포트. 신선한 후보가 충분하면
    제외하고, 부족하면 다시 포함한다 — 멀티턴에서 같은 답 반복 방지."""
    reports = all_reports()
    p = SEARCH_PARAMS
    if seen_ids:
        fresh = [r for r in reports if r["id"] not in seen_ids]
        # 신선한 후보가 top_k 이상 남아 있을 때만 제외 적용
        if len(fresh) >= p["top_k"]:
            reports = fresh

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

    # evidence형: Chroma가 있으면 의미 검색 우선
    chroma_rows = _search_chroma(query, p["top_k"], seen_ids)
    if chroma_rows:
        return chroma_rows

    # 없거나 실패 → 태그+키워드 스코어
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
