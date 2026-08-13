"""
네이버 리서치 수집기 — 목데이터를 실데이터로 바꾼다.

설계 근거
  · Slack 「금융 도메인」 수집 설계 — 메타데이터 추출 → 1차 키워드 필터 →
    태깅 보정 → 3줄 요약
  · 설계문서 v2 ERD — reports / report_chunks / publishers
  · RAG 청킹 최적화 글 — 재귀 분할(정확도 69%로 기본값), 청크 400~512토큰,
    오버랩 10~20%(약 50~64자), 청크에 문서 제목 prepend, 메타데이터에
    source·section·date·type·confidence 포함

실행
    python collector/collect.py                # 기본 3개 카테고리 2페이지씩
    python collector/collect.py --pages 4      # 더 많이
    python collector/collect.py --category debenture

만들어지는 것
    data/quill.db                     SQLite (육안 확인용 뷰어가 읽는다)
    frontend/src/data/reports.json    프런트가 쓰는 데이터

표준 라이브러리만 쓴다. pip install이 필요 없어야 팀원 누구나 바로 돌린다.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone

# 윈도우 콘솔이 CP949라 한글·기호 출력에서 죽는다. UTF-8로 고정한다
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

def load_env() -> None:
    """collector/.env 를 읽어 환경변수에 올린다.

    python-dotenv를 쓰지 않는 이유: 이 수집기는 표준 라이브러리만으로 돌아야
    팀원 누구나 pip install 없이 바로 실행할 수 있다.

    ⚠ 키는 여기(로컬/서버)에만 둔다. frontend/.env.local 로 옮기면
      빌드 결과물에 박혀 브라우저에 노출된다.
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip("'\"")
            if v and not os.environ.get(k):
                os.environ[k] = v


load_env()

BASE = "https://finance.naver.com/research"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "quill.db")
JSON_PATH = os.path.join(ROOT, "frontend", "src", "data", "reports.json")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"

# ── 카테고리 ────────────────────────────────────────────────
# 우리는 채권·ETF만 다룬다. 종목분석·산업분석은 애초에 긁지 않는다.
# 시황정보는 코스피 데일리가 대부분이라 우선순위를 낮췄다.
CATEGORIES = {
    "debenture": ("채권분석", "debenture_list", "debenture_read"),
    "economy": ("경제분석", "economy_list", "economy_read"),
    "invest": ("투자정보", "invest_list", "invest_read"),
    "market": ("시황정보", "market_info_list", "market_info_read"),
}
DEFAULT_CATEGORIES = ["debenture", "economy", "invest"]

# ── 1차 키워드 필터 ─────────────────────────────────────────
# Slack 설계 그대로: 제목이나 요약에 이 말이 없으면 그 자리에서 버린다.
# 양보다 질을 먼저 본다.
KEYWORDS = [
    "채권", "국채", "회사채", "통안채", "금리", "ETF", "etf",
    "듀레이션", "크레딧", "스프레드", "수익률", "국고채", "금통위",
    "기준금리", "인하", "인상", "연준", "FOMC", "자산배분", "펀드",
]

# ── 상품군 태그 ─────────────────────────────────────────────
# 실제 서비스에서는 LLM이 서론을 읽고 붙인다(태깅 보정 단계).
# 여기서는 규칙으로 붙이고 confidence를 낮게 준다 — 사람 검수 대상이 되도록.
TAG_RULES: list[tuple[str, list[str]]] = [
    ("채권-장기-국채", ["장기", "10년", "30년", "듀레이션", "국고채"]),
    ("채권-단기-국채", ["단기", "1년", "통안", "파킹", "단기물"]),
    ("채권-회사채", ["회사채", "크레딧", "신용", "스프레드", "AA", "BBB"]),
    ("ETF-패시브-지수", ["ETF", "패시브", "지수추종", "인덱스"]),
    ("ETF-액티브", ["액티브"]),
    ("금리", ["금리", "금통위", "기준금리", "연준", "FOMC", "인하", "인상"]),
    ("매크로", ["경제", "성장률", "물가", "CPI", "고용", "환율"]),
]

# ── 청킹 파라미터 ───────────────────────────────────────────
# 블로그 권고: 400~512토큰, 오버랩 10~20%(약 50~64자).
# 한국어는 토크나이저에서 글자당 토큰이 더 나온다. 대략 1자 = 1.3토큰으로 잡고
# 480토큰 ≈ 370자를 목표로 둔다. 오버랩은 권고 상한인 64자.
CHUNK_TARGET_CHARS = 370
CHUNK_MAX_CHARS = 560          # 이 이상은 자른다
CHUNK_OVERLAP_CHARS = 64
KO_TOKENS_PER_CHAR = 1.3
HARD_TOKEN_LIMIT = 2500        # context cliff 방지 — 초과 청크는 버린다


def est_tokens(text: str) -> int:
    return int(len(text) * KO_TOKENS_PER_CHAR)


# ── HTTP ────────────────────────────────────────────────────

def fetch(url: str, retries: int = 3) -> str:
    """네이버는 EUC-KR이다. 실패하면 UTF-8로 떨어뜨린다."""
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            raw = urllib.request.urlopen(req, timeout=20).read()
            try:
                return raw.decode("euc-kr")
            except UnicodeDecodeError:
                return raw.decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError) as e:
            if i == retries - 1:
                print(f"    ! 실패 {url} — {e}")
                return ""
            time.sleep(1.5 * (i + 1))
    return ""


def strip_tags(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


# ── 자료구조 ────────────────────────────────────────────────

@dataclass
class Report:
    source_nid: int
    source_category: str
    title: str
    publisher: str
    published_at: str          # YYYY-MM-DD
    pdf_url: str | None
    source_url: str
    body: str
    tags: list[str] = field(default_factory=list)
    summary: list[str] = field(default_factory=list)
    confidence: float = 0.0
    content_hash: str = ""


# ── 목록 파싱 ───────────────────────────────────────────────

def parse_list(page_html: str, cat_key: str, read_path: str) -> list[Report]:
    """목록 표에서 메타데이터를 발라낸다.
    열: 제목 | 증권사 | 첨부 | 작성일 | 조회수
    조회수는 일부러 가져오지 않는다 — 수집 시점 스냅샷일 뿐이고,
    '많이 본 것 = 좋은 것'이라는 판단을 끌어들이지 않기 위해서다.
    """
    out: list[Report] = []
    for tr in re.findall(r"<tr>(.*?)</tr>", page_html, re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(tds) < 4:
            continue

        link = re.search(rf'href="({read_path}\.naver\?nid=(\d+)[^"]*)"', tr)
        if not link:
            continue

        title = strip_tags(tds[0])
        publisher = strip_tags(tds[1])
        # 작성일은 YY.MM.DD 형태. 열 위치가 흔들려서 정규식으로 찾는다
        date_m = re.search(r"(\d{2})\.(\d{2})\.(\d{2})", strip_tags(" ".join(tds)))
        if not title or not publisher or not date_m:
            continue

        yy, mm, dd = date_m.groups()
        published_at = f"20{yy}-{mm}-{dd}"

        pdf_m = re.search(r'href="(https?://[^"]*\.pdf)"', tr)

        out.append(
            Report(
                source_nid=int(link.group(2)),
                source_category=cat_key,
                title=title,
                publisher=publisher,
                published_at=published_at,
                pdf_url=pdf_m.group(1) if pdf_m else None,
                source_url=f"{BASE}/{html.unescape(link.group(1))}",
                body="",
            )
        )
    return out


def fetch_body(rep: Report) -> str:
    """상세 페이지 본문. 목록에는 없고 여기에만 있다."""
    d = fetch(rep.source_url)
    if not d:
        return ""
    m = re.search(r'<div[^>]*class="[^"]*box_type_m[^"]*"[^>]*>(.*?)</div>\s*</div>', d, re.S)
    if not m:
        m = re.search(r'<div[^>]*class="[^"]*box_type_m[^"]*"[^>]*>(.*?)</table>', d, re.S)
    if not m:
        return ""

    text = strip_tags(m.group(1))
    # 머리말(제목·증권사·날짜·조회수)이 본문 앞에 붙어 온다
    text = re.sub(r"^.*?조회\s*\d+\s*", "", text)

    # 본문 뒤에 첨부파일명과 "다른 리포트 목록"이 딸려 온다.
    # 그대로 두면 청크에 남의 리포트 제목이 섞여 검색이 오염된다.
    for marker in [r"\S+\.pdf", r"[가-힣]+분석 리포트", r"[가-힣]+정보 리포트", r"전체보기"]:
        cut = re.search(marker, text)
        if cut:
            text = text[: cut.start()]
    return text.strip()


# ── 필터 · 태깅 · 요약 ──────────────────────────────────────

def passes_keyword_filter(rep: Report) -> bool:
    hay = f"{rep.title} {rep.body}"
    return any(k in hay for k in KEYWORDS)


# 네이버가 이미 분류해 둔 카테고리와 우리 태그가 일치하는가.
# 남의 분류를 근거로 쓰는 것이라 우리 규칙만으로 붙인 것보다 신뢰할 수 있다.
CATEGORY_EXPECT = {
    "debenture": "채권-",
    "economy": "금리",
    "invest": "ETF-",
}


def tag(rep: Report) -> tuple[list[str], float]:
    """규칙 기반 태깅. 실서비스에서는 LLM이 서론을 읽고 붙인다.

    신뢰도는 두 갈래로 준다.
      · 네이버 카테고리와 우리 태그가 맞물리면 0.8대 — 남의 분류가 뒷받침한다
      · 우리 규칙만으로 붙였으면 0.7 미만 — 사람 검수 큐로 보낸다
    이 경계(0.7)는 Slack 수집 설계에 적힌 값 그대로다."""
    hay = f"{rep.title} {rep.body}"
    tags = [t for t, words in TAG_RULES if any(w in hay for w in words)]
    if not tags:
        tags = ["매크로"]
    tags = tags[:4]

    expect = CATEGORY_EXPECT.get(rep.source_category)
    agrees = bool(expect) and any(t.startswith(expect) or t == expect for t in tags)

    if agrees:
        conf = min(0.92, 0.78 + 0.03 * len(tags))
    else:
        conf = min(0.68, 0.34 + 0.10 * len(tags))
    return tags, round(conf, 2)


def summarize(rep: Report) -> list[str]:
    """3줄 요약. 지금은 본문 앞쪽 문장을 그대로 쓴다.
    실서비스에서는 Analysis 에이전트가 눈높이에 맞춰 다시 쓴다."""
    body = rep.body or rep.title
    sents = [s.strip() for s in re.split(r"(?<=[.。!?])\s+|\n+", body) if len(s.strip()) > 15]
    return sents[:3] if sents else [rep.title]


# ── 청킹 ────────────────────────────────────────────────────

def recursive_split(text: str) -> list[str]:
    """재귀적 분할 — 블로그가 기본값으로 권한 방식(정확도 69%).
    문단 → 문장 → 길이 순으로 내려가며 자른다. 의미 단위를 먼저 지키고,
    끝까지 안 되면 그때 길이로 자른다."""
    if len(text) <= CHUNK_MAX_CHARS:
        return [text] if text.strip() else []

    for sep in ["\n\n", "\n", ". ", "다. ", " "]:
        parts = text.split(sep)
        if len(parts) < 2:
            continue

        chunks: list[str] = []
        buf = ""
        for p in parts:
            piece = p + sep
            if len(buf) + len(piece) > CHUNK_TARGET_CHARS and buf:
                chunks.append(buf.strip())
                # 오버랩 — 앞 청크 끝을 다음 청크 앞에 겹쳐 문맥이 끊기지 않게
                buf = buf[-CHUNK_OVERLAP_CHARS:] + piece
            else:
                buf += piece
        if buf.strip():
            chunks.append(buf.strip())

        if all(len(c) <= CHUNK_MAX_CHARS for c in chunks):
            return chunks

    # 어떤 구분자로도 안 되면 길이로 자른다
    step = CHUNK_TARGET_CHARS - CHUNK_OVERLAP_CHARS
    return [text[i : i + CHUNK_TARGET_CHARS] for i in range(0, len(text), step)]


def make_chunks(rep: Report) -> list[dict]:
    """청크마다 문서 제목을 앞에 붙인다(블로그 권고).
    청크만 떼어 놓고 보면 어느 리포트의 어느 대목인지 알 수 없어서,
    검색 품질이 눈에 띄게 떨어진다."""
    out = []
    for i, body in enumerate(recursive_split(rep.body)):
        prefixed = f"[{rep.publisher} · {rep.title}]\n{body}"
        tokens = est_tokens(prefixed)
        if tokens > HARD_TOKEN_LIMIT:
            continue  # context cliff 방지
        out.append(
            {
                "chunk_index": i,
                "chunk_text": prefixed,
                "char_len": len(prefixed),
                "est_tokens": tokens,
            }
        )
    return out


# ── DB ──────────────────────────────────────────────────────

SCHEMA = """
create table if not exists publishers (
  id             integer primary key autoincrement,
  name           text unique not null,
  report_count   integer not null default 0
);

create table if not exists reports (
  id              integer primary key autoincrement,
  source          text not null default 'naver',
  source_category text not null,
  source_nid      integer not null,
  source_url      text not null,
  title           text not null,
  publisher_id    integer references publishers(id),
  publisher       text not null,
  published_at    text not null,
  pdf_url         text,
  body            text,
  summary         text,          -- JSON 배열
  tags            text,          -- JSON 배열
  confidence      real,
  content_hash    text,
  published       integer not null default 0,   -- 검수 통과 여부
  collected_at    text not null,
  unique (source, source_nid)
);

create table if not exists report_chunks (
  id          integer primary key autoincrement,
  report_id   integer not null references reports(id) on delete cascade,
  chunk_index integer not null,
  chunk_text  text not null,
  char_len    integer not null,
  est_tokens  integer not null,
  embedding   blob,              -- 임베딩 모델이 붙으면 채운다
  unique (report_id, chunk_index)
);

create table if not exists collection_runs (
  id           integer primary key autoincrement,
  ran_at       text not null,
  categories   text not null,
  pages        integer not null,
  seen         integer not null,
  kept         integer not null,
  dropped_kw   integer not null,
  dropped_dup  integer not null,
  chunks       integer not null
);

create index if not exists reports_pub_idx on reports (published_at desc);
create index if not exists chunks_report_idx on report_chunks (report_id);
"""


def open_db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)
    return con


def save(con: sqlite3.Connection, reps: list[Report]) -> int:
    chunk_total = 0
    for r in reps:
        con.execute(
            "insert or ignore into publishers (name) values (?)", (r.publisher,)
        )
        pub_id = con.execute(
            "select id from publishers where name = ?", (r.publisher,)
        ).fetchone()[0]

        cur = con.execute(
            """insert or replace into reports
               (source, source_category, source_nid, source_url, title, publisher_id,
                publisher, published_at, pdf_url, body, summary, tags, confidence,
                content_hash, published, collected_at)
               values ('naver',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                r.source_category, r.source_nid, r.source_url, r.title, pub_id,
                r.publisher, r.published_at, r.pdf_url, r.body,
                json.dumps(r.summary, ensure_ascii=False),
                json.dumps(r.tags, ensure_ascii=False),
                r.confidence, r.content_hash,
                1 if r.confidence >= 0.7 else 0,   # 0.7 미만은 검수 대기
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )
        rid = cur.lastrowid
        con.execute("delete from report_chunks where report_id = ?", (rid,))
        for c in make_chunks(r):
            con.execute(
                """insert into report_chunks
                   (report_id, chunk_index, chunk_text, char_len, est_tokens)
                   values (?,?,?,?,?)""",
                (rid, c["chunk_index"], c["chunk_text"], c["char_len"], c["est_tokens"]),
            )
            chunk_total += 1

    con.execute(
        """update publishers set report_count =
           (select count(*) from reports where reports.publisher_id = publishers.id)"""
    )
    con.commit()
    return chunk_total


def export_json(con: sqlite3.Connection) -> int:
    """프런트가 쓰는 형태로 내보낸다. mock.ts의 Report 인터페이스와 필드를 맞춘다."""
    rows = con.execute(
        """select id, source_category, source_nid, source_url, title, publisher,
                  published_at, pdf_url, body, summary, tags, confidence, published
           from reports order by published_at desc, id desc"""
    ).fetchall()

    out = []
    for r in rows:
        (rid, cat, nid, url, title, pub, date, pdf, body, summary, tags, conf, published) = r
        chunks = con.execute(
            "select chunk_text from report_chunks where report_id=? order by chunk_index limit 1",
            (rid,),
        ).fetchone()
        out.append(
            {
                "id": f"N-{nid}",
                "title": title,
                "house": pub,
                "analyst": "",
                "date": date,
                "category": cat,
                "tags": json.loads(tags),
                "summary": json.loads(summary),
                # 인용 발췌는 원문 전체가 아니라 첫 청크로 제한한다.
                # 리포트 전문을 그대로 싣는 건 재배포에 해당한다.
                "excerpt": (chunks[0][:400] if chunks else body[:400]) if (chunks or body) else "",
                "url": pdf or url,
                "confidence": conf,
                "published": bool(published),
            }
        )

    os.makedirs(os.path.dirname(JSON_PATH), exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    return len(out)


# ── 실행 ────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=2, help="카테고리당 페이지 수")
    ap.add_argument("--category", action="append", choices=list(CATEGORIES),
                    help="지정하지 않으면 채권·경제·투자")
    args = ap.parse_args()

    cats = args.category or DEFAULT_CATEGORIES
    con = open_db()

    seen = kept = dropped_kw = dropped_dup = 0
    hashes: set[str] = set()
    for h, in con.execute("select content_hash from reports where content_hash is not null"):
        hashes.add(h)

    collected: list[Report] = []

    for key in cats:
        label, list_path, read_path = CATEGORIES[key]
        print(f"\n[{label}]")
        for page in range(1, args.pages + 1):
            url = f"{BASE}/{list_path}.naver?&page={page}"
            reps = parse_list(fetch(url), key, read_path)
            print(f"  {page}쪽 — 목록 {len(reps)}건")
            seen += len(reps)

            for rep in reps:
                rep.body = fetch_body(rep)
                time.sleep(0.25)   # 남의 서버다. 천천히 간다

                if not passes_keyword_filter(rep):
                    dropped_kw += 1
                    continue

                # 같은 리포트가 여러 카테고리에 뜬다. 제목+증권사+날짜로 거른다
                rep.content_hash = hashlib.sha256(
                    f"{rep.title}|{rep.publisher}|{rep.published_at}".encode()
                ).hexdigest()[:16]
                if rep.content_hash in hashes:
                    dropped_dup += 1
                    continue
                hashes.add(rep.content_hash)

                rep.tags, rep.confidence = tag(rep)
                rep.summary = summarize(rep)
                collected.append(rep)
                kept += 1

    chunks = save(con, collected)
    total = export_json(con)

    con.execute(
        """insert into collection_runs
           (ran_at, categories, pages, seen, kept, dropped_kw, dropped_dup, chunks)
           values (?,?,?,?,?,?,?,?)""",
        (datetime.now(timezone.utc).isoformat(timespec="seconds"),
         ",".join(cats), args.pages, seen, kept, dropped_kw, dropped_dup, chunks),
    )
    con.commit()

    print(f"""
{'='*54}
수집  {seen}건
  키워드 미달 폐기   {dropped_kw}건
  중복 폐기          {dropped_dup}건
  적재               {kept}건
청크  {chunks}개 (목표 {CHUNK_TARGET_CHARS}자 · 오버랩 {CHUNK_OVERLAP_CHARS}자)

DB    {DB_PATH}
JSON  {JSON_PATH} ({total}건)
{'='*54}""")

    if kept == 0:
        print("! 한 건도 못 건졌습니다. 네이버 HTML 구조가 바뀌었을 수 있습니다.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
