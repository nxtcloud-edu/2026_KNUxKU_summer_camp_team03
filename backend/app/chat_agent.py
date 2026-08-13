"""chat_agent — 챗의 유일한 LLM 호출 지점 (analysis 역할).

원칙:
  - 시스템 프롬프트는 상수다. 턴마다 바뀌는 내용(리포트·프로필·이력)은 전부
    user 파트에 넣는다 — Gemini implicit caching이 안정된 접두어(prefix)를
    캐시하므로, 시스템 프롬프트가 흔들리면 캐시가 깨진다.
  - LLM은 "주어진 리포트 발췌 안에서만" 해설한다. 없는 내용은 지어내지 않게
    지시하고, 나가는 텍스트는 sanitize_output을 한 번 더 통과한다.
  - 실패하면 죽지 않는다: 리포트 요약을 템플릿으로 조립한 폴백 답변을 낸다.
    (AI가 죽어도 서비스는 안 죽는다 — 근거는 이미 코드가 찾아 놨으니까)
"""

from __future__ import annotations

import json
import os

import requests

from .guardrails import DISCLAIMER, sanitize_output

# ── PII 제거 — 애널리스트 연락처가 답변에 노출되지 않게 ────────
import re as _re

_EMAIL_PAT = _re.compile(r"[\w.\-+]+@[\w.\-]+\.\w+")
# 전화번호: 02-1234-5678, 031-123-4567, 2122-9206(내선), 010-1234-5678 등
_PHONE_PAT = _re.compile(
    r"(?:\d{2,4}[)\-.\s]){1,2}\d{3,4}[.\-\s]?\d{4}"  # 지역번호-국번-번호
    r"|\d{4}[.\-]\d{4}"  # 내선번호 (예: 2122-9206)
)


def _strip_contact_info(text: str) -> str:
    """이메일·전화번호 패턴을 제거한다.

    리포트 원문 발췌에 애널리스트 연락처가 들어있을 수 있다.
    LLM이 그대로 인용하거나 폴백 조립에서 포함되면 개인정보 노출이다.
    """
    text = _EMAIL_PAT.sub("", text)
    text = _PHONE_PAT.sub("", text)
    return text

def _api_key() -> str:
    """키는 호출 시점에 읽는다 — .env 로드 순서나 런타임 교체에 안전."""
    return os.environ.get("GEMINI_API_KEY", "")


def _endpoint() -> str:
    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT_SEC = 12
MAX_OUTPUT_TOKENS = 500
EXCERPT_TRUNCATE = 700  # 리포트당 프롬프트에 넣는 발췌 길이 (토큰 예산)

# ── 캐시를 위해 절대 바꾸지 않는 안정 접두어 ──────────────────
SYSTEM_PROMPT = """당신은 Quill의 해설 에이전트입니다. Quill은 증권사 공시 리포트를 근거로 채권·ETF 중심 자산배분을 눈높이에 맞춰 해설하는 서비스입니다.

절대 규칙:
1. 아래에 제공된 리포트 발췌 안의 내용만으로 답합니다. 발췌에 없는 사실·숫자를 지어내지 않습니다.
2. 매수·매도 지시, 종목 추천, 수익 보장, 확정적 예측을 하지 않습니다.
3. 리포트 간 관점이 갈리면 우열을 가리지 않고 나란히 소개합니다.
4. 본문에 "(증권사, 「제목」)" 형태 인용을 쓰지 않습니다. 대신 "한 증권사 리포트에 따르면" 식으로 자연스럽게 녹이거나, 출처 없이 내용만 전달합니다. (근거 리포트는 별도 필드로 이미 전달됩니다.)
5. 전문용어(듀레이션, 스프레드, T-bill, 쿠폰채, 10년물 등)는 반드시 괄호로 즉시 풀어줍니다. 예: "듀레이션(금리 변동에 대한 채권 가격 민감도)", "T-bill(단기 국채)", "10년물(10년 만기 국채)".
6. 문장은 짧고 쉽게, 한 문단에 핵심 하나만. "종합적으로 볼 때" 같은 딱딱한 접속사 대신 자연스러운 흐름으로.
7. 4~6문장, 존댓말. 면책 문구는 붙이지 않습니다(시스템이 자동 추가).
8. 상품 목록이 제공되면 해당 상품명을 자연스럽게 언급할 수 있습니다. 단 "추천"이 아니라 "이런 상품이 있다"는 안내만 합니다. 상품 목록에 없는 상품명/티커를 지어내지 않습니다."""


# ── 상품 질문 감지 ──────────────────────────────────────────────
import re as _re

_PRODUCT_QUERY_PAT = _re.compile(
    r"상품|뭐\s?있|뭘\s?살\s?수|어떤\s?(etf|상품|채권|펀드)|종류|목록|리스트"
    r"|추천.*(etf|상품|채권)|etf.*(뭐|뭘|어떤|종류|있)",
    _re.I,
)
_ASSET_HINTS = [
    (_re.compile(r"패시브|인덱스|지수\s?추종", _re.I), "etfPassive"),
    (_re.compile(r"액티브|테마", _re.I), "etfActive"),
    (_re.compile(r"현금|mmf|cd금리|머니마켓", _re.I), "cash"),
    (_re.compile(r"단기채|단기\s?국채|통안채", _re.I), "govShort"),
    (_re.compile(r"장기채|장기\s?국채|10년|30년", _re.I), "govLong"),
    (_re.compile(r"회사채|크레딧", _re.I), "corp"),
]
_THEME_HINTS = [
    (_re.compile(r"ai|인공지능", _re.I), "AI"),
    (_re.compile(r"반도체"), "반도체"),
    (_re.compile(r"2차전지|배터리"), "2차전지"),
    (_re.compile(r"로봇"), "로봇"),
    (_re.compile(r"바이오|헬스케어|제약"), "바이오"),
    (_re.compile(r"우주|방산"), "우주항공"),
    (_re.compile(r"신재생|태양광|친환경에너지"), "신재생에너지"),
    (_re.compile(r"자율주행|전기차|미래차"), "자율주행"),
    (_re.compile(r"조선|해운"), "조선"),
    (_re.compile(r"양자|퀀텀"), "양자컴퓨팅"),
    (_re.compile(r"메타버스|가상현실"), "메타버스"),
    (_re.compile(r"전력.*인프라|데이터센터"), "AI전력인프라"),
]


def _detect_product_query(question: str) -> dict | None:
    """질문에서 상품 검색 의도를 감지. 없으면 None 반환."""
    if not _PRODUCT_QUERY_PAT.search(question):
        return None

    kwargs: dict = {}
    for pat, asset in _ASSET_HINTS:
        if pat.search(question):
            kwargs["asset_hint"] = asset
            break
    for pat, theme in _THEME_HINTS:
        if pat.search(question):
            kwargs["theme_keyword"] = theme
            break

    return kwargs if kwargs else {"asset_hint": None}  # 힌트 없으면 전체 검색


def _build_user_prompt(question: str, reports: list[dict],
                       profile_ctx: str, history_ctx: str,
                       news: list[dict] | None = None) -> str:
    from .product_store import format_products_for_prompt, search_products

    parts = []
    if reports:
        lines = []
        for r in reports:
            summary = " / ".join(r.get("summary", [])[:3])
            excerpt = (r.get("excerpt", "") or "")[:EXCERPT_TRUNCATE]
            lines.append(
                f"[{r['id']}] {r.get('house','')} 「{r.get('title','')}」 ({r.get('date','')})\n"
                f"요약: {summary}\n발췌: {excerpt}"
            )
        parts.append("## 근거 리포트 발췌\n" + "\n\n".join(lines))
    if news:
        nlines = [f"[{n['source']} {n['published_at']}] {n['title']} — {n['description'][:200]} ({n['url']})"
                  for n in news]
        parts.append("## 최신 뉴스 (보조 근거 — 인용 시 '(로이터 8/10 보도)'처럼 출처·날짜를 밝힐 것)\n"
                     + "\n".join(nlines))

    # 상품 관련 키워드가 질문에 있으면 관련 상품 목록 주입
    _product_hints = _detect_product_query(question)
    if _product_hints:
        prods = search_products(**_product_hints)
        prod_text = format_products_for_prompt(prods)
        if prod_text:
            parts.append(prod_text)
    if profile_ctx:
        parts.append("## 사용자 컨텍스트\n" + profile_ctx)
    if history_ctx:
        parts.append("## 최근 대화\n" + history_ctx)
    parts.append("## 질문\n" + question)
    return "\n\n".join(parts)


def _call_gemini(user_prompt: str, system_prompt: str | None = None) -> str:
    import time as _time
    _t0 = _time.time()
    key = _api_key()
    if not key:
        raise RuntimeError("GEMINI_API_KEY 미설정 — backend/.env 확인")
    resp = requests.post(
        _endpoint(),
        params={"key": key},
        json={
            "systemInstruction": {"parts": [{"text": system_prompt or SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": MAX_OUTPUT_TOKENS,
                # gemini-2.5-flash는 추론(thinking) 모델이라 thinkingBudget을 두면
                # maxOutputTokens 예산 대부분을 thinking이 먹어 답변이 MAX_TOKENS로
                # 잘려버린다 (실측: 700 중 669가 thinking). 해설 텍스트만 필요하므로 끈다.
                "thinkingConfig": {"thinkingBudget": 0},
            },
        },
        timeout=TIMEOUT_SEC,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    print(f"│ ✍ [LLM] Gemini 응답 {_time.time() - _t0:.2f}s · {len(text)}자", flush=True)
    return text


def _template_answer(question: str, reports: list[dict]) -> str:
    """LLM 폴백 — 리포트 요약을 템플릿으로 조립한다. 생성 없음."""
    q_head = question.split("—")[0].strip()[:40]
    lines = [f"「{q_head}」 관련으로 수집된 리포트를 찾았어요. 원문 요약을 그대로 전해 드립니다.\n"]
    for r in reports[:3]:
        summary = r.get("summary", [])
        head = summary[0] if summary else (r.get("excerpt", "")[:120])
        lines.append(f"· {r.get('house','')} 「{r.get('title','')}」 ({r.get('date','')}): {head}")
    lines.append("\n자세한 해설이 필요하시면 잠시 후 다시 물어봐 주세요.")
    return "\n".join(lines)


def answer(question: str, reports: list[dict],
           profile_ctx: str = "", history_ctx: str = "",
           news: list[dict] | None = None) -> tuple[str, bool]:
    """해설 생성. 반환 (본문, LLM 사용 여부). 어떤 경우에도 예외를 던지지 않는다."""
    user_prompt = _build_user_prompt(question, reports, profile_ctx, history_ctx, news)
    try:
        text = _call_gemini(user_prompt)
        used_llm = True
    except (RuntimeError, requests.RequestException, KeyError,
            IndexError, json.JSONDecodeError) as exc:
        print(f"[chat_agent] LLM 실패, 템플릿 폴백: {exc}", flush=True)
        text = _template_answer(question, reports)
        used_llm = False
    return sanitize_output(_strip_contact_info(text)), used_llm

# (두 전문가 토론 기능은 별도 탭으로 분리 — 다른 담당 구현. 과거 코드는 git 히스토리 03b9bdf 참고)
