"""tests/test_pii_strip.py — _strip_contact_info() 단위 테스트.

chat_agent.py에 추가된 PII 제거 함수가 이메일/전화번호를 확실히 제거하는지 확인.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.chat_agent import _strip_contact_info


def test_email_removed():
    text = "담당 애널리스트: 홍길동 analyst@kiwoom.com 리포트 문의"
    result = _strip_contact_info(text)
    assert "analyst@kiwoom.com" not in result
    assert "홍길동" in result  # 이름은 남김 (이메일만 제거)


def test_multiple_emails_removed():
    text = "kim@hana.co.kr / park.chul@samsung.com 연락 주세요"
    result = _strip_contact_info(text)
    assert "@" not in result


def test_phone_with_area_code_removed():
    text = "문의: 02-3276-6150 (직통)"
    result = _strip_contact_info(text)
    assert "02-3276-6150" not in result
    assert "직통" in result


def test_phone_short_extension_removed():
    text = "내선 2122-9206으로 연락 바랍니다."
    result = _strip_contact_info(text)
    assert "2122-9206" not in result


def test_mobile_number_removed():
    text = "담당자 연락처: 010-1234-5678"
    result = _strip_contact_info(text)
    assert "010-1234-5678" not in result


def test_mixed_pii_removed():
    text = (
        "[키움증권 · 채권분석]\n"
        "담당: 안예하 ahn.yeha@kiwoom.com\n"
        "Tel: 02-2122-9206\n"
        "금리 인하 시 장기채 매력도 상향."
    )
    result = _strip_contact_info(text)
    assert "@" not in result
    assert "2122-9206" not in result
    assert "금리 인하 시 장기채 매력도 상향" in result


def test_clean_text_unchanged():
    text = "장기 국채 매력도가 상향됐다는 관점을 제시합니다."
    assert _strip_contact_info(text) == text


def test_answer_integration_strips_pii():
    """answer() 경로에서도 PII가 제거되는지 — 폴백 경로 테스트."""
    from unittest.mock import patch
    from app.chat_agent import answer

    reports = [{
        "id": "R-1",
        "title": "채권 전망",
        "house": "키움증권",
        "date": "2026-08-13",
        "summary": ["금리 인하 전망. 문의: analyst@kiwoom.com 02-2122-9206"],
        "excerpt": "장기채 매력도 상향. 연락처: test@example.com",
    }]

    # LLM 실패시키면 _template_answer로 폴백
    with patch("app.chat_agent._call_gemini", side_effect=RuntimeError("test")):
        text, used_llm = answer("금리 전망?", reports)

    assert used_llm is False
    assert "@" not in text
    assert "2122-9206" not in text
