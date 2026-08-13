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
                       profile_ctx: str, history_ctx: str) -> str:
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
    if profile_ctx:
        parts.append("## 사용자 컨텍스트\n" + profile_ctx)
    if history_ctx:
        parts.append("## 최근 대화\n" + history_ctx)
    parts.append("## 질문\n" + question)
    return "\n\n".join(parts)


def _call_gemini(user_prompt: str, system_prompt: str | None = None) -> str:
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
            },
        },
        timeout=TIMEOUT_SEC,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


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
           profile_ctx: str = "", history_ctx: str = "") -> tuple[str, bool]:
    """해설 생성. 반환 (본문, LLM 사용 여부). 어떤 경우에도 예외를 던지지 않는다."""
    user_prompt = _build_user_prompt(question, reports, profile_ctx, history_ctx)
    try:
        text = _call_gemini(user_prompt)
        used_llm = True
    except (RuntimeError, requests.RequestException, KeyError,
            IndexError, json.JSONDecodeError) as exc:
        print(f"[chat_agent] LLM 실패, 템플릿 폴백: {exc}")
        text = _template_answer(question, reports)
        used_llm = False
    return sanitize_output(text) + "\n\n" + DISCLAIMER, used_llm


# ══════════════════════════════════════════════════════════════
# 의사결정형(decision) — 낙관/보수 두 이코노미스트의 병렬 관점
#
# "의견이 갈리면 우열을 가리지 않고 병렬 제시한다"는 Quill 원칙을
# 에이전트 구조로 승격한 것. 같은 근거 리포트를 두 관점이 각자 읽는다.
#
# 페르소나는 가상 인물이다 — 실존 유명인의 의견을 지어내 붙이는 것은
# "추천 아님" 법적 포지셔닝을 위협하므로 하지 않는다. 대신 아키타입
# (월가 강세론자 / 리스크 매니저)이 또렷이 읽히게 캐릭터를 세웠다.
#
# 두 프롬프트 모두 상수다 — 캐시 친화 원칙 동일. 공통 절대 규칙을
# 각자 포함한다 (페르소나가 진해도 가드레일은 같다).
# ══════════════════════════════════════════════════════════════

_COMMON_RULES = """
절대 규칙 (페르소나보다 우선한다):
1. 아래 제공된 리포트 발췌 안의 내용만 근거로 삼습니다. 발췌에 없는 사실·숫자를 지어내지 않습니다.
2. 매수·매도 지시, 종목 추천, 수익 보장, 확정 예측을 하지 않습니다. "저라면 ~에 주목하겠습니다"까지가 한계이고 "~하세요"는 금지입니다.
3. 인용한 리포트는 (증권사, 제목)으로 본문에 밝힙니다.
4. 사용자의 이해 수준(beginner/intermediate/advanced)에 맞는 말투로 씁니다.
5. 3~6문장. 존댓말. 상대 관점을 비난하지 않습니다 — 내 렌즈로 보이는 것을 말할 뿐입니다."""

SYSTEM_PROMPT_BULL = """당신은 '한기회'입니다 — 30년 경력의 시장 낙관론 이코노미스트. 글로벌 IB 리서치센터장을 지냈고, "시장은 결국 우상향하며, 최대 리스크는 시장에 없는 것"이라는 말로 유명합니다.

당신의 렌즈:
- 같은 리포트에서 회복·개선·기회의 신호를 먼저 찾습니다 (금리 인하 사이클, 스프레드 축소, 수급 개선, 밸류에이션 매력)
- 기회비용을 중시합니다: 너무 보수적인 배분이 놓치는 수익도 리스크라고 봅니다
- 변동성은 "장기 투자자의 입장료"라고 표현합니다
- 낙관하되 근거로 낙관합니다 — 리포트가 어두우면 "그럼에도 주목할 지점"을 찾되, 없는 햇빛을 지어내진 않습니다

말투: 활기차고 확신 있게, 그러나 숫자는 리포트 그대로. "제 눈에는 ~가 보입니다" 화법.
""" + _COMMON_RULES

SYSTEM_PROMPT_BEAR = """당신은 '차보수'입니다 — 30년 경력의 리스크 관리 전문 이코노미스트. 연기금 CIO 출신으로 두 번의 금융위기에서 자산을 지켜냈고, "수익은 예측의 대가가 아니라 생존의 대가"라는 말로 유명합니다.

당신의 렌즈:
- 같은 리포트에서 하방 위험·불확실성·꼬리 리스크를 먼저 점검합니다 (긴축 지속 가능성, 신용 스프레드 확대, 유동성 경색, 정책 불확실성)
- 최악 시나리오를 먼저 묻습니다: "이 선택이 틀렸을 때 잃는 것은?"
- 현금·분산·만기 관리 같은 방어 수단의 가치를 강조합니다
- 신중하되 근거로 신중합니다 — 리포트가 밝아도 "그래도 확인할 지점"을 찾되, 없는 먹구름을 지어내진 않습니다

말투: 차분하고 단단하게, 숫자는 리포트 그대로. "저는 ~부터 확인하겠습니다" 화법.
""" + _COMMON_RULES


def _template_decision(reports: list[dict]) -> str:
    """두 관점 LLM이 모두 실패했을 때 — 리포트 요약만 중립 전달."""
    lines = ["지금은 두 전문가 관점을 생성할 수 없어 리포트 요약만 전해 드립니다.\n"]
    for r in reports[:3]:
        head = (r.get("summary") or [r.get("excerpt", "")[:120]])[0]
        lines.append(f"· {r.get('house','')} 「{r.get('title','')}」 ({r.get('date','')}): {head}")
    return "\n".join(lines)


def answer_decision(question: str, reports: list[dict],
                    profile_ctx: str = "", history_ctx: str = "") -> tuple[str, bool]:
    """의사결정형 — 같은 근거를 낙관/보수 두 렌즈로 읽어 병렬 제시.

    LLM 2회 (경로 예산 상한). 한쪽만 실패하면 성공한 쪽 + 실패 안내,
    둘 다 실패하면 중립 템플릿 — 어떤 경우에도 답은 나간다.
    """
    user_prompt = _build_user_prompt(question, reports, profile_ctx, history_ctx)

    views: dict[str, str | None] = {"bull": None, "bear": None}
    for key_, sys_prompt in (("bull", SYSTEM_PROMPT_BULL), ("bear", SYSTEM_PROMPT_BEAR)):
        try:
            views[key_] = _call_gemini(user_prompt, sys_prompt)
        except (RuntimeError, requests.RequestException, KeyError,
                IndexError, json.JSONDecodeError) as exc:
            print(f"[chat_agent] decision {key_} 실패: {exc}")

    used_llm = any(views.values())
    if not used_llm:
        text = _template_decision(reports)
    else:
        parts = ["이 질문은 판단이 갈릴 수 있어, 서로 다른 두 관점을 나란히 보여 드릴게요. 어느 쪽이 옳은지는 저희가 정하지 않습니다.\n"]
        parts.append("📈 한기회 (낙관론 이코노미스트)\n"
                     + (views["bull"] or "(이 관점은 지금 생성할 수 없었어요)"))
        parts.append("\n🛡️ 차보수 (리스크 관리 이코노미스트)\n"
                     + (views["bear"] or "(이 관점은 지금 생성할 수 없었어요)"))
        parts.append("\n두 분 모두 같은 리포트를 근거로 말했습니다. 최종 판단은 회원님의 몫이에요.")
        text = "\n".join(parts)

    return sanitize_output(text) + "\n\n" + DISCLAIMER, bool(used_llm)
