"""agent_tools — 기존 검색/추천 모듈을 감싼 얇은 도구 래퍼 3개.

Agent-as-Tool Supervisor(agent_supervisor.py)가 LLM function calling으로
호출하는 도구들이다. 로직은 전부 기존 모듈(report_retriever/evidence_finder/
quant/gemini_agent)에 있다 — 여기서는 그걸 그대로 호출만 한다.

기존 /api/chat(supervisor.py + triage.py)과는 별개의 새 경로에서만 쓰인다.
"""

from __future__ import annotations

from typing import Any, Callable

from . import evidence_finder as _ef
from . import gemini_agent
from . import quant
from . import report_retriever as _rr


class Tool:
    """이름 + Gemini function-calling 스키마 + 실제 호출 함수를 묶은 최소 래퍼."""

    def __init__(self, name: str, description: str, parameters: dict, fn: Callable[..., Any]):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.fn = fn

    def __call__(self, **kwargs: Any) -> Any:
        return self.fn(**kwargs)

    def declaration(self) -> dict:
        """Gemini generateContent의 tools.functionDeclarations 항목 포맷."""
        return {"name": self.name, "description": self.description, "parameters": self.parameters}


def report_retriever(query: str, tags: list[str] | None = None) -> list[dict]:
    """산업 분석 리포트에서 근거를 검색한다. 채권/ETF/시장 동향 등
    특정 자산이나 시황에 대한 질문일 때 호출한다."""
    return _rr.search(turn_type="evidence", query=query, tags=tags or [])


def evidence_finder(query: str) -> list[dict]:
    """리포트만으로 부족한 최신 뉴스·속보성 질문일 때 보조로 호출한다."""
    return _ef.search_news(query)


def portfolio_builder(onboarding: dict, reports: list[dict] | None = None) -> dict:
    """사용자 온보딩 정보로 포트폴리오 비중을 계산한다.
    reports가 주어지면 근거 기반으로 세부 비중을 조정한다."""
    inp = quant.OnboardingInput(**onboarding)
    profile = quant.risk_profile(inp)
    baseline = quant.baseline_weights(profile.risk)
    proposals = gemini_agent.propose_adjustments(baseline, profile, reports or [])
    result = quant.apply_adjustments(baseline, proposals)
    return {
        "profile": profile.__dict__,
        "baseline": result.baseline.as_dict(),
        "adjusted": result.adjusted.as_dict(),
        "applied": [a.__dict__ for a in result.applied],
        "rejected": [{"adjustment": r.adjustment.__dict__, "reason": r.reason} for r in result.rejected],
    }


TOOLS: dict[str, Tool] = {
    t.name: t
    for t in [
        Tool(
            name="report_retriever",
            description=(
                "산업 분석 리포트에서 근거를 검색한다. 채권/ETF/시장 동향 등 "
                "특정 자산이나 시황에 대한 질문일 때 호출한다."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "검색할 질문/키워드"},
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "태그 필터 (선택)",
                    },
                },
                "required": ["query"],
            },
            fn=report_retriever,
        ),
        Tool(
            name="evidence_finder",
            description="리포트만으로 부족한 최신 뉴스·속보성 질문일 때 보조로 호출한다.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "검색할 뉴스 질의"},
                },
                "required": ["query"],
            },
            fn=evidence_finder,
        ),
        Tool(
            name="portfolio_builder",
            description=(
                "사용자 온보딩 정보로 포트폴리오 비중을 계산한다. "
                "reports가 주어지면 근거 기반으로 세부 비중을 조정한다."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "onboarding": {
                        "type": "object",
                        "description": (
                            "seed_money, monthly_invest, horizon(short|mid|long), "
                            "target_return(deposit|inflation|aggressive), drop20(sell|hold|buy), "
                            "mdd_pct, age(선택), monthly_income(선택)"
                        ),
                    },
                    "reports": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": "근거로 쓸 리포트 목록 (선택)",
                    },
                },
                "required": ["onboarding"],
            },
            fn=portfolio_builder,
        ),
    ]
}
