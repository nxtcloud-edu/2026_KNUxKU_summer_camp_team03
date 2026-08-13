"""
3단계 · 에이전트 델타 제안 (Gemini API)

이 파일이 하는 일은 딱 하나다 — 오늘의 근거 리포트를 읽고
{asset, delta_pp, evidence_report_id, reason} 목록을 "제안"하는 것.

이 파일이 절대 하지 않는 일:
    - 최종 배분 숫자를 계산하지 않는다 (quant.apply_adjustments가 한다)
    - ±10%p 클램프를 신뢰하지 않는다 (quant.py가 다시 검증한다)
    - evidence_report_id 없는 제안을 스스로 걸러내려 하지 않는다
      (걸러내는 건 quant.apply_adjustments의 책임 — 이 파일은 그냥 통과시킨다)

즉 이 파일이 이상한 값을 뱉어도 서비스가 안전한 이유는
quant.py가 마지막에 한 번 더 검증하기 때문이다.
"""

from __future__ import annotations

import json
import os
from typing import Optional

import requests

from .guardrails import sanitize_output
from .quant import Adjustment, RiskProfile, Weights

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_ENDPOINT = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)

# 델타 제안 개수 상한 — 폭주 방지용 안전장치 (코드 레벨)
MAX_PROPOSALS = 4

SYSTEM_INSTRUCTION = """너는 퀀트 자산관리 보조 에이전트다. 아래 규칙을 반드시 지켜라.

1. 너는 최종 숫자를 정하지 않는다. 기준 비중에서 얼마나(±%p) 움직이자는
   "제안"만 한다. 실제 반영 여부와 한도 적용은 별도 코드가 처리한다.
2. 제안하는 모든 항목은 evidence_report_id를 반드시 포함해야 한다.
   주어진 리포트 목록에 없는 id를 지어내면 안 된다.
   근거가 없다고 판단되면 그 항목은 아예 제안하지 마라.
3. asset은 대분류가 아니라 세부분류 중 하나만 쓴다:
   "cash", "etf_passive"(패시브 ETF), "etf_active"(액티브 ETF),
   "bond_short"(단기채), "bond_long"(장기채), "bond_corp"(우량 회사채).
4. delta_pp는 -10에서 10 사이 정수로 제안한다 (그 밖의 값을 내도
   서버가 자동으로 잘라내지만, 처음부터 범위 안에서 제안하라).
   한쪽을 줄이자고 제안하면, 보통 같은 근거로 다른 세부분류를 그만큼
   늘리는 짝 제안을 함께 낸다 (예: etf_passive -6 / bond_long +6).
5. reason은 왜 이 조정을 제안하는지 1~2문장, 한국어로, 아래 표현을 지켜라:
   - "확실시", "무조건", "오를 것이다" 같은 단정적 표현 금지 → "전망", "가능성" 사용
   - "사세요", "매수하세요", "매도하세요" 같은 직접 지시 금지
   - "추천"이라는 단어 대신 "관점을 제시한다", "~로 보인다" 사용
6. 조정할 근거가 부족하면 adjustments를 빈 배열로 반환해도 된다.
   억지로 조정을 만들어내지 마라.

반드시 아래 JSON 스키마만 출력한다. 다른 텍스트를 절대 포함하지 마라."""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "adjustments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "asset": {
                        "type": "string",
                        "enum": [
                            "cash", "etf_passive", "etf_active",
                            "bond_short", "bond_long", "bond_corp",
                        ],
                    },
                    "delta_pp": {"type": "number"},
                    "evidence_report_id": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["asset", "delta_pp", "evidence_report_id", "reason"],
            },
        }
    },
    "required": ["adjustments"],
}


def _format_report(r: dict) -> str:
    # mock.ts의 Report 필드명을 그대로 따른다: house(증권사), summary(3줄 배열), excerpt(원문 발췌)
    house = r.get("house") or "출처 미상"
    summary = " / ".join(r.get("summary") or [])
    excerpt = r.get("excerpt") or ""
    tags = ", ".join(r.get("tags") or [])
    return (
        f"- id: {r['id']} | {house} | 태그: {tags}\n"
        f"  제목: {r['title']}\n"
        f"  요약: {summary}\n"
        f"  발췌: {excerpt}"
    )


def _build_prompt(baseline: Weights, profile: RiskProfile, reports: list[dict]) -> str:
    reports_block = "\n".join(_format_report(r) for r in reports) or (
        "(오늘 제공된 리포트가 없습니다 — 이 경우 adjustments는 빈 배열이어야 합니다)"
    )

    return f"""[사용자 위험 프로필]
capacity(객관): {profile.capacity}점 / tolerance(주관): {profile.tolerance}점 / risk: {profile.risk}점

[기준 비중 (2단계 계산 결과, 이미 확정됨 — 대분류 자체는 건드릴 수 없다)]
현금성 {baseline.cash}%
ETF {baseline.etf_total}% (패시브 {baseline.etf_passive}% · 액티브 {baseline.etf_active}%)
채권 {baseline.bond_total}% (장기 {baseline.bond_long}% · 단기 {baseline.bond_short}% · 회사채 {baseline.bond_corp}%)

[오늘의 근거 리포트 후보]
{reports_block}

위 리포트들을 검토해서, 세부분류(패시브/액티브/장기채/단기채) 단위로 조정할 만한
근거가 있으면 JSON 스키마에 맞춰 제안하라. 없으면 adjustments를 빈 배열로 반환하라."""


class GeminiAgentError(Exception):
    pass


def _call_gemini(prompt: str) -> dict:
    if not GEMINI_API_KEY:
        raise GeminiAgentError("GEMINI_API_KEY가 설정되지 않았습니다 (.env 확인)")

    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
        },
    }

    resp = requests.post(
        GEMINI_ENDPOINT,
        params={"key": GEMINI_API_KEY},
        json=body,
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        raise GeminiAgentError(f"Gemini 응답 형식이 예상과 다릅니다: {data}") from exc

    return json.loads(text)


def propose_adjustments(
    baseline: Weights,
    profile: RiskProfile,
    reports: list[dict],
) -> list[Adjustment]:
    """Gemini에게 델타 제안을 요청한다.

    실패(네트워크 오류, 파싱 실패, 스키마 위반 등)하면 빈 리스트를 반환한다 —
    "근거 없으면 조정하지 않는다"는 원칙과 동일한 방향의 안전한 실패다.
    호출부(main.py)에서 이 함수가 예외를 던지지 않는다는 걸 전제로 짜도 된다.
    """
    prompt = _build_prompt(baseline, profile, reports)

    try:
        parsed = _call_gemini(prompt)
    except (GeminiAgentError, requests.RequestException, json.JSONDecodeError) as exc:
        # 에이전트 호출 실패는 "조정 없음"으로 처리한다. 조작된 숫자를
        # 화면에 내보내는 것보다, 기준 비중을 그대로 보여주는 게 안전하다.
        print(f"[gemini_agent] propose_adjustments 실패, 조정 없이 진행: {exc}")
        return []

    raw_list = parsed.get("adjustments", [])[:MAX_PROPOSALS]

    adjustments: list[Adjustment] = []
    valid_report_ids = {r["id"] for r in reports}

    for item in raw_list:
        asset = item.get("asset")
        if asset not in ("cash", "etf_passive", "etf_active", "bond_short", "bond_long", "bond_corp"):
            continue  # 스키마를 벗어난 항목은 조용히 버린다

        evidence_id: Optional[str] = item.get("evidence_report_id")
        # 모델이 지어낸 id는 여기서 무효화한다 — quant.apply_adjustments가
        # evidence_report_id 누락으로 보고 자동 폐기하도록 None으로 만든다.
        if evidence_id not in valid_report_ids:
            evidence_id = None

        try:
            delta_pp = float(item.get("delta_pp", 0))
        except (TypeError, ValueError):
            continue

        # 모델이 시스템 지시를 어기고 "확실시"/"추천" 같은 표현을 써도
        # 여기서 한 번 더 치환한다 — 프롬프트 지시는 보장이 아니라 힌트일 뿐이다.
        reason = sanitize_output(str(item.get("reason", "")))

        adjustments.append(
            Adjustment(
                asset=asset,
                delta_pp=delta_pp,
                reason=reason,
                evidence_report_id=evidence_id,
            )
        )

    return adjustments
