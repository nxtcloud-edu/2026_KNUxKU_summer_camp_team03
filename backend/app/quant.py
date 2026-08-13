"""
퀀트 3단계 추천 알고리즘 (설계문서 v3 기준)

출처: 팀 설계문서 v3 + "3단계 추천 알고리즘 업데이트 사항" 문서.
quant.ts(프론트 프로토타입)가 아니라 이 문서들을 1차 근거로 삼는다 —
quant.ts는 세부 스펙이 확정되기 전에 화면 검증용으로 먼저 짜인 코드였다.

설계 원칙 (변하지 않는 부분):
    1~2단계는 순수 연산이다. LLM이 끼어들지 않는다.
    3단계에서만 에이전트가 개입하되 '델타 제안'까지이고,
    산술·검증·클램프는 전부 이 파일의 코드가 한다.

    "에이전트는 근거 없이는 단 1%p도 움직일 수 없습니다."

v3에서 달라진 것:
    - 대분류(현금/ETF/채권) 산출 후, 각 대분류를 세부분류로 한 번 더 쪼갠다
      (ETF → 패시브/테마, 채권 → 단기/장기).
    - 3단계 조정은 대분류가 아니라 이 세부분류 단위로 이뤄진다.
    - capacity/tolerance 내부 가중치는 문서에 구체적 수치가 없어, 합리적인
      기본값을 정해 allocation_params에 넣었다 — 코드 수정 없이 튜닝 가능.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal, Optional

# ── 튜닝 파라미터 ────────────────────────────────────────────
# 설계문서의 allocation_params 테이블에 대응한다. DB가 붙으면 이 값들만
# 서버 설정(또는 DB 조회값)으로 갈아 끼운다. 숫자를 로직에 흩뿌리지 않고
# 여기 모아둔 이유는 코드 수정 없이 튜닝하기 위해서다.
ALLOCATION_PARAMS = {
    # ── 1단계: risk_score 배합 (문서에 명시된 값) ──
    "capacity_weight": 0.4,
    "tolerance_weight": 0.6,
    # ── 1단계: capacity 내부 가중치 (문서에 수치 없음 — 새로 정한 기본값) ──
    # 운용 기간이 가장 결정적인 신호라고 보고 가장 크게, 나이는 보조 신호로 가장 작게 뒀다.
    "capacity_horizon_weight": 0.45,
    "capacity_savings_weight": 0.35,
    "capacity_age_weight": 0.20,
    # 저축률(또는 연 투자액÷시드머니) 몇 %를 만점으로 볼 것인가
    "savings_rate_cap": 0.30,
    # ── 1단계: tolerance 내부 가중치 (문서에 수치 없음 — 새로 정한 기본값) ──
    # 실제 행동에 가장 가까운 "-20% 시 반응"보다 "MDD 답변"을 더 크게 둔 이유:
    # 행동 시나리오 응답보다 스스로 적은 숫자가 조작하기 쉬워 보이지만, 실제로는
    # 두 응답이 크게 어긋나는 사용자가 가장 위험군이라 MDD를 기준축으로 삼았다.
    "tolerance_mdd_weight": 0.40,
    "tolerance_drop_weight": 0.35,
    "tolerance_target_weight": 0.25,
    # 감내 가능한 최대 낙폭(%) 몇 %를 만점으로 볼 것인가
    "mdd_cap_pct": 40,
    # capacity·tolerance 격차 경고 — 이 이상 벌어지면 화면에서 짚어 준다
    "gap_warning_threshold": 25,

    # ── 2단계: 대분류 산출 ──
    # 현금성 하한(%). 비상금 명목으로 먼저 떼어 낸다 (문서: 3~5%, 5로 고정)
    "cash_floor": 5,
    # 보간 앵커 — risk_score 0일 때와 100일 때 위험자산(ETF)이 잔여분에서 차지하는 비율
    "etf_share_at_0": 0.05,
    "etf_share_at_100": 0.95,

    # ── 2단계: 세부분류 산출 (NEW — v3 문서의 "세부 분류 비중 쪼개기") ──
    # ETF 대분류를 패시브(코어) : 테마(새틀라이트)로 쪼개는 기본 비율
    "etf_passive_share": 2 / 3,   # 예시: ETF 60% → 패시브 40% : 테마 20%
    "etf_theme_share": 1 / 3,
    # 채권 대분류를 장기 : 단기 : 회사채로 쪼개는 기본 비율 (3분할, 합 1.0)
    # 회사채는 신용위험이 있는 만큼 비중을 가장 작게 뒀다 — mock.ts 상품군에서도
    # AA- 등급 우량 회사채 하나만 다루는 수준이라 시작 비중을 보수적으로 잡았다.
    "bond_long_share": 0.55,      # 예시: 채권 30% → 장기 16.5%
    "bond_short_share": 0.25,     # 예시: 채권 30% → 단기 7.5%
    "bond_corp_share": 0.20,      # 예시: 채권 30% → 회사채 6%

    # ── 3단계: 에이전트 조정 ──
    # 세부분류 하나당 조정 한도(±%p). 이론상 TAA는 ±10~20%까지 허용하지만
    # 구현은 보수적으로 ±10%p를 하드 클램프로 둔다.
    "adjust_cap_pp": 10,
}


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _round(v: float) -> int:
    """JS Math.round와 동일하게 반올림 (0.5는 항상 위로).
    파이썬 내장 round()는 은행반올림이라 다르게 나올 수 있어 통일한다."""
    return math.floor(v + 0.5) if v >= 0 else -math.floor(-v + 0.5)


# ── 온보딩 입력 ─────────────────────────────────────────────

Horizon = Literal["short", "mid", "long"]
TargetReturn = Literal["deposit", "inflation", "aggressive"]
Drop20 = Literal["sell", "hold", "buy"]


@dataclass
class OnboardingInput:
    seed_money: float          # 현재 보유 시드머니(원)
    monthly_invest: float      # 매월 투자 가능 금액(원)
    horizon: Horizon           # 투자 기간
    target_return: TargetReturn  # 목표 수익률
    drop20: Drop20             # 원금 -20% 시 반응
    mdd_pct: float             # 감내 가능한 최대 낙폭(%)
    age: Optional[int] = None            # 선택 — 나이대 (Capacity 정밀화)
    monthly_income: Optional[float] = None  # 선택 — 월 소득(원)


# ── 1단계 · 다차원 리스크 스코어링 ───────────────────────────


def capacity_score(inp: OnboardingInput) -> int:
    """객관적 수용력 — 운용 기간, 저축 여력, 나이대"""
    p = ALLOCATION_PARAMS

    horizon_part = 100 if inp.horizon == "long" else 55 if inp.horizon == "mid" else 10

    if inp.monthly_income and inp.monthly_income > 0:
        savings_rate = inp.monthly_invest / inp.monthly_income
    elif inp.seed_money > 0:
        savings_rate = (inp.monthly_invest * 12) / inp.seed_money
    else:
        savings_rate = 0
    savings_part = _clamp((savings_rate / p["savings_rate_cap"]) * 100, 0, 100)

    age_part = 50 if inp.age is None else _clamp(100 - (inp.age - 25) * 2, 10, 100)

    raw = (
        horizon_part * p["capacity_horizon_weight"]
        + savings_part * p["capacity_savings_weight"]
        + age_part * p["capacity_age_weight"]
    )
    return _round(_clamp(raw, 0, 100))


def tolerance_score(inp: OnboardingInput) -> int:
    """주관적 선호도 — MDD 답변, -20% 반응, 목표 수익률"""
    p = ALLOCATION_PARAMS

    mdd_part = _clamp((inp.mdd_pct / p["mdd_cap_pct"]) * 100, 0, 100)
    drop_part = 100 if inp.drop20 == "buy" else 55 if inp.drop20 == "hold" else 5
    target_part = (
        100 if inp.target_return == "aggressive"
        else 55 if inp.target_return == "inflation"
        else 10
    )

    raw = (
        mdd_part * p["tolerance_mdd_weight"]
        + drop_part * p["tolerance_drop_weight"]
        + target_part * p["tolerance_target_weight"]
    )
    return _round(_clamp(raw, 0, 100))


@dataclass
class RiskProfile:
    capacity: int
    tolerance: int
    risk: int
    gap_warning: bool


def risk_profile(inp: OnboardingInput) -> RiskProfile:
    p = ALLOCATION_PARAMS
    capacity = capacity_score(inp)
    tolerance = tolerance_score(inp)
    risk = _round(capacity * p["capacity_weight"] + tolerance * p["tolerance_weight"])
    return RiskProfile(
        capacity=capacity,
        tolerance=tolerance,
        risk=risk,
        gap_warning=(tolerance - capacity) >= p["gap_warning_threshold"],
    )


# ── 2단계 · 기준 비중 산출 (대분류 → 세부분류) ────────────────

Asset = Literal["cash", "etf_passive", "etf_theme", "bond_short", "bond_long", "bond_corp"]
ASSETS: tuple[Asset, ...] = (
    "cash", "etf_passive", "etf_theme", "bond_short", "bond_long", "bond_corp",
)


@dataclass
class Weights:
    """세부분류 6버킷. 대분류(etf/bond) 합계는 프로퍼티로 계산해서 화면 표시에 쓴다."""

    cash: int
    etf_passive: int
    etf_theme: int
    bond_short: int
    bond_long: int
    bond_corp: int

    @property
    def etf_total(self) -> int:
        return self.etf_passive + self.etf_theme

    @property
    def bond_total(self) -> int:
        return self.bond_short + self.bond_long + self.bond_corp

    def as_dict(self) -> dict:
        return {a: getattr(self, a) for a in ASSETS}


def baseline_weights(risk: int) -> Weights:
    p = ALLOCATION_PARAMS
    floor = p["cash_floor"]
    remaining = 100 - floor

    # 대분류 — 선형 보간
    share = p["etf_share_at_0"] + (p["etf_share_at_100"] - p["etf_share_at_0"]) * (
        _clamp(risk, 0, 100) / 100
    )
    etf_total = _round(remaining * share)
    bond_total = remaining - etf_total

    # 세부분류 — 코어/새틀라이트로 쪼갠다 (NEW)
    etf_passive = _round(etf_total * p["etf_passive_share"])
    etf_theme = etf_total - etf_passive

    # 채권은 장기/단기/회사채 3분할. 앞의 둘을 반올림하고 회사채가 잔여를
    # 흡수하게 해서, 반올림 오차가 있어도 세 값의 합이 항상 bond_total과 같다.
    bond_long = _round(bond_total * p["bond_long_share"])
    bond_short = _round(bond_total * p["bond_short_share"])
    bond_corp = bond_total - bond_long - bond_short

    return Weights(
        cash=floor,
        etf_passive=etf_passive,
        etf_theme=etf_theme,
        bond_short=bond_short,
        bond_long=bond_long,
        bond_corp=bond_corp,
    )


# ── 3단계 · 에이전트 델타 제안 + 코드 검증 ───────────────────
# LLM은 세부분류 단위로만 제안한다. 최종 숫자를 쓰지 않는다.
# 근거 리포트 ID가 없는 제안은 여기서 전부 폐기된다.


@dataclass
class Adjustment:
    asset: Asset
    delta_pp: float
    reason: str
    evidence_report_id: Optional[str] = None


@dataclass
class RejectedAdjustment:
    adjustment: Adjustment
    reason: str


@dataclass
class AdjustResult:
    baseline: Weights
    adjusted: Weights
    applied: list[Adjustment] = field(default_factory=list)
    rejected: list[RejectedAdjustment] = field(default_factory=list)
    clamped: bool = False


def _normalize_to_100(w: dict) -> Weights:
    """합이 100이 되도록 되돌린다. 가장 큰 항목에서 오차를 흡수한다."""
    out = {a: max(0, _round(w[a])) for a in ASSETS}
    diff = 100 - sum(out.values())
    if diff != 0:
        biggest = max(out, key=lambda k: out[k])
        out[biggest] += diff
    return Weights(**out)


def apply_adjustments(baseline: Weights, proposals: list[Adjustment]) -> AdjustResult:
    cap = ALLOCATION_PARAMS["adjust_cap_pp"]
    adjusted = baseline.as_dict()
    applied: list[Adjustment] = []
    rejected: list[RejectedAdjustment] = []
    clamped = False

    for p in proposals:
        if p.asset not in ASSETS:
            rejected.append(
                RejectedAdjustment(adjustment=p, reason=f"알 수 없는 자산({p.asset})이라 폐기했습니다.")
            )
            continue

        # 근거 없는 조정은 폐기한다. 이 서비스의 유일한 약속이다.
        if not p.evidence_report_id:
            rejected.append(
                RejectedAdjustment(adjustment=p, reason="근거 리포트가 없어 폐기했습니다.")
            )
            continue

        delta = _clamp(p.delta_pp, -cap, cap)
        if delta != p.delta_pp:
            clamped = True

        adjusted[p.asset] = adjusted[p.asset] + delta
        applied.append(Adjustment(**{**p.__dict__, "delta_pp": delta}))

    # 현금 하한은 조정 뒤에도 반드시 지켜진다
    if adjusted["cash"] < ALLOCATION_PARAMS["cash_floor"]:
        adjusted["cash"] = ALLOCATION_PARAMS["cash_floor"]

    return AdjustResult(
        baseline=baseline,
        adjusted=_normalize_to_100(adjusted),
        applied=applied,
        rejected=rejected,
        clamped=clamped,
    )


# ── 설명 생성 ───────────────────────────────────────────────


def explain_baseline(p: RiskProfile, w: Weights) -> str:
    return (
        f"수용력 {p.capacity}점과 선호도 {p.tolerance}점을 4:6으로 섞어 "
        f"위험 점수 {p.risk}점이 나왔어요. 비상금 몫으로 현금성 {w.cash}%를 먼저 떼고, "
        f"남은 {100 - w.cash}%를 점수에 비례해 ETF {w.etf_total}%(패시브 {w.etf_passive}·"
        f"테마 {w.etf_theme}) · 채권 {w.bond_total}%(장기 {w.bond_long}·단기 {w.bond_short}·"
        f"회사채 {w.bond_corp})로 나눴습니다."
    )


ASSET_LABEL = {
    "cash": "현금성",
    "etf_passive": "패시브 ETF",
    "etf_theme": "테마 ETF",
    "bond_short": "단기채",
    "bond_long": "장기채",
    "bond_corp": "회사채",
}

ASSET_NOTE = {
    "cash": "파킹 · 비상금",
    "etf_passive": "지수추종 · 코어",
    "etf_theme": "테마형 · 새틀라이트",
    "bond_short": "방어용 · 만기 1년 이내",
    "bond_long": "금리 인하 국면 시세차익 · 듀레이션 6년 내외",
    "bond_corp": "AA- 이상 우량 회사채 · 국채 대비 캐리 매력",
}
