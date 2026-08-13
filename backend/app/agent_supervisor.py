"""agent_supervisor — Agent-as-Tool Supervisor (신규 경로).

기존 /api/chat(supervisor.py + triage.py, 정규식 기반 분류)과는 완전히 별개다.
여기서는 LLM(Gemini function calling)이 도구 호출 여부·어떤 도구를 쓸지
직접 판단한다. 도구는 report_retriever/evidence_finder/portfolio_builder
3개뿐이고, 서브 에이전트로 쪼개지 않은 단일 LLM 호출 루프로 충분하다.

예외처리는 하지 않는다 — 지금은 에러가 나면 그냥 나게 둔다.
"""

from __future__ import annotations

import os

import requests

from .agent_tools import TOOLS

SUPERVISOR_SYSTEM_PROMPT = """너는 투자 포트폴리오 어시스턴트다. 아래 도구 중 필요한 것만 호출해서 답하라.

- report_retriever: 채권/ETF/시장 동향 등 산업 리포트 근거가 필요할 때
- evidence_finder: 리포트로 부족한 최신 뉴스가 필요할 때
- portfolio_builder: 사용자가 자기 포트폴리오/비중을 물어볼 때

일상 인사나 감사 표현에는 도구를 호출하지 마라."""

MAX_TOOL_ROUNDS = 4  # 도구 호출 → 응답 → 재판단 루프의 상한 (무한루프 방지)


def _endpoint() -> str:
    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _call_gemini(contents: list[dict]) -> dict:
    resp = requests.post(
        _endpoint(),
        params={"key": os.environ["GEMINI_API_KEY"]},
        json={
            "systemInstruction": {"parts": [{"text": SUPERVISOR_SYSTEM_PROMPT}]},
            "contents": contents,
            "tools": [{"functionDeclarations": [t.declaration() for t in TOOLS.values()]}],
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def run(message: str) -> dict:
    """단일 LLM 호출 루프. 도구 호출이 없어질 때까지 반복하고
    {"text": 최종 답변, "tools_called": 호출된 도구 이름 목록}을 반환한다."""
    contents = [{"role": "user", "parts": [{"text": message}]}]
    tools_called: list[str] = []

    for _ in range(MAX_TOOL_ROUNDS):
        data = _call_gemini(contents)
        parts = data["candidates"][0]["content"]["parts"]
        contents.append({"role": "model", "parts": parts})

        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        if not calls:
            text = "".join(p.get("text", "") for p in parts)
            return {"text": text, "tools_called": tools_called}

        response_parts = []
        for call in calls:
            name = call["name"]
            result = TOOLS[name](**call.get("args", {}))
            tools_called.append(name)
            response_parts.append(
                {"functionResponse": {"name": name, "response": {"name": name, "content": result}}}
            )
        contents.append({"role": "function", "parts": response_parts})

    return {"text": "", "tools_called": tools_called}
