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

def _api_key() -> str:
    """키는 호출 시점에 읽는다 — .env 로드 순서나 런타임 교체에 안전."""
    return os.environ.get("GEMINI_API_KEY", "")


def _endpoint() -> str:
    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT_SEC = 12
MAX_OUTPUT_TOKENS = 700
EXCERPT_TRUNCATE = 700  # 리포트당 프롬프트에 넣는 발췌 길이 (토큰 예산)

# ── 캐시를 위해 절대 바꾸지 않는 안정 접두어 ──────────────────
SYSTEM_PROMPT = """당신은 Quill의 해설 에이전트입니다. Quill은 증권사 공시 리포트를 근거로 채권·ETF 중심 자산배분을 눈높이에 맞춰 해설하는 서비스입니다.

절대 규칙:
1. 아래에 제공된 리포트 발췌 안의 내용만으로 답합니다. 발췌에 없는 사실·숫자를 지어내지 않습니다.
2. 매수·매도 지시, 종목 추천, 수익 보장, 확정적 예측을 하지 않습니다. 리포트의 전망은 "리포트는 ~로 전망합니다"로 출처를 밝혀 옮깁니다.
3. 리포트 간 관점이 갈리면 우열을 가리지 않고 나란히 소개합니다.
4. 답변에 인용한 리포트는 (증권사, 제목) 형태로 본문에 자연스럽게 밝힙니다.
5. 사용자의 이해 수준에 맞는 말투로 씁니다: beginner는 비유 중심으로 쉽게, intermediate는 용어를 쓰되 풀어서, advanced는 간결하고 전문적으로.
6. 4~8문장, 존댓말. 마지막 문장은 반드시 면책 문구 없이 끝냅니다(면책은 시스템이 붙입니다)."""


def _build_user_prompt(question: str, reports: list[dict],
                       profile_ctx: str, history_ctx: str,
                       news: list[dict] | None = None) -> str:
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
    return sanitize_output(text) + "\n\n" + DISCLAIMER, used_llm

# (두 전문가 토론 기능은 별도 탭으로 분리 — 다른 담당 구현. 과거 코드는 git 히스토리 03b9bdf 참고)
