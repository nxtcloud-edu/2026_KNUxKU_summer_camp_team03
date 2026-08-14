"""tests/test_persona.py — 훈수 탭(persona) 단위 테스트.

테스트 항목:
1. 페르소나 3개가 서로 다른 텍스트를 반환하는지 (mock LLM)
2. sanitize_output이 한 번만 적용되는지
3. 리포트 0건일 때 NO_EVIDENCE_FALLBACK 반환
4. 훈수 탭 세션이 리서치 탭의 seen_report_ids에 영향 안 주는지
5. LLM 부분 실패 시에도 나머지 페르소나 응답이 살아있는지
6. 모든 LLM 실패 시 used_llm=False
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# backend/ 디렉토리를 sys.path에 추가해서 app 패키지를 import할 수 있게 한다
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# ── 테스트 데이터 ───────────────────────────────────────────────
_SAMPLE_REPORTS = [
    {
        "id": "R-001",
        "title": "국채 금리 전망",
        "house": "테스트증권",
        "date": "2026-08-13",
        "category": "debenture",
        "tags": ["채권-장기-국채", "금리"],
        "summary": ["금리 인하 전망"],
        "excerpt": "한국은행이 연내 25bp 인하를 시사했다.",
        "published": True,
    },
    {
        "id": "R-002",
        "title": "ETF 시장 동향",
        "house": "모의증권",
        "date": "2026-08-12",
        "category": "invest",
        "tags": ["ETF-패시브-지수"],
        "summary": ["패시브 ETF 자금 유입 최대"],
        "excerpt": "올해 패시브 ETF 순유입이 역대 최고치를 기록.",
        "published": True,
    },
]


# ── 1. 페르소나 3개가 서로 다른 텍스트를 반환 ─────────────────
@patch("app.persona_agent._call_gemini_for_persona")
def test_three_personas_return_different_text(mock_call):
    """각 페르소나에 대해 다른 dict가 조립되는지 확인."""
    mock_call.side_effect = [
        "안전마진 관점에서 금리 인하는 장기채 가격 회복 가능성을 높입니다.",
        "사이클 전환 초기 국면이라 장기채 비중을 확대할 시점입니다.",
        "방어만 하면 기회비용이 큽니다. 성장 테마 비중도 고려하세요.",
    ]

    from app.persona_agent import answer_persona

    personas_list, used_llm = answer_persona("금리 인하되면 어떻게 해야 하나요?", _SAMPLE_REPORTS)

    assert used_llm is True
    assert len(personas_list) == 3

    # 각 dict에 필수 키가 있는지
    for d in personas_list:
        assert "persona" in d
        assert "label" in d
        assert "emoji" in d
        assert "message" in d
        assert "evidence" in d

    # 세 응답이 모두 다름
    messages = [d["message"] for d in personas_list]
    assert len(set(messages)) == 3

    # 개별 페르소나 확인
    assert "안전마진" in personas_list[0]["message"]
    assert "사이클 전환" in personas_list[1]["message"]
    assert "기회비용" in personas_list[2]["message"]

    # 페르소나 이름 확인
    assert personas_list[0]["persona"] == "워런 버핏"
    assert personas_list[1]["persona"] == "레이 달리오"
    assert personas_list[2]["persona"] == "캐시 우드"


# ── 2. sanitize_output이 한 번만 적용되는지 ──────────────────
@patch("app.persona_agent._call_gemini_for_persona")
def test_sanitize_applied_once(mock_call):
    """'추천합니다'가 '해설해 드립니다'로 한 번만 치환되는지."""
    mock_call.side_effect = [
        "이 상품을 추천합니다.",  # sanitize 대상
        "정상 답변입니다.",
        "괜찮은 선택입니다.",
    ]

    from app.persona_agent import answer_persona

    personas_list, _ = answer_persona("ETF 뭐가 좋아요?", _SAMPLE_REPORTS)

    # 첫 번째 페르소나의 message에서 치환 확인
    assert "추천합니다" not in personas_list[0]["message"]
    assert "해설해 드립니다" in personas_list[0]["message"]


# ── 3. 리포트 0건 → NO_EVIDENCE_FALLBACK ────────────────────
def test_no_reports_returns_fallback():
    """report_retriever가 0건을 반환하면 supervisor가 폴백 응답."""
    from app.chat_schemas import ChatRequest
    from app.guardrails import NO_EVIDENCE_FALLBACK

    with patch("app.supervisor.report_retriever") as mock_rr:
        mock_rr.search.return_value = []

        from app.supervisor import _handle_persona

        req = ChatRequest(message="국채 금리 전망 어때?", mode="persona")
        resp = _handle_persona(req)

    assert resp.text == NO_EVIDENCE_FALLBACK
    assert resp.personas is None
    assert resp.used_llm is False
    assert resp.turn_type == "persona"


# ── 4. 훈수 탭 세션이 리서치 탭에 영향 안 주는지 ─────────────
def test_persona_session_scope_isolation():
    """같은 session_id로 chat/persona를 보내도 seen_report_ids가 별도."""
    from app.session_store import store

    # 세션 초기화
    store._sessions.clear()

    # 리서치 탭 세션
    chat_sess = store.get_or_create("user123")
    chat_sess.seen_report_ids.add("R-001")

    # 훈수 탭 세션 (":persona" 접미어)
    persona_sess = store.get_or_create("user123:persona")
    persona_sess.seen_report_ids.add("R-002")

    # 서로 독립적
    assert "R-001" in chat_sess.seen_report_ids
    assert "R-002" not in chat_sess.seen_report_ids
    assert "R-002" in persona_sess.seen_report_ids
    assert "R-001" not in persona_sess.seen_report_ids

    # 세션 ID도 다름
    assert chat_sess.session_id != persona_sess.session_id


# ── 5. LLM 부분 실패 시 나머지 살아있는지 ────────────────────
@patch("app.persona_agent._call_gemini_for_persona")
def test_partial_llm_failure(mock_call):
    """첫 번째 페르소나가 실패해도 나머지 둘의 응답은 포함된다."""
    mock_call.side_effect = [
        RuntimeError("API 키 만료"),  # 워런 버핏 실패
        "사이클 관점에서 좋은 진입 시점입니다.",
        "성장 테마로 비중 확대를 고려하세요.",
    ]

    from app.persona_agent import answer_persona

    personas_list, used_llm = answer_persona("장기채 비중 늘릴까?", _SAMPLE_REPORTS)

    assert used_llm is True  # 하나라도 성공했으므로 True
    assert personas_list[0]["message"] == "지금 답변을 만들지 못했어요."  # 실패한 자리
    assert "사이클 관점" in personas_list[1]["message"]  # 레이 달리오 성공
    assert "성장 테마" in personas_list[2]["message"]  # 캐시 우드 성공


# ── 6. 모든 LLM 실패 시 used_llm=False ──────────────────────
@patch("app.persona_agent._call_gemini_for_persona")
def test_all_llm_failure(mock_call):
    """셋 다 실패하면 used_llm=False."""
    mock_call.side_effect = [
        RuntimeError("실패1"),
        RuntimeError("실패2"),
        RuntimeError("실패3"),
    ]

    from app.persona_agent import answer_persona

    personas_list, used_llm = answer_persona("금리 전망?", _SAMPLE_REPORTS)

    assert used_llm is False
    for d in personas_list:
        assert d["message"] == "지금 답변을 만들지 못했어요."


# ── 7. concept 질문은 리서치 탭으로 리다이렉트 ────────────────
def test_concept_question_redirects_to_research_tab():
    """훈수 탭에서 개념/용어 질문을 하면 redirect 응답이 나온다."""
    from app.chat_schemas import ChatRequest
    from app.supervisor import _handle_persona

    req = ChatRequest(message="듀레이션이 뭐야?", mode="persona")
    resp = _handle_persona(req)

    assert resp.turn_type == "redirect"
    assert resp.used_llm is False
    assert resp.personas == []
    assert "리서치 탭" in resp.text


# ── 8. target_persona 단일 호출 ───────────────────────────────
@patch("app.persona_agent._call_gemini_for_persona")
def test_single_persona_returns_only_one(mock_call):
    """target_persona 지정 시 해당 페르소나만 반환."""
    mock_call.return_value = "장기채 비중은 괜찮아 보여요."

    from app.persona_agent import answer_single_persona

    results, used_llm = answer_single_persona(
        "워런 버핏", "장기채 비중 어때?", _SAMPLE_REPORTS)

    assert used_llm is True
    assert len(results) == 1
    assert results[0]["persona"] == "워런 버핏"
    assert results[0]["label"] == "가치투자"
    assert "괜찮아" in results[0]["message"]


@patch("app.persona_agent._call_gemini_for_persona")
def test_single_persona_with_history(mock_call):
    """persona_history가 프롬프트에 반영되는지."""
    mock_call.return_value = "이전 대화를 이어서요."

    from app.persona_agent import answer_single_persona

    history = [
        {"role": "user", "text": "채권 비중 높은 거 어때?"},
        {"role": "assistant", "text": "조금 줄이는 게 좋겠어요."},
    ]
    results, _ = answer_single_persona(
        "레이 달리오", "그럼 얼마나 줄여?", _SAMPLE_REPORTS, history=history)

    assert len(results) == 1
    assert results[0]["persona"] == "레이 달리오"
    # _call_gemini_for_persona에 전달된 프롬프트에 history가 포함되었는지
    call_args = mock_call.call_args[0]
    user_prompt = call_args[1]
    assert "이전 대화" in user_prompt
    assert "채권 비중 높은 거 어때?" in user_prompt


def test_single_persona_unknown_name():
    """존재하지 않는 페르소나명이면 에러 메시지."""
    from app.persona_agent import answer_single_persona

    results, used_llm = answer_single_persona(
        "존재안함", "질문", _SAMPLE_REPORTS)

    assert used_llm is False
    assert len(results) == 1
    assert "찾지 못했어요" in results[0]["message"]
