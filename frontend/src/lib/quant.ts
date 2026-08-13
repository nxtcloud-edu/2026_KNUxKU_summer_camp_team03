/**
 * 퀀트 3단계 추천 알고리즘
 *
 * 설계 원칙 (팀 설계문서 v2):
 *   1~2단계는 순수 연산이다. LLM이 끼어들지 않는다.
 *   3단계에서만 에이전트가 개입하되 '델타 제안'까지이고,
 *   산술·검증·클램프는 전부 이 파일의 코드가 한다.
 *
 *   "에이전트는 근거 없이는 단 1%p도 움직일 수 없습니다."
 *
 * 화면에 보이는 배분 숫자는 반드시 이 파일을 통과한 값이어야 한다.
 * 채팅 답변이 만들어 낸 숫자를 그대로 쓰는 경로를 만들지 말 것.
 */

/* ── 튜닝 파라미터 ────────────────────────────────────────────
   설계문서의 allocation_params 테이블에 대응한다.
   DB가 붙으면 이 상수만 서버 값으로 갈아 끼운다. 코드 수정 없이 튜닝하려고
   숫자를 로직에 흩뿌리지 않고 여기 모아 뒀다. */
export const ALLOCATION_PARAMS = {
  /** 현금성 하한(%). 비상금 명목으로 먼저 떼어 낸다 */
  cash_floor: 5,
  /** 3단계 조정 한도(±%p). 이 밖으로 나가는 제안은 잘라 낸다 */
  adjust_cap_pp: 10,
  /** 보간 앵커 — risk_score 0일 때와 100일 때 위험자산이 잔여분에서 차지하는 비율 */
  etf_share_at_0: 0.05,
  etf_share_at_100: 0.95,
  /** risk_score 배합 — 객관 40 : 주관 60 */
  capacity_weight: 0.4,
  tolerance_weight: 0.6,
} as const

/* ── 온보딩 입력 ─────────────────────────────────────────── */

export type Horizon = 'short' | 'mid' | 'long'
export type TargetReturn = 'deposit' | 'inflation' | 'aggressive'
export type Drop20 = 'sell' | 'hold' | 'buy'

export interface OnboardingInput {
  /** 현재 보유 시드머니(원) */
  seedMoney: number
  /** 매월 투자 가능 금액(원) */
  monthlyInvest: number
  /** 투자 기간 */
  horizon: Horizon
  /** 목표 수익률 */
  targetReturn: TargetReturn
  /** 원금 -20% 시 반응 */
  drop20: Drop20
  /** 감내 가능한 최대 낙폭(%) */
  mddPct: number
  /** 선택 — 나이대 (Capacity 정밀화) */
  age?: number
  /** 선택 — 월 소득(원). 미입력 시 월투자액÷시드머니로 저축여력을 대체한다 */
  monthlyIncome?: number
}

/* ── 1단계 · 다차원 리스크 스코어링 ───────────────────────────
   A/B/C 타입 분류 대신 0~100 연속값을 쓴다. 경계값 문제가 없고
   슬라이더 UX와 자연스럽게 이어진다.
   주관(Tolerance)과 객관(Capacity)을 반드시 따로 산출한다. 섞어 버리면
   "왜 이 점수인지"를 사용자에게 되돌려 설명할 수 없다. */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** 객관적 수용력 — 운용 기간, 저축 여력, 나이대 */
export function capacityScore(input: OnboardingInput): number {
  // 운용 기간 — 길수록 회복할 시간이 있다 (0~100)
  const horizonPart =
    input.horizon === 'long' ? 100 : input.horizon === 'mid' ? 55 : 10

  // 저축 여력 — 월 현금흐름이 시드 대비 얼마나 두터운가
  // 월소득을 받았으면 저축률로, 아니면 월투자액÷시드머니로 대체한다
  const savingsRate =
    input.monthlyIncome && input.monthlyIncome > 0
      ? input.monthlyInvest / input.monthlyIncome
      : input.seedMoney > 0
        ? (input.monthlyInvest * 12) / input.seedMoney
        : 0
  // 저축률 30%(또는 연 투자액이 시드의 30%)를 만점으로 본다
  const savingsPart = clamp((savingsRate / 0.3) * 100, 0, 100)

  // 나이대 — 미입력 시 중립(50)
  const agePart =
    input.age === undefined ? 50 : clamp(100 - (input.age - 25) * 2, 10, 100)

  const raw = horizonPart * 0.45 + savingsPart * 0.35 + agePart * 0.2
  return Math.round(clamp(raw, 0, 100))
}

/** 주관적 선호도 — MDD 답변, -20% 반응, 목표 수익률 */
export function toleranceScore(input: OnboardingInput): number {
  // 감내 낙폭 — 40%를 만점으로 본다
  const mddPart = clamp((input.mddPct / 40) * 100, 0, 100)

  // -20% 시 반응 — 실제 행동에 가장 가까운 신호
  const dropPart =
    input.drop20 === 'buy' ? 100 : input.drop20 === 'hold' ? 55 : 5

  // 목표 수익률
  const targetPart =
    input.targetReturn === 'aggressive'
      ? 100
      : input.targetReturn === 'inflation'
        ? 55
        : 10

  const raw = mddPart * 0.4 + dropPart * 0.35 + targetPart * 0.25
  return Math.round(clamp(raw, 0, 100))
}

export interface RiskProfile {
  capacity: number
  tolerance: number
  risk: number
  /** 수용력보다 선호도가 크게 앞서면 표시한다 (과신 구간) */
  gapWarning: boolean
}

export function riskProfile(input: OnboardingInput): RiskProfile {
  const capacity = capacityScore(input)
  const tolerance = toleranceScore(input)
  const risk = Math.round(
    capacity * ALLOCATION_PARAMS.capacity_weight +
      tolerance * ALLOCATION_PARAMS.tolerance_weight,
  )
  return {
    capacity,
    tolerance,
    risk,
    // 감당할 수 있는 것보다 감당하고 싶은 마음이 25점 이상 앞선 상태.
    // 이 구간이 실제로 중도 이탈이 나오는 자리라 화면에서 짚어 준다.
    gapWarning: tolerance - capacity >= 25,
  }
}

/* ── 2단계 · 기준 비중 산출 ─────────────────────────────────
   스코어를 선형 보간으로 비중에 매핑하되 안전판을 먼저 뺀다.
   순서가 중요하다. 현금을 먼저 떼지 않으면 공격적인 사용자의 비상금이 0이 된다. */

export interface Weights {
  cash: number
  etf: number
  bond: number
}

export function baselineWeights(risk: number): Weights {
  const floor = ALLOCATION_PARAMS.cash_floor
  const remaining = 100 - floor

  // 선형 보간 — risk 0에서 etf_share_at_0, 100에서 etf_share_at_100
  const share =
    ALLOCATION_PARAMS.etf_share_at_0 +
    (ALLOCATION_PARAMS.etf_share_at_100 - ALLOCATION_PARAMS.etf_share_at_0) *
      (clamp(risk, 0, 100) / 100)

  const etf = Math.round(remaining * share)
  const bond = remaining - etf
  return { cash: floor, etf, bond }
}

/* ── 3단계 · 에이전트 델타 제안 + 코드 검증 ───────────────────
   LLM은 아래 형태의 제안만 만든다. 최종 숫자를 쓰지 않는다.
   근거 리포트 ID가 없는 제안은 여기서 전부 폐기된다. */

export interface Adjustment {
  asset: keyof Weights
  delta_pp: number
  /** 근거 리포트 ID. 없으면 폐기된다 */
  evidence_report_id?: string
  reason: string
}

export interface AdjustResult {
  baseline: Weights
  adjusted: Weights
  /** 실제로 반영된 제안 */
  applied: Adjustment[]
  /** 폐기된 제안과 그 사유 — 화면과 트레이스에 그대로 남긴다 */
  rejected: { adjustment: Adjustment; reason: string }[]
  /** 한도에 걸려 잘린 제안이 있었는가 */
  clamped: boolean
}

/** 합이 100이 되도록 되돌린다. 가장 큰 항목에서 오차를 흡수한다 */
function normalizeTo100(w: Weights): Weights {
  const out: Weights = {
    cash: Math.max(0, Math.round(w.cash)),
    etf: Math.max(0, Math.round(w.etf)),
    bond: Math.max(0, Math.round(w.bond)),
  }
  const diff = 100 - (out.cash + out.etf + out.bond)
  if (diff !== 0) {
    const biggest = (Object.keys(out) as (keyof Weights)[]).reduce((a, b) =>
      out[a] >= out[b] ? a : b,
    )
    out[biggest] += diff
  }
  return out
}

export function applyAdjustments(
  baseline: Weights,
  proposals: Adjustment[],
): AdjustResult {
  const cap = ALLOCATION_PARAMS.adjust_cap_pp
  const adjusted: Weights = { ...baseline }
  const applied: Adjustment[] = []
  const rejected: AdjustResult['rejected'] = []
  let clamped = false

  for (const p of proposals) {
    // 근거 없는 조정은 폐기한다. 이 서비스의 유일한 약속이다.
    if (!p.evidence_report_id) {
      rejected.push({ adjustment: p, reason: '근거 리포트가 없어 폐기했습니다.' })
      continue
    }
    const delta = clamp(p.delta_pp, -cap, cap)
    if (delta !== p.delta_pp) clamped = true

    adjusted[p.asset] += delta
    applied.push({ ...p, delta_pp: delta })
  }

  // 현금 하한은 조정 뒤에도 반드시 지켜진다
  if (adjusted.cash < ALLOCATION_PARAMS.cash_floor) {
    adjusted.cash = ALLOCATION_PARAMS.cash_floor
  }

  return {
    baseline,
    adjusted: normalizeTo100(adjusted),
    applied,
    rejected,
    clamped,
  }
}

/* ── 설명 생성 ───────────────────────────────────────────────
   숫자가 왜 그렇게 나왔는지 되돌려 말하는 문장. 화면과 채팅이 같이 쓴다. */

export function explainBaseline(p: RiskProfile, w: Weights): string {
  return (
    `수용력 ${p.capacity}점과 선호도 ${p.tolerance}점을 4:6으로 섞어 ` +
    `위험 점수 ${p.risk}점이 나왔어요. 비상금 몫으로 현금성 ${w.cash}%를 먼저 떼고, ` +
    `남은 ${100 - w.cash}%를 점수에 비례해 나눈 결과가 ETF ${w.etf}% · 채권 ${w.bond}%입니다.`
  )
}

/** 자산 라벨 — 화면 전체가 같은 말을 쓰도록 여기서만 정의한다 */
export const ASSET_LABEL: Record<keyof Weights, string> = {
  cash: '현금성',
  etf: 'ETF',
  bond: '채권',
}

export const ASSET_COLOR: Record<keyof Weights, string> = {
  cash: '#b9b6ad',
  etf: '#a8843c',
  bond: '#3f4753',
}

export const ASSET_NOTE: Record<keyof Weights, string> = {
  cash: '파킹 · 비상금',
  etf: '지수추종 위험자산',
  bond: '국채 · 우량 회사채',
}
