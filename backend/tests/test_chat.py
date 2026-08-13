"""챗 백엔드 테스트 — LLM 없이(키 미설정) 전 경로가 살아있는지 확인한다.

원칙 검증이 목적이다:
  - 가드레일이 라우팅보다 먼저 선다
  - 근거 0건이면 생성하지 않는다 (고정 폴백)
  - LLM이 죽어도(키 없음) 템플릿 폴백으로 답이 나간다
  - 세션이 이전 턴을 기억한다 (후속 질문 재구성)
"""

import os

import pytest
from fastapi.testclient import TestClient

# 키를 비워 LLM 폴백 경로를 강제한다
os.environ.pop("GEMINI_API_KEY", None)

from app.main import app  # noqa: E402
from app import triage  # noqa: E402

client = TestClient(app)

PROFILE = {"capacity": 55, "tolerance": 70, "risk": 64, "literacy_level": "beginner"}


def ask(message, session_id=None, profile=None):
    body = {"message": message}
    if session_id:
        body["session_id"] = session_id
    if profile:
        body["profile"] = profile
    r = client.post("/api/chat", json=body)
    assert r.status_code == 200
    return r.json()


# ── 가드레일 ──────────────────────────────────────────────
def test_out_of_scope_is_denied_before_search():
    res = ask("비트코인 사도 돼?")
    assert res["turn_type"] == "blocked"
    assert res["evidence"] == []
    assert res["used_llm"] is False


def test_order_request_switches_to_explain_mode():
    res = ask("금리가 내리면 뭘 사야 하나요?")
    assert res["notice"]  # 해설 모드 안내가 붙는다
    assert res["turn_type"] == "market"


# ── 버튼 파싱 (FE SUGGESTS 정확 매칭) ─────────────────────
@pytest.mark.parametrize("button,expected", [
    ("ETF 패시브랑 액티브 차이가 뭐예요?", "concept"),
    ("국채랑 회사채 중에 뭐가 안전해요?", "concept"),
    ("이제 막 시작하는데 뭐부터 해요?", "concept"),
    ("내 비중은 어떻게 되나요?", "portfolio"),
    ("금리가 내리면 뭘 사야 하나요?", "market"),
])
def test_buttons_route_exactly(button, expected):
    plan = triage.classify(button)
    assert plan.turn_type == expected


# ── 개념형 = 용어 사전, LLM 0회 ──────────────────────────
def test_concept_answers_from_glossary_without_llm():
    res = ask("회사채가 뭐야?")
    assert res["turn_type"] == "concept"
    assert res["used_llm"] is False
    assert "차용증" in res["text"]  # beginner 해설
    assert res["evidence"], "관련 리포트 연결이 있어야 한다"


def test_concept_respects_literacy_level():
    adv = dict(PROFILE, literacy_level="advanced")
    res = ask("회사채가 뭐야?", profile=adv)
    assert "스프레드" in res["text"]  # advanced 해설


# ── 포트폴리오형 = 개인화, LLM 0회 ───────────────────────
def test_portfolio_question_uses_profile():
    res = ask("내 비중은 어떻게 되나요?", profile=PROFILE)
    assert res["turn_type"] == "portfolio"
    assert res["used_llm"] is False


def test_portfolio_without_profile_guides_onboarding():
    res = ask("내 비중은 어떻게 되나요?")
    assert "성향" in res["text"]


# ── 시장정세형 = 4보드 교차 + LLM 폴백 생존 ──────────────
def test_market_question_finds_cross_board_evidence():
    res = ask("요즘 채권 시장 분위기 어때?")
    assert res["turn_type"] == "market"
    assert len(res["evidence"]) >= 2
    # 키가 없으니 템플릿 폴백 — 그래도 근거 붙은 답이 나간다
    assert res["used_llm"] is False
    assert "리포트" in res["text"]


# ── 근거 0건 = 고정 폴백, 생성 금지 ──────────────────────
def test_no_evidence_returns_fixed_fallback():
    res = ask("장기채 콰트로치즈와퍼 수익률")
    if not res["evidence"]:
        assert "근거 없이" in res["text"] or "확인하지 못했" in res["text"]


# ── 멀티턴: 세션이 이전 턴을 기억한다 ────────────────────
def test_followup_inherits_previous_topic():
    first = ask("장기채 금리 전망 어때?")
    sid = first["session_id"]
    second = ask("그럼 왜 그런 거야?", session_id=sid)
    assert second["session_id"] == sid
    # 이전 턴의 채권/금리 주제를 이어받아 검색된다
    assert second["evidence"], "후속 질문도 이전 주제 태그로 근거를 찾아야 한다"


def test_new_session_issued_when_absent():
    res = ask("채권이 뭐야?")
    assert res["session_id"]
