"""agent_tools 테스트 — 도구 3개가 기존 모듈을 그대로 호출하는지만 확인한다
(mock). Supervisor 전체 흐름(LLM 호출 루프)은 이 단계에서 다루지 않는다."""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import agent_tools


def test_report_retriever_delegates_to_report_retriever_search():
    with patch("app.agent_tools._rr.search", return_value=[{"id": "R-1"}]) as mock_search:
        result = agent_tools.report_retriever("장기채 전망", tags=["채권-장기-국채"])

    mock_search.assert_called_once_with(
        turn_type="evidence", query="장기채 전망", tags=["채권-장기-국채"]
    )
    assert result == [{"id": "R-1"}]


def test_report_retriever_defaults_tags_to_empty_list():
    with patch("app.agent_tools._rr.search", return_value=[]) as mock_search:
        agent_tools.report_retriever("금리 전망")

    mock_search.assert_called_once_with(turn_type="evidence", query="금리 전망", tags=[])


def test_evidence_finder_delegates_to_search_news():
    with patch("app.agent_tools._ef.search_news", return_value=[{"title": "뉴스"}]) as mock_news:
        result = agent_tools.evidence_finder("금통위 뉴스")

    mock_news.assert_called_once_with("금통위 뉴스")
    assert result == [{"title": "뉴스"}]


def test_portfolio_builder_delegates_to_quant_and_gemini_agent():
    onboarding = dict(
        seed_money=10_000_000,
        monthly_invest=500_000,
        horizon="long",
        target_return="aggressive",
        drop20="hold",
        mdd_pct=25,
        age=28,
    )
    reports = [{"id": "R-1", "title": "리포트"}]

    with patch(
        "app.agent_tools.gemini_agent.propose_adjustments", return_value=[]
    ) as mock_propose:
        result = agent_tools.portfolio_builder(onboarding, reports=reports)

    # 기준 비중(2단계, 순수 연산)까지 계산된 뒤 Gemini에 넘겨졌는지 확인
    assert mock_propose.call_count == 1
    _, call_kwargs = mock_propose.call_args
    passed_reports = mock_propose.call_args.args[2] if mock_propose.call_args.args else call_kwargs.get("reports")
    assert passed_reports == reports

    assert sum(result["baseline"].values()) == 100
    assert sum(result["adjusted"].values()) == 100
    assert result["applied"] == []
    assert result["rejected"] == []
    assert "risk" in result["profile"]


def test_portfolio_builder_defaults_reports_to_empty_list():
    onboarding = dict(
        seed_money=1_000_000,
        monthly_invest=100_000,
        horizon="short",
        target_return="deposit",
        drop20="sell",
        mdd_pct=10,
    )

    with patch(
        "app.agent_tools.gemini_agent.propose_adjustments", return_value=[]
    ) as mock_propose:
        agent_tools.portfolio_builder(onboarding)

    passed_reports = mock_propose.call_args.args[2]
    assert passed_reports == []
