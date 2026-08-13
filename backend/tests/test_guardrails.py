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
