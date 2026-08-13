"""
Quill 백엔드 — 3단계 추천 알고리즘

프론트(quant.ts)는 1~2단계를 클라이언트에서 즉시 계산한다 (슬라이더 반응성 때문).
이 서버는:
  1) 서버 신뢰 기준으로 1~2단계를 다시 계산하고 (클라이언트 값을 그대로 믿지 않음)
  2) 그 기준 비중을 가지고 Gemini에게 3단계 델타 제안을 요청하고
  3) quant.apply_adjustments로 검증·클램프·정규화한 최종 결과만 돌려준다.

실행:
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import quant
from .chat_schemas import ChatRequest, ChatResponse
from .chat_service import handle as handle_chat
from .gemini_agent import propose_adjustments
from .guardrails import DISCLAIMER
from .schemas import (
    AdjustmentSchema,
    OnboardingInputSchema,
    RecommendRequest,
    RecommendResponse,
    RejectedAdjustmentSchema,
    RiskProfileResponse,
    RiskProfileSchema,
    WeightsSchema,
)

app = FastAPI(title="Quill · 추천 알고리즘 API", version="0.1.0")

_allowed_origin = os.environ.get("ALLOWED_ORIGIN", "http://localhost:5174")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_allowed_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _to_onboarding_input(s: OnboardingInputSchema) -> quant.OnboardingInput:
    return quant.OnboardingInput(
        seed_money=s.seed_money,
        monthly_invest=s.monthly_invest,
        horizon=s.horizon,
        target_return=s.target_return,
        drop20=s.drop20,
        mdd_pct=s.mdd_pct,
        age=s.age,
        monthly_income=s.monthly_income,
    )


def _weights_to_schema(w: quant.Weights) -> WeightsSchema:
    return WeightsSchema(
        cash=w.cash,
        etf_passive=w.etf_passive,
        etf_active=w.etf_active,
        bond_short=w.bond_short,
        bond_long=w.bond_long,
        bond_corp=w.bond_corp,
        etf_total=w.etf_total,
        bond_total=w.bond_total,
    )


def _profile_to_schema(p: quant.RiskProfile) -> RiskProfileSchema:
    return RiskProfileSchema(
        capacity=p.capacity, tolerance=p.tolerance, risk=p.risk, gap_warning=p.gap_warning
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/risk-profile", response_model=RiskProfileResponse)
def compute_risk_profile(body: OnboardingInputSchema):
    """1~2단계 서버 재계산 — 프론트 값 검증이나 마이페이지 재조회 등에 사용."""
    inp = _to_onboarding_input(body)
    profile = quant.risk_profile(inp)
    baseline = quant.baseline_weights(profile.risk)
    explain = quant.explain_baseline(profile, baseline)

    return RiskProfileResponse(
        profile=_profile_to_schema(profile),
        baseline=_weights_to_schema(baseline),
        explain=explain,
    )


@app.post("/api/portfolio/recommend", response_model=RecommendResponse)
def recommend(body: RecommendRequest):
    """3단계 — 기준 비중 재산출 → Gemini 델타 제안 → 코드 검증까지 한 번에."""
    inp = _to_onboarding_input(body.onboarding)
    profile = quant.risk_profile(inp)
    baseline = quant.baseline_weights(profile.risk)

    reports_payload = [r.model_dump() for r in body.reports]

    try:
        proposals = propose_adjustments(baseline, profile, reports_payload)
    except Exception as exc:  # noqa: BLE001 — 마지막 방어선, 절대 500으로 죽이지 않는다
        # gemini_agent 내부에서 이미 대부분의 예외를 흡수하지만, 혹시 모를
        # 예상 밖 예외까지 여기서 한 번 더 막는다. 실패해도 기준 비중은 살아있다.
        print(f"[main] propose_adjustments 예상 밖 실패, 조정 없이 진행: {exc}")
        proposals = []

    result = quant.apply_adjustments(baseline, proposals)

    return RecommendResponse(
        profile=_profile_to_schema(profile),
        baseline=_weights_to_schema(result.baseline),
        adjusted=_weights_to_schema(result.adjusted),
        applied=[
            AdjustmentSchema(
                asset=a.asset,
                delta_pp=a.delta_pp,
                reason=a.reason,
                evidence_report_id=a.evidence_report_id,
            )
            for a in result.applied
        ],
        rejected=[
            RejectedAdjustmentSchema(
                adjustment=AdjustmentSchema(
                    asset=r.adjustment.asset,
                    delta_pp=r.adjustment.delta_pp,
                    reason=r.adjustment.reason,
                    evidence_report_id=r.adjustment.evidence_report_id,
                ),
                reason=r.reason,
            )
            for r in result.rejected
        ],
        clamped=result.clamped,
        explain_baseline=quant.explain_baseline(profile, result.baseline),
        disclaimer=DISCLAIMER,
    )


@app.post("/api/chat", response_model=ChatResponse)
def chat(body: ChatRequest):
    """멀티턴 챗 — 가드레일 → 세션(STM) → triage(규칙) → 유형별 라우팅.

    LLM은 최대 1회(analysis)만 쓴다. 자세한 흐름은 chat_service.py 참고.
    실패해도 500을 내지 않는다 — 폴백 문구가 항상 준비돼 있다.
    """
    return handle_chat(body)
