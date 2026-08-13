"""tests/test_products.py — 상품 검색 및 프롬프트 주입 테스트."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.product_store import search_products, format_products_for_prompt
from app.chat_agent import _detect_product_query


def test_search_etf_passive():
    results = search_products(asset_hint="etfPassive")
    assert len(results) >= 1
    assert all(r["asset"] == "etfPassive" for r in results)
    names = [r["name"] for r in results]
    assert any("S&P500" in n or "200" in n for n in names)


def test_search_etf_active_by_theme():
    results = search_products(asset_hint="etfActive", theme_keyword="AI")
    assert len(results) >= 1
    assert all("AI" in " ".join(r["theme_keywords"]) or "인공지능" in " ".join(r["theme_keywords"]) for r in results)


def test_search_cash():
    results = search_products(asset_hint="cash")
    assert len(results) >= 1
    assert all(r["asset"] == "cash" for r in results)


def test_search_with_korean_hint():
    results = search_products(asset_hint="패시브")
    assert len(results) >= 1
    assert all(r["asset"] == "etfPassive" for r in results)


def test_search_no_match():
    results = search_products(theme_keyword="존재하지않는테마")
    assert results == []


def test_format_products_for_prompt():
    prods = search_products(asset_hint="etfPassive", limit=2)
    text = format_products_for_prompt(prods)
    assert "## 관련 상품 목록" in text
    assert prods[0]["name"] in text


def test_detect_product_query_passive_etf():
    result = _detect_product_query("패시브 ETF 뭐 있어?")
    assert result is not None
    assert result.get("asset_hint") == "etfPassive"


def test_detect_product_query_theme():
    result = _detect_product_query("AI 관련 상품 뭐 있어?")
    assert result is not None
    assert result.get("theme_keyword") == "AI"


def test_detect_product_query_no_match():
    result = _detect_product_query("금리 인하 전망 알려줘")
    assert result is None


def test_detect_product_query_generic():
    result = _detect_product_query("상품 목록 보여줘")
    assert result is not None
    assert result.get("asset_hint") is None  # 전체 검색
