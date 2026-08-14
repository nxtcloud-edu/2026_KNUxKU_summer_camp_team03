"""persona_agent — 훈수 탭: 3명의 페르소나가 같은 근거를 각자 해석.

decision_agent와 동일한 시그니처 계약:
  answer_persona(question, reports, news, profile_ctx) → (text, used_llm)

supervisor가 report_retriever·evidence_finder로 이미 모은 근거를 넘기므로,
이 함수 안에서 검색 API를 다시 부를 필요 없다.

Gemini를 3번 순차 호출(페르소나별 system_instruction). 한 호출이 실패해도
나머지는 살아있다. used_llm은 하나라도 성공하면 True.

합산 텍스트에 sanitize_output 1회, DISCLAIMER 1회만 맨 끝에 붙인다.
"""

from __future__ import annotations

import json
import os
import re as _re

import requests

from .chat_agent import _strip_contact_info
from .guardrails import DISCLAIMER, sanitize_output
from .personas import ALL_PERSONAS

# chat_agent.py와 동일한 Gemini 설정 — 일관성을 위해 재사용 패턴
_TIMEOUT_SEC = 12
_MAX_OUTPUT_TOKENS = 600  # 페르소나당 200자(한글) ≈ 300~400토큰, 여유 확보
_EXCERPT_TRUNCATE = 700


def _api_key() -> str:
    return os.environ.get("GEMINI_API_KEY", "")


def _endpoint() -> str:
    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _build_user_prompt(question: str, reports: list[dict],
                       profile_ctx: str, news: list[dict] | None = None) -> str:
    """chat_agent._build_user_prompt()와 동일한 구조. history_ctx는 생략
    (훈수 탭은 단발 의견이므로 이전 대화 맥락을 주입하지 않는다)."""
    parts = []
    if reports:
        lines = []
        for r in reports:
            summary = " / ".join(r.get("summary", [])[:3])
            excerpt = (r.get("excerpt", "") or "")[:_EXCERPT_TRUNCATE]
            lines.append(
                f"[{r['id']}] {r.get('house', '')} 「{r.get('title', '')}」 ({r.get('date', '')})\n"
                f"요약: {summary}\n발췌: {excerpt}"
            )
        parts.append("## 근거 리포트 발췌\n" + "\n\n".join(lines))
    if news:
        nlines = [
            f"[{n['source']} {n['published_at']}] {n['title']} — {n['description'][:200]} ({n['url']})"
            for n in news
        ]
        parts.append(
            "## 최신 뉴스 (보조 근거 — 인용 시 출처·날짜를 밝힐 것)\n"
            + "\n".join(nlines)
        )
    if profile_ctx:
        parts.append("## 사용자 컨텍스트\n" + profile_ctx)

    # 상품 관련 질문이면 관련 상품 목록 주입
    from .chat_agent import _detect_product_query
    from .product_store import format_products_for_prompt, search_products
    _product_hints = _detect_product_query(question)
    if _product_hints:
        prods = search_products(**_product_hints)
        prod_text = format_products_for_prompt(prods)
        if prod_text:
            parts.append(prod_text)

    parts.append("## 질문\n" + question)
    return "\n\n".join(parts)


def _call_gemini_for_persona(system_prompt: str, user_prompt: str) -> str:
    """Gemini 1회 호출. chat_agent._call_gemini()과 동일 패턴."""
    key = _api_key()
    if not key:
        raise RuntimeError("GEMINI_API_KEY 미설정 — backend/.env 확인")
    resp = requests.post(
        _endpoint(),
        params={"key": key},
        json={
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": 0.5,
                "maxOutputTokens": _MAX_OUTPUT_TOKENS,
                "thinkingConfig": {"thinkingBudget": 0},
            },
        },
        timeout=_TIMEOUT_SEC,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


_FAIL_MSG = "지금 답변을 만들지 못했어요."


def answer_persona(question: str, reports: list[dict],
                   news: list[dict] | None = None,
                   profile_ctx: str = "") -> tuple[list[dict], bool]:
    """3명의 페르소나 의견을 순차 호출해 dict 배열로 반환.

    Returns:
        (페르소나별 응답 dict 리스트, LLM을 하나라도 성공적으로 호출했는가)
    """
    user_prompt = _build_user_prompt(question, reports, profile_ctx, news)
    results: list[dict] = []
    any_success = False

    for persona in ALL_PERSONAS:
        try:
            reply = _call_gemini_for_persona(persona["system_prompt"], user_prompt)
            any_success = True
            message = sanitize_output(_strip_contact_info(reply))
            # LLM이 프롬프트 구조를 답변에 그대로 출력하는 경우 제거
            message = _re.sub(r"^##\s.*(?:\n(?!##).*)*", "", message, flags=_re.MULTILINE).strip()
            # LLM이 상품명 목록을 글머리로 나열하는 경우 제거 (지어낸 상품명 차단)
            message = _re.sub(r"^[\*\-]\s+.*\n?", "", message, flags=_re.MULTILINE).strip()
        except (RuntimeError, requests.RequestException, KeyError,
                IndexError, json.JSONDecodeError) as exc:
            print(f"[persona_agent] {persona['name']} 실패: {exc}", flush=True)
            message = _FAIL_MSG

        results.append({
            "persona": persona["name"],
            "label": persona["label"],
            "emoji": persona["emoji"],
            "message": message,
            "evidence": [r["id"] for r in reports],
        })

    return results, any_success


def answer_single_persona(
    persona_name: str,
    question: str,
    reports: list[dict],
    news: list[dict] | None = None,
    profile_ctx: str = "",
    history: list[dict] | None = None,
) -> tuple[list[dict], bool]:
    """특정 페르소나 1명만 호출. 후속 대화 맥락(history) 지원.

    반환 형식은 answer_persona()와 동일: (personas_list, used_llm)
    — 단, 배열에 지정된 페르소나 1개만 담김.
    """
    # 페르소나 찾기
    persona = next((p for p in ALL_PERSONAS if p["name"] == persona_name), None)
    if not persona:
        return [{
            "persona": persona_name,
            "label": "?",
            "emoji": "❓",
            "message": f"'{persona_name}'이라는 페르소나를 찾지 못했어요.",
            "evidence": [],
        }], False

    # history를 컨텍스트 텍스트로 변환
    history_ctx = ""
    if history:
        lines = []
        for turn in history[-6:]:  # 최근 6턴만
            who = "사용자" if turn.get("role") == "user" else persona_name
            lines.append(f"{who}: {turn.get('text', '')[:200]}")
        history_ctx = "\n".join(lines)

    # 프롬프트 조립 (history 포함)
    user_prompt = _build_user_prompt(question, reports, profile_ctx, news)
    if history_ctx:
        user_prompt = f"## 이전 대화\n{history_ctx}\n\n{user_prompt}"

    try:
        reply = _call_gemini_for_persona(persona["system_prompt"], user_prompt)
        message = sanitize_output(_strip_contact_info(reply))
        message = _re.sub(r"^##\s.*(?:\n(?!##).*)*", "", message, flags=_re.MULTILINE).strip()
        message = _re.sub(r"^[\*\-]\s+.*\n?", "", message, flags=_re.MULTILINE).strip()
        used_llm = True
    except (RuntimeError, requests.RequestException, KeyError,
            IndexError, json.JSONDecodeError) as exc:
        print(f"[persona_agent] {persona_name} 실패: {exc}", flush=True)
        message = _FAIL_MSG
        used_llm = False

    return [{
        "persona": persona["name"],
        "label": persona["label"],
        "emoji": persona["emoji"],
        "message": message,
        "evidence": [r["id"] for r in reports],
    }], used_llm
