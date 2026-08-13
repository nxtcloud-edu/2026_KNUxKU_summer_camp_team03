"""tests/test_evidence_finder.py — evidence_finder 폴백 로직 테스트."""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import evidence_finder


def test_domestic_fallback_to_newsapi_when_naver_key_missing():
    """domestic 판별 + 네이버 키 없음 + NewsAPI 키 있음 → NewsAPI 호출."""
    with patch.dict("os.environ", {"NEWSAPI_KEY": "test_key", "NAVER_CLIENT_ID": "", "NAVER_CLIENT_SECRET": ""}):
        with patch("app.evidence_finder._from_newsapi", return_value=[{"title": "Fed news"}]) as mock_newsapi:
            with patch("app.evidence_finder._from_naver") as mock_naver:
                # "장기채" → domestic으로 판별됨
                result = evidence_finder.search_news("장기채 지금 살까?", "장기 국채")

    # NewsAPI가 호출됐어야 함 (폴백)
    mock_newsapi.assert_called_once()
    mock_naver.assert_not_called()
    assert result == [{"title": "Fed news"}]


def test_global_fallback_to_naver_when_newsapi_key_missing():
    """global 판별 + NewsAPI 키 없음 + 네이버 키 있음 → 네이버 호출."""
    with patch.dict("os.environ", {"NEWSAPI_KEY": "", "NAVER_CLIENT_ID": "cid", "NAVER_CLIENT_SECRET": "sec"}):
        with patch("app.evidence_finder._from_naver", return_value=[{"title": "국내 뉴스"}]) as mock_naver:
            with patch("app.evidence_finder._from_newsapi") as mock_newsapi:
                # "연준" → global로 판별됨
                result = evidence_finder.search_news("연준 금리 인하 전망", "federal reserve")

    mock_naver.assert_called_once()
    mock_newsapi.assert_not_called()
    assert result == [{"title": "국내 뉴스"}]


def test_both_keys_missing_returns_empty():
    """양쪽 키 모두 없으면 빈 리스트."""
    with patch.dict("os.environ", {"NEWSAPI_KEY": "", "NAVER_CLIENT_ID": "", "NAVER_CLIENT_SECRET": ""}):
        result = evidence_finder.search_news("장기채 전망", "장기 국채")
    assert result == []


def test_domestic_pat_matches_bond_keywords():
    """국채/장기채/단기채/회사채/크레딧이 domestic으로 분류되는지."""
    for word in ["국채", "장기채", "단기채", "회사채", "크레딧"]:
        assert evidence_finder.pick_region(f"{word} 전망") == "domestic", f"'{word}' should be domestic"


def test_normal_domestic_with_naver_key():
    """네이버 키 있으면 정상적으로 네이버 호출."""
    with patch.dict("os.environ", {"NEWSAPI_KEY": "nk", "NAVER_CLIENT_ID": "cid", "NAVER_CLIENT_SECRET": "sec"}):
        with patch("app.evidence_finder._from_naver", return_value=[{"title": "한경 뉴스"}]) as mock_naver:
            result = evidence_finder.search_news("국채 금리 전망", "국채 금리")

    mock_naver.assert_called_once_with("국채 금리")
    assert result == [{"title": "한경 뉴스"}]
