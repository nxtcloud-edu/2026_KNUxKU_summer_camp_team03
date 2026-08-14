"""
DB 뷰어 — 수집한 데이터를 눈으로 확인하는 화면.

    python collector/viewer.py        →  http://localhost:5180

SQLite를 그대로 읽어 표로 보여 준다. 표준 라이브러리만 쓴다.
설치할 것도, 켜 둘 서버도 없다. 확인이 끝나면 Ctrl+C로 끄면 된다.

여기서 봐야 하는 것
  · 리포트가 실제로 들어왔는가 (제목·증권사·날짜가 그럴듯한가)
  · 1차 필터가 무엇을 버렸는가
  · 태깅 신뢰도 0.7 경계로 검수 대기가 갈렸는가
  · 청크 길이가 목표(370자 / 480토큰) 근처인가 — 이게 검색 품질을 좌우한다
"""

from __future__ import annotations

import html
import json
import os
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "quill.db")
PORT = 5180

# 화면 색은 앱과 같은 토큰을 쓴다. 따로 노는 도구처럼 보이지 않게.
CSS = """
:root{--paper:#f7f6f3;--surface:#fff;--sunken:#f2f1ed;--ink:#16181c;--ink2:#3a3d44;
--ink3:#6b6e76;--ink4:#9c9ea5;--line:#e6e4de;--gold:#a8843c;--gold-soft:#f3ecdd;
--gold-deep:#6f5622;--ok:#2f6b4f;--ok-soft:#eaf2ed;--warn:#b3541e;--warn-soft:#fbefe7;}
*{box-sizing:border-box;margin:0}
body{background:var(--paper);color:var(--ink);font:14px/1.7 Pretendard,-apple-system,
"Malgun Gothic",sans-serif;padding:36px 28px 80px}
.wrap{max-width:1280px;margin:0 auto}
h1{font-size:26px;letter-spacing:-.03em}
.sub{color:var(--ink3);font-size:13px;margin-top:6px}
.tabs{display:flex;gap:6px;margin:26px 0 20px;flex-wrap:wrap}
.tab{padding:7px 15px;border-radius:8px;background:var(--sunken);color:var(--ink2);
text-decoration:none;font-size:13px;font-weight:600}
.tab.on{background:var(--ink);color:var(--paper)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.stat{background:var(--surface);border-radius:12px;padding:16px 18px}
.stat b{display:block;font-size:27px;letter-spacing:-.03em;line-height:1.2}
.stat span{font-size:11.5px;color:var(--ink3)}
table{width:100%;border-collapse:collapse;background:var(--surface);border-radius:12px;overflow:hidden}
th{font-size:11px;letter-spacing:.08em;color:var(--ink4);text-align:left;
padding:11px 14px;background:var(--sunken);font-weight:700;white-space:nowrap}
td{padding:11px 14px;border-top:1px solid var(--line);font-size:13px;vertical-align:top}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.pill{display:inline-block;font-size:10.5px;font-weight:700;border-radius:999px;padding:2px 9px}
.ok{background:var(--ok-soft);color:var(--ok)}
.wait{background:var(--warn-soft);color:var(--warn)}
.tag{display:inline-block;font-size:10.5px;background:var(--gold-soft);color:var(--gold-deep);
border-radius:999px;padding:1px 8px;margin:1px 3px 1px 0}
.chunk{font-size:12px;line-height:1.75;color:var(--ink2);white-space:pre-wrap;word-break:break-word}
a{color:var(--gold-deep)}
.note{font-size:11.5px;color:var(--ink4);margin-top:14px;line-height:1.7}
.bar{height:6px;background:var(--sunken);border-radius:99px;overflow:hidden;margin-top:5px}
.bar i{display:block;height:100%;background:var(--gold);border-radius:99px}
"""

TABS = [
    ("reports", "리포트"),
    ("chunks", "청크"),
    ("publishers", "증권사"),
    ("runs", "수집 이력"),
]


def q(con, sql, args=()):
    return con.execute(sql, args).fetchall()


def esc(s):
    return html.escape(str(s if s is not None else ""))


def page(tab: str, body: str, stats: str = "") -> str:
    tabs = "".join(
        f'<a class="tab{" on" if k == tab else ""}" href="/?tab={k}">{v}</a>'
        for k, v in TABS
    )
    return f"""<!doctype html><html lang=ko><head><meta charset=utf-8>
<title>맥미리 DB 뷰어</title><style>{CSS}</style></head><body><div class=wrap>
<h1>수집 데이터</h1>
<p class=sub>네이버 리서치에서 실제로 긁어 온 리포트입니다. 샘플이 아닙니다.
· <code>data/quill.db</code></p>
<div class=tabs>{tabs}</div>{stats}{body}</div></body></html>"""


def view_reports(con) -> tuple[str, str]:
    total, pub = q(con, "select count(*), sum(published) from reports")[0]
    cats = q(con, "select source_category, count(*) from reports group by 1 order by 2 desc")
    stats = f"""<div class=stats>
<div class=stat><b>{total}</b><span>적재된 리포트</span></div>
<div class=stat><b>{pub or 0}</b><span>공개 (신뢰도 0.7 이상)</span></div>
<div class=stat><b>{total - (pub or 0)}</b><span>검수 대기</span></div>
{"".join(f'<div class=stat><b>{c}</b><span>{k}</span></div>' for k, c in cats)}
</div>"""

    rows = q(con, """select title, publisher, published_at, source_category, tags,
                            confidence, published, source_url, pdf_url,
                            (select count(*) from report_chunks c where c.report_id=r.id)
                     from reports r order by published_at desc, id desc limit 120""")
    trs = []
    for (t, p, d, cat, tags, conf, published, url, pdf, nchunk) in rows:
        tagshtml = "".join(f'<span class=tag>{esc(x)}</span>' for x in json.loads(tags))
        badge = '<span class="pill ok">공개</span>' if published else '<span class="pill wait">검수대기</span>'
        link = pdf or url
        trs.append(f"""<tr>
<td><a href="{esc(link)}" target=_blank>{esc(t)}</a></td>
<td>{esc(p)}</td><td class=num>{esc(d)}</td><td>{esc(cat)}</td>
<td>{tagshtml}</td><td class=num>{conf}</td><td>{badge}</td><td class=num>{nchunk}</td></tr>""")

    body = f"""<table><tr><th>제목</th><th>증권사</th><th>발행일</th><th>카테고리</th>
<th>태그</th><th>신뢰도</th><th>상태</th><th>청크</th></tr>{''.join(trs)}</table>
<p class=note>제목을 누르면 원문 PDF 또는 네이버 상세 페이지로 갑니다.
신뢰도 0.7 미만은 규칙만으로 태깅한 건이라 사람 검수 대상으로 남습니다.</p>"""
    return stats, body


def view_chunks(con) -> tuple[str, str]:
    n, avg, mn, mx, avgt, mxt = q(
        con, """select count(*), round(avg(char_len),1), min(char_len), max(char_len),
                       round(avg(est_tokens),0), max(est_tokens) from report_chunks"""
    )[0]
    # 목표는 370자 / 480토큰. 얼마나 붙었는지 눈으로 보이게
    ratio = min(100, int((avg / 370) * 100)) if avg else 0
    stats = f"""<div class=stats>
<div class=stat><b>{n}</b><span>전체 청크</span></div>
<div class=stat><b>{avg}자</b><span>평균 길이 (목표 370자)<div class=bar><i style="width:{ratio}%"></i></div></span></div>
<div class=stat><b>{int(avgt)}</b><span>평균 토큰 (목표 400~512)</span></div>
<div class=stat><b>{mn}~{mx}자</b><span>최소~최대</span></div>
<div class=stat><b>{mxt}</b><span>최대 토큰 (상한 2500)</span></div>
</div>"""

    rows = q(con, """select r.title, r.publisher, c.chunk_index, c.char_len, c.est_tokens, c.chunk_text
                     from report_chunks c join reports r on r.id=c.report_id
                     order by c.id limit 40""")
    trs = "".join(
        f"""<tr><td class=num>{i}</td><td>{esc(t[:34])}<br><span style="color:var(--ink4);font-size:11px">{esc(p)}</span></td>
<td class=num>{cl}자<br><span style="color:var(--ink4)">{et}tok</span></td>
<td class=chunk>{esc(txt)}</td></tr>"""
        for (t, p, i, cl, et, txt) in rows
    )
    body = f"""<table><tr><th>#</th><th>출처 리포트</th><th>길이</th><th>청크 본문</th></tr>{trs}</table>
<p class=note>재귀 분할(문단→문장→길이)로 잘랐고, 청크마다 앞에 <b>[증권사 · 제목]</b>을 붙였습니다.
청크만 떼어 놓고 보면 어느 리포트인지 알 수 없어 검색 품질이 떨어지기 때문입니다.
오버랩 64자로 문맥이 끊기지 않게 겹쳐 뒀습니다.</p>"""
    return stats, body


def view_publishers(con) -> tuple[str, str]:
    rows = q(con, "select name, report_count from publishers order by report_count desc")
    trs = "".join(f"<tr><td>{esc(n)}</td><td class=num>{c}</td></tr>" for n, c in rows)
    stats = f'<div class=stats><div class=stat><b>{len(rows)}</b><span>증권사</span></div></div>'
    body = f"<table><tr><th>증권사</th><th>리포트 수</th></tr>{trs}</table>"
    return stats, body


def view_runs(con) -> tuple[str, str]:
    rows = q(con, """select ran_at, categories, pages, seen, kept, dropped_kw, dropped_dup, chunks
                     from collection_runs order by id desc""")
    trs = "".join(
        f"""<tr><td>{esc(a)}</td><td>{esc(c)}</td><td class=num>{p}</td><td class=num>{s}</td>
<td class=num>{k}</td><td class=num>{dk}</td><td class=num>{dd}</td><td class=num>{ch}</td></tr>"""
        for (a, c, p, s, k, dk, dd, ch) in rows
    )
    body = f"""<table><tr><th>실행 시각(UTC)</th><th>카테고리</th><th>페이지</th><th>수집</th>
<th>적재</th><th>키워드 폐기</th><th>중복 폐기</th><th>청크</th></tr>{trs}</table>
<p class=note>버린 건수를 남기는 이유는, 필터가 갑자기 헐거워지거나 빡빡해지면
여기 숫자가 먼저 흔들리기 때문입니다.</p>"""
    return "", body


VIEWS = {"reports": view_reports, "chunks": view_chunks,
         "publishers": view_publishers, "runs": view_runs}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        tab = (parse_qs(urlparse(self.path).query).get("tab") or ["reports"])[0]
        if tab not in VIEWS:
            tab = "reports"
        con = sqlite3.connect(DB_PATH)
        try:
            stats, body = VIEWS[tab](con)
            out = page(tab, body, stats)
        finally:
            con.close()
        data = out.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass   # 요청 로그로 터미널을 채우지 않는다


if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        print("DB가 없습니다. 먼저 수집기를 돌리세요:\n    python collector/collect.py")
        sys.exit(1)
    print(f"DB 뷰어 → http://localhost:{PORT}\n끄려면 Ctrl+C")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
