"""API 요청/응답 스키마. quant.py의 dataclass와 1:1 대응시킨다."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class OnboardingInputSchema(BaseModel):
    seed_money: float = Field(..., description="현재 보유 시드머니(원)", ge=0)
    monthly_invest: float = Field(..., description="매월 투자 가능 금액(원)", ge=0)
    horizon: Literal["short", "mid", "long"]
    target_return: Literal["deposit", "inflation", "aggressive"]
    drop20: Literal["sell", "hold", "buy"]
    mdd_pct: float = Field(..., ge=0, le=100)
    age: Optional[int] = None
    monthly_income: Optional[float] = None


class WeightsSchema(BaseModel):
    """세부분류 6버킷 + 화면 표시용 대분류 합계."""

    cash: int
    etf_passive: int
    etf_theme: int
    bond_short: int
    bond_long: int
    bond_corp: int
    etf_total: int
    bond_total: int


class RiskProfileSchema(BaseModel):
    capacity: int
    tolerance: int
    risk: int
    gap_warning: bool


class RiskProfileResponse(BaseModel):
    """1~2단계 결과 — 프론트가 이미 클라이언트에서 계산하지만,
    서버 검증/재계산용으로도 그대로 노출한다."""

    profile: RiskProfileSchema
    baseline: WeightsSchema
    explain: str


# ── 3단계 ────────────────────────────────────────────────────


class ReportEvidence(BaseModel):
    """RAG로 검색된(또는 지금은 mock) 근거 리포트.
    frontend/src/lib/mock.ts의 Report 인터페이스와 필드명을 맞췄다.
    summary는 3줄 요약 배열이라는 점에 주의 — 단일 문자열이 아니다."""

    id: str
    title: str
    house: Optional[str] = None  # 증권사 (mock.ts: publisher 아님 — house)
    analyst: Optional[str] = None
    date: Optional[str] = None
    tags: list[str] = []
    summary: list[str] = []  # 3줄 요약
    excerpt: Optional[str] = None  # 원문 발췌 — 프롬프트에 넣을 근거 원문
    url: Optional[str] = None
    confidence: Optional[float] = None


class AdjustmentSchema(BaseModel):
    asset: Literal["cash", "etf_passive", "etf_theme", "bond_short", "bond_long", "bond_corp"]
    delta_pp: float
    reason: str
    evidence_report_id: Optional[str] = None


class RejectedAdjustmentSchema(BaseModel):
    adjustment: AdjustmentSchema
    reason: str


class RecommendRequest(BaseModel):
    onboarding: OnboardingInputSchema
    # 근거로 쓸 후보 리포트 풀. DB/RAG가 붙기 전까지는 프론트(mock.ts)가
    # 오늘자 리포트 목록을 그대로 실어 보낸다고 가정한다.
    reports: list[ReportEvidence] = []


class RecommendResponse(BaseModel):
    profile: RiskProfileSchema
    baseline: WeightsSchema
    adjusted: WeightsSchema
    applied: list[AdjustmentSchema]
    rejected: list[RejectedAdjustmentSchema]
    clamped: bool
    explain_baseline: str
    disclaimer: str
