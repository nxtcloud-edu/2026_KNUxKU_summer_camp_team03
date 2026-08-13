"""product_store — 상품 데이터 로드 및 검색.

data/products.json을 로드하고, asset/tag/theme_keyword로 필터링해서
chat_agent와 persona_agent가 "상품 뭐 있어?" 류 질문에 실제 상품명을 답할 때 쓴다.
"""

from __future__ import annotations

import json
from pathlib import Path

_PRODUCTS_PATH = Path(__file__).resolve().parent.parent / "data" / "products.json"
_products_cache: list[dict] | None = None


def _load() -> list[dict]:
    global _products_cache
    if _products_cache is None:
        with open(_PRODUCTS_PATH, encoding="utf-8") as f:
            _products_cache = json.load(f)
    return _products_cache


def search_products(
    asset_hint: str | None = None,
    tag: str | None = None,
    theme_keyword: str | None = None,
    limit: int = 5,
) -> list[dict]:
    """상품 검색. 조건에 맞는 상품을 최대 limit개 반환.

    asset_hint: "cash", "govShort", "govLong", "corp", "etfPassive", "etfActive"
                또는 한국어 키워드 ("패시브", "액티브", "채권", "현금" 등)
    tag: reports.json 태그와 동일한 체계 ("채권-장기-국채" 등)
    theme_keyword: 테마 키워드 ("AI", "반도체", "2차전지" 등)
    """
    products = _load()

    # 한국어 힌트 → asset 매핑
    _HINT_MAP = {
        "현금": "cash", "현금성": "cash", "mmf": "cash", "cd": "cash",
        "단기": "govShort", "단기채": "govShort", "통안채": "govShort",
        "장기": "govLong", "장기채": "govLong", "국고채": "govLong", "10년": "govLong", "30년": "govLong",
        "회사채": "corp", "크레딧": "corp",
        "패시브": "etfPassive", "지수": "etfPassive", "인덱스": "etfPassive",
        "액티브": "etfActive", "테마": "etfActive",
    }

    resolved_asset = asset_hint
    if asset_hint and asset_hint.lower() in _HINT_MAP:
        resolved_asset = _HINT_MAP[asset_hint.lower()]

    results = []
    for p in products:
        if resolved_asset and p["asset"] != resolved_asset:
            continue
        if tag and p["tag"] != tag:
            continue
        if theme_keyword:
            kw_lower = theme_keyword.lower()
            if not any(kw_lower in tk.lower() for tk in p.get("theme_keywords", [])):
                continue
        results.append(p)
        if len(results) >= limit:
            break

    return results


def format_products_for_prompt(products: list[dict]) -> str:
    """LLM 프롬프트에 삽입할 상품 목록 텍스트."""
    if not products:
        return ""
    lines = ["## 관련 상품 목록"]
    for p in products:
        theme = f" (테마: {', '.join(p['theme_keywords'])})" if p["theme_keywords"] else ""
        lines.append(f"- {p['name']} ({p['ticker']}) · 보수 {p['fee']}% · {p['desc']}{theme}")
    return "\n".join(lines)
