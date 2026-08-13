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

from app.main import app  # noqa: E402  — import 시점에 main.py가 load_dotenv()를 돌린다
from app import triage  # noqa: E402

# 키를 비워 LLM 폴백 경로를 강제한다. import *뒤에* 지워야 한다 — 앞에서 지우면
# main.py의 load_dotenv()가 .env에서 다시 채워 넣어 테스트 격리가 깨진다.
os.environ.pop("GEMINI_API_KEY", None)

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


# ── 관련성 게이트 + 뉴스 소스 라우팅 ─────────────────────
def test_off_topic_is_blocked_without_search():
    res = ask("오늘 점심 뭐 먹지?")
    assert res["turn_type"] == "off_topic"
    assert res["evidence"] == [] and res["used_llm"] is False


def test_followup_is_not_blocked_by_topic_gate():
    r1 = ask("장기채 전망 어때?")
    r2 = ask("그럼 왜?", r1["session_id"])
    assert r2["turn_type"] != "off_topic"
    assert r2["evidence"]


def test_news_region_routing():
    from app.evidence_finder import pick_region
    assert pick_region("연준 금리 인하 관련 뉴스") == "global"
    assert pick_region("금통위 국고채 소식") == "domestic"


def test_news_returns_empty_without_keys():
    from unittest.mock import patch
    from app.evidence_finder import search_news
    # 양쪽 키 모두 없을 때 빈 리스트
    with patch.dict("os.environ", {"NEWSAPI_KEY": "", "NAVER_CLIENT_ID": "", "NAVER_CLIENT_SECRET": ""}):
        assert search_news("금통위 금리") == []


# ── 가드레일 완화 검증 ───────────────────────────────────
def test_buy_thinking_is_answered_not_nagged():
    # '뭐 사' 고민 — 잔소리 없이 근거를 들고 답한다. DECISION_PAT이 잡아
    # decision(의사결정형)으로 가되, "근거 없이 답 안 한다" 원칙은 그대로다.
    res = ask("나 뭐사")
    assert res["turn_type"] in ("market", "evidence", "decision")
    assert res["evidence"]


def test_news_question_passes_topic_gate():
    res = ask("오늘 나온 뉴스 있어?")  # '뉴스'가 금융 어휘로 인정됨
    assert res["turn_type"] != "off_topic"


def test_issue_question_passes_topic_gate():
    # "이슈"류 넓은 질문도 막지 않는다 (FINANCE_VOCAB에 이슈/동향/소식 추가)
    res = ask("오늘 뭐가 이슈야")
    assert res["turn_type"] != "off_topic"


# ── 의사결정형 라우팅 (팀원의 두 전문가 토론 붙기 전 임시 대체) ──
def test_decision_question_routes_and_uses_evidence():
    res = ask("국채 비중을 지금 늘릴까 말까 고민이에요")
    assert res["turn_type"] == "decision"
    assert res["evidence"]  # decision_agent도 근거 없이 답하지 않는다
