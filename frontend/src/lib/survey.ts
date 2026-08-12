/**
 * 투자 성향 진단
 *
 * 문항은 금융투자협회 표준투자권유준칙이 요구하는 항목
 * (연령 · 투자기간 · 지식과 경험 · 재산 상황 · 소득 원천 · 손실 감내 · 투자 목적)을
 * 골격으로 삼고, 사회초년생이 실제로 걸려 넘어지는 지점(비상금)을 한 문항 더했다.
 *
 * 알고리즘은 일부러 단순하게 뒀다. 가중 합산 → 5단계 구간.
 * 나중에 이 파일만 서버 스코어링으로 바꾸면 화면은 그대로 쓴다.
 */

import type { AssetKey } from './mock'
import { allocOverride, weightOverride } from './overrides'

export interface Choice {
  /** 화면에 그리는 선택지 문구 */
  text: string
  /** 보조 설명 — 없으면 생략 */
  sub?: string
  /** 0(가장 보수적) ~ 4(가장 공격적) */
  score: number
}

export interface Question {
  id: string
  /** 진단 축 — 결과 화면의 5축 그래프에 쓴다 */
  axis: 'horizon' | 'literacy' | 'capacity' | 'tolerance' | 'purpose'
  /** 가중치. 손실 감내에 가장 큰 몫을 준다 */
  weight: number
  title: string
  help?: string
  choices: Choice[]
}

export const QUESTIONS: Question[] = [
  {
    id: 'q1',
    axis: 'horizon',
    weight: 5,
    title: '나이가 어떻게 되세요?',
    help: '남은 근로 기간이 길수록 시장이 빠졌을 때 회복을 기다릴 여유가 생깁니다.',
    choices: [
      { text: '19세 이하', score: 2 },
      { text: '20대 ~ 30대 초반', sub: '사회초년생', score: 4 },
      { text: '30대 후반 ~ 40대', score: 3 },
      { text: '50대', score: 2 },
      { text: '60세 이상', score: 0 },
    ],
  },
  {
    id: 'q2',
    axis: 'horizon',
    weight: 20,
    title: '이 돈, 언제쯤 쓰실 계획인가요?',
    help: '가장 중요한 질문입니다. 쓸 날짜가 정해진 돈은 수익률보다 그날 원금이 있느냐가 먼저예요.',
    choices: [
      { text: '1년 안에 써야 해요', sub: '전세금, 학비처럼 날짜가 정해진 돈', score: 0 },
      { text: '1~3년쯤', sub: '결혼 자금, 이직 준비금', score: 1 },
      { text: '3~5년쯤', score: 2 },
      { text: '5~10년', sub: '내 집 마련 목돈', score: 3 },
      { text: '10년 넘게 안 건드릴 거예요', sub: '노후 준비', score: 4 },
    ],
  },
  {
    id: 'q3',
    axis: 'literacy',
    weight: 15,
    title: '금융 상품, 어디까지 해보셨어요?',
    help: '모른다고 답해도 불이익은 없습니다. 오히려 설명을 더 촘촘하게 붙여 드려요.',
    choices: [
      { text: '예금·적금만 해봤어요', sub: '채권이나 ETF는 이름만 들어봤어요', score: 0 },
      { text: '펀드나 ETF를 조금 사봤어요', score: 1 },
      { text: '채권, ETF 구조는 대충 알아요', score: 2 },
      { text: '직접 종목을 골라 거래해요', score: 3 },
      { text: '파생·레버리지까지 다뤄봤어요', score: 4 },
    ],
  },
  {
    id: 'q4',
    axis: 'capacity',
    weight: 10,
    title: '전체 금융자산 중에 얼마나 넣으실 건가요?',
    help: '한 바구니에 얼마나 담느냐가 손실이 났을 때 체감 충격을 정합니다.',
    choices: [
      { text: '10% 이하', score: 4 },
      { text: '10 ~ 20%', score: 3 },
      { text: '20 ~ 40%', score: 2 },
      { text: '40 ~ 70%', score: 1 },
      { text: '70% 넘게', sub: '거의 전 재산', score: 0 },
    ],
  },
  {
    id: 'q5',
    axis: 'capacity',
    weight: 10,
    title: '매달 들어오는 돈은 안정적인 편인가요?',
    help: '수입이 규칙적일수록 시장이 빠져도 팔지 않고 버틸 수 있습니다.',
    choices: [
      { text: '월급이 꼬박꼬박 들어와요', sub: '정규직 · 공무원', score: 4 },
      { text: '대체로 일정하지만 변동이 조금 있어요', score: 3 },
      { text: '들쭉날쭉해요', sub: '프리랜서 · 자영업', score: 1 },
      { text: '지금은 소득이 없어요', score: 0 },
    ],
  },
  {
    id: 'q6',
    axis: 'tolerance',
    weight: 30,
    title: '1,000만 원을 넣었는데 석 달 만에 850만 원이 됐습니다.',
    help: '머리로 아는 답 말고, 그 화면을 실제로 봤을 때 손이 어떻게 움직일지를 골라 주세요.',
    choices: [
      { text: '잠이 안 와요. 바로 다 팔 것 같아요', score: 0 },
      { text: '일단 절반은 정리하고 지켜볼래요', score: 1 },
      { text: '불안하지만 그냥 두겠어요', score: 2 },
      { text: '원래 그럴 수 있다고 보고 놔둡니다', score: 3 },
      { text: '싸졌으니 더 삽니다', score: 4 },
    ],
  },
  {
    id: 'q7',
    axis: 'purpose',
    weight: 10,
    title: '이 투자로 바라는 게 뭔가요?',
    choices: [
      { text: '예금보다 조금만 나으면 돼요', sub: '원금은 절대 지키고 싶어요', score: 0 },
      { text: '물가상승률은 넘겼으면 좋겠어요', score: 1 },
      { text: '연 4~6% 정도면 만족해요', score: 2 },
      { text: '연 7~10%는 노려보고 싶어요', score: 3 },
      { text: '손실을 감수하더라도 크게 불리고 싶어요', score: 4 },
    ],
  },
  {
    id: 'q8',
    axis: 'capacity',
    weight: 10,
    title: '갑자기 목돈 쓸 일이 생기면 어떻게 하세요?',
    help: '투자를 중간에 그만두는 첫째 이유는 시장 하락이 아니라 생활자금 부족이었습니다.',
    choices: [
      {
        text: '3~6개월치 생활비를 따로 두고 있어요',
        sub: '언제든 뺄 수 있는 자리에',
        score: 4,
      },
      { text: '1~3개월치 정도는 있어요', score: 2 },
      { text: '거의 없어요. 있는 돈을 빼야 해요', score: 0 },
      { text: '신용카드나 대출로 막을 것 같아요', score: 0 },
    ],
  },
]

/* ── 성향 등급 ───────────────────────────────────────────── */

export type ProfileKey =
  | 'stable'
  | 'stableSeek'
  | 'neutral'
  | 'active'
  | 'aggressive'

export interface ProfileDef {
  key: ProfileKey
  name: string
  /** 손글씨로 적히는 한 줄 */
  oneLine: string
  summary: string
  caution: string
  /** 자산군 배분(%) — 합 100 */
  alloc: Record<AssetKey, number>
  /** 연 기대 변동폭 (± %) */
  band: number
}

export const PROFILES: ProfileDef[] = [
  {
    key: 'stable',
    name: '안정형',
    oneLine: '원금이 줄어드는 건 못 보는 쪽',
    summary:
      '수익률보다 원금이 그대로 있는 게 훨씬 중요한 유형입니다. 만기가 짧은 국채와 파킹형 상품으로 뼈대를 세우고, 주식형은 맛만 보는 수준으로 둡니다.',
    caution:
      '물가상승률(연 2% 내외)을 못 따라가면 돈의 가치는 조금씩 줄어듭니다. 최소한 그 선은 넘기도록 만기 사다리를 짜 두었어요.',
    alloc: { cash: 30, govShort: 35, govLong: 15, corp: 15, etfPassive: 5, etfActive: 0 },
    band: 3,
  },
  {
    key: 'stableSeek',
    name: '안정추구형',
    oneLine: '지키는 게 먼저, 조금 불리는 건 그다음',
    summary:
      '원금 보존을 우선하되 예금보다는 나은 수익을 바라는 유형입니다. 국채와 우량 회사채로 이자를 깔고, 지수추종 ETF를 소량 얹어 물가상승률 위를 노립니다.',
    caution:
      '장기 국채 비중이 있어 금리가 예상과 반대로 움직이면 평가손이 납니다. 만기까지 들고 갈 생각이면 중간 가격은 신경 쓰지 않아도 됩니다.',
    alloc: { cash: 20, govShort: 25, govLong: 20, corp: 20, etfPassive: 15, etfActive: 0 },
    band: 6,
  },
  {
    key: 'neutral',
    name: '위험중립형',
    oneLine: '오르내리는 건 받아들이되, 밤잠은 자야 하는 쪽',
    summary:
      '일정 수준의 등락은 감수하고 시장 평균 정도의 수익을 노리는 유형입니다. 채권으로 바닥을 받치고 지수추종 ETF를 절반 가까이 담아 성장을 따라갑니다.',
    caution:
      '주식형 비중이 3분의 1을 넘어가면 하락장에서 계좌가 두 자릿수로 빠지는 구간이 옵니다. 그때 팔지 않으려면 비상금이 반드시 먼저 있어야 합니다.',
    alloc: { cash: 15, govShort: 15, govLong: 20, corp: 15, etfPassive: 30, etfActive: 5 },
    band: 11,
  },
  {
    key: 'active',
    name: '적극투자형',
    oneLine: '길게 보고 시장을 따라갈 준비가 된 쪽',
    summary:
      '투자 기간이 길고 하락을 견딜 여력이 있는 유형입니다. 지수추종 ETF를 중심에 두고, 채권은 하락장에서 완충 역할을 하도록 배치합니다.',
    caution:
      '20년 백테스트 기준 최대 낙폭이 -35%를 넘은 구간이 있었고 회복까지 2~3년이 걸렸습니다. 그 기간에 쓸 돈이 섞여 있으면 안 됩니다.',
    alloc: { cash: 10, govShort: 10, govLong: 20, corp: 10, etfPassive: 40, etfActive: 10 },
    band: 15,
  },
  {
    key: 'aggressive',
    name: '공격투자형',
    oneLine: '손실을 감수하고 크게 불리고 싶은 쪽',
    summary:
      '높은 변동성을 감수하고 초과 수익을 노리는 유형입니다. 다만 이 서비스는 채권·ETF만 다루므로, 여기서도 안전자산을 4분의 1은 남겨 둡니다.',
    caution:
      '이 서비스는 개별 주식·레버리지·파생을 다루지 않습니다. 더 공격적인 배분을 원하신다면 이 포트폴리오는 그 일부로만 쓰시는 편이 맞습니다.',
    alloc: { cash: 5, govShort: 5, govLong: 20, corp: 5, etfPassive: 50, etfActive: 15 },
    band: 19,
  },
]

export const profileByKey = (k: ProfileKey) =>
  PROFILES.find((p) => p.key === k) ?? PROFILES[2]

/* ── 채점 ────────────────────────────────────────────────── */

export type Answers = Record<string, number>

export interface Diagnosis {
  /** 0~100 */
  score: number
  profile: ProfileDef
  /** 5축 점수 (0~100) */
  axes: { key: string; label: string; value: number }[]
  /** 비상금 문항에서 0점이 나오면 결과 화면에서 먼저 경고한다 */
  needsBuffer: boolean
  /** 투자 기간이 1년 미만이면 위험자산 비중을 강제로 눌러야 한다 */
  shortHorizon: boolean
}

const AXIS_LABEL: Record<Question['axis'], string> = {
  horizon: '기간 여력',
  literacy: '지식 · 경험',
  capacity: '감당 여력',
  tolerance: '손실 감내',
  purpose: '수익 기대',
}

export function diagnose(answers: Answers): Diagnosis {
  let weighted = 0
  let total = 0
  const axisSum: Record<string, { got: number; max: number }> = {}

  for (const q of QUESTIONS) {
    const picked = answers[q.id]
    if (picked === undefined) continue
    const score = q.choices[picked]?.score ?? 0
    // 관리자 콘솔에서 가중치를 바꿨으면 그 값을 쓴다
    const w = weightOverride(q.id) ?? q.weight
    weighted += (score / 4) * w
    total += w

    const a = (axisSum[q.axis] ??= { got: 0, max: 0 })
    a.got += (score / 4) * w
    a.max += w
  }

  const score = total > 0 ? Math.round((weighted / total) * 100) : 0

  const idx =
    score <= 20 ? 0 : score <= 40 ? 1 : score <= 60 ? 2 : score <= 80 ? 3 : 4

  const axes = (Object.keys(AXIS_LABEL) as Question['axis'][]).map((k) => ({
    key: k,
    label: AXIS_LABEL[k],
    value: axisSum[k] ? Math.round((axisSum[k].got / axisSum[k].max) * 100) : 0,
  }))

  return {
    score,
    profile: PROFILES[idx],
    axes,
    needsBuffer: (QUESTIONS[7].choices[answers.q8]?.score ?? 4) === 0,
    shortHorizon: (answers.q2 ?? 4) === 0,
  }
}

/**
 * 진단 결과에 안전 장치를 씌운 최종 배분.
 * 규칙이 성향 점수를 덮어쓸 수 있게 두는 것이 핵심이다 —
 * 1년 안에 쓸 돈에 장기 국채를 넣는 일은 어떤 점수가 나와도 막는다.
 */
export function finalAlloc(d: Diagnosis): Record<AssetKey, number> {
  const a = { ...(allocOverride(d.profile.key) ?? d.profile.alloc) }

  if (d.shortHorizon) {
    // 위험·장기 자산을 전부 걷어 단기 쪽으로 옮긴다
    const moved = a.govLong + a.etfPassive + a.etfActive + a.corp
    a.govLong = 0
    a.etfPassive = 0
    a.etfActive = 0
    a.corp = 0
    a.cash += Math.round(moved * 0.45)
    a.govShort += moved - Math.round(moved * 0.45)
  } else if (d.needsBuffer && a.cash < 25) {
    // 비상금이 없으면 현금성부터 25%까지 채우고 나머지를 비례 축소
    const need = 25 - a.cash
    const pool = (Object.keys(a) as AssetKey[]).filter((k) => k !== 'cash')
    const sum = pool.reduce((s, k) => s + a[k], 0)
    pool.forEach((k) => {
      a[k] = Math.max(0, Math.round(a[k] - (a[k] / sum) * need))
    })
    a.cash = 100 - pool.reduce((s, k) => s + a[k], 0)
  }

  return a
}
