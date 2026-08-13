import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import guardrails


def test_out_of_scope_denied():
    v = guardrails.check_input("비트코인 지금 사야 할까요?")
    assert v.mode == "deny"


def test_order_request_reinterpreted_as_explain():
    v = guardrails.check_input("국고채 ETF 지금 사도 돼요?")
    assert v.mode == "explain"


def test_prediction_request_reinterpreted_as_explain():
    v = guardrails.check_input("금리 내리면 확실히 오를까요?")
    assert v.mode == "explain"


def test_ok_for_neutral_question():
    v = guardrails.check_input("듀레이션이 뭐예요?")
    assert v.mode == "ok"


def test_sanitize_output_replaces_forbidden_phrases():
    text = "이 상품을 추천합니다. 금리 인하가 확실시됩니다."
    out = guardrails.sanitize_output(text)
    assert "추천합니다" not in out
    assert "확실시됩니다" not in out
    assert "해설해 드립니다" in out
    assert "전망합니다" in out


def test_sanitize_output_is_idempotent_on_clean_text():
    text = "장기 국채 매력도가 상향됐다는 관점을 제시합니다."
    assert guardrails.sanitize_output(text) == text


# ── 어간 변형 커버 테스트 (정규식 전환 후 추가) ──────────────────

import pytest


@pytest.mark.parametrize("text", [
    "국고채 사도 될까?",
    "국고채 사도 되나요?",
    "사도 되나 물어보는 거예요",
    "지금 매수할까?",
    "매수하면 괜찮을까요?",
    "매도할까 고민돼",
    "매도하면 어떨까",
    "장기채 팔면 돼?",
    "팔아도 괜찮을까",
    "사면 될까요?",
    "사면 돼?",
    "ETF 살까요?",
    "사야 할까요?",
    "국채 추천해줘",
    "골라줘",
    "종목 찍어 줘",
])
def test_order_variants_trigger_explain(text):
    v = guardrails.check_input(text)
    assert v.mode == "explain", f"'{text}' should be explain, got {v.mode}"


@pytest.mark.parametrize("text", [
    "금리 오르나요?",
    "채권 가격 오를까요?",
    "내리나요 앞으로?",
    "내릴까요?",
    "이거 확실해요?",
    "수익 보장되나요?",
    "무조건 오른다면서요?",
])
def test_prediction_variants_trigger_explain(text):
    v = guardrails.check_input(text)
    assert v.mode == "explain", f"'{text}' should be explain, got {v.mode}"


def test_neutral_not_affected_by_regex():
    """정규식이 너무 넓지 않은지 — 일반 금융 질문은 ok."""
    neutrals = [
        "듀레이션이 뭐예요?",
        "금리 인하 전망이 궁금해요",
        "장기채와 단기채 차이는?",
        "요즘 시장 분위기 어때?",
    ]
    for text in neutrals:
        v = guardrails.check_input(text)
        assert v.mode == "ok", f"'{text}' should be ok, got {v.mode}"
