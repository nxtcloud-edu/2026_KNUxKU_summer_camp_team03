/**
 * 관리자 콘솔 샘플 데이터
 *
 * ⚠ 전부 지어낸 값이다. 수집 파이프라인이 붙으면 이 파일이 통째로 API 호출로 바뀐다.
 */

import type { Report } from './mock'

/* ── 일자별 수집 실적 ────────────────────────────────────── */

export interface IngestDay {
  d: string
  /** 크롤러가 가져온 건수 */
  fetched: number
  /** 1차 키워드 필터에서 버린 건수 */
  dropped: number
  /** 모델 태깅까지 끝난 건수 */
  tagged: number
  /** 신뢰도 미달로 사람 검수 큐에 남은 건수 */
  held: number
}

export const INGEST_DAYS: IngestDay[] = [
  { d: '07-30', fetched: 41, dropped: 26, tagged: 13, held: 2 },
  { d: '07-31', fetched: 38, dropped: 25, tagged: 11, held: 2 },
  { d: '08-03', fetched: 52, dropped: 34, tagged: 15, held: 3 },
  { d: '08-04', fetched: 47, dropped: 31, tagged: 14, held: 2 },
  { d: '08-05', fetched: 44, dropped: 29, tagged: 13, held: 2 },
  { d: '08-06', fetched: 49, dropped: 33, tagged: 14, held: 2 },
  { d: '08-07', fetched: 45, dropped: 30, tagged: 12, held: 3 },
  { d: '08-10', fetched: 58, dropped: 39, tagged: 16, held: 3 },
  { d: '08-11', fetched: 61, dropped: 41, tagged: 17, held: 3 },
  { d: '08-12', fetched: 19, dropped: 12, tagged: 5, held: 2 },
]

/* ── 수집 잡 ─────────────────────────────────────────────── */

export interface Job {
  id: string
  source: string
  schedule: string
  lastRun: string
  status: 'ok' | 'warn' | 'fail'
  fetched: number
  dropped: number
  ms: number
  note?: string
}

export const JOBS: Job[] = [
  {
    id: 'J-01',
    source: '미래에셋증권 리서치',
    schedule: '매일 07:10',
    lastRun: '2026-08-12 07:10',
    status: 'ok',
    fetched: 4,
    dropped: 2,
    ms: 8420,
  },
  {
    id: 'J-02',
    source: '삼성증권 리서치',
    schedule: '매일 07:10',
    lastRun: '2026-08-12 07:11',
    status: 'ok',
    fetched: 3,
    dropped: 2,
    ms: 7130,
  },
  {
    id: 'J-03',
    source: 'NH투자증권 리서치',
    schedule: '매일 07:20',
    lastRun: '2026-08-12 07:20',
    status: 'ok',
    fetched: 3,
    dropped: 1,
    ms: 9040,
  },
  {
    id: 'J-04',
    source: 'KB증권 리서치',
    schedule: '매일 07:20',
    lastRun: '2026-08-12 07:21',
    status: 'warn',
    fetched: 2,
    dropped: 2,
    ms: 24310,
    note: '응답 지연 — 재시도 1회 후 성공',
  },
  {
    id: 'J-05',
    source: '한국투자증권 리서치',
    schedule: '매일 07:30',
    lastRun: '2026-08-12 07:30',
    status: 'ok',
    fetched: 3,
    dropped: 2,
    ms: 6890,
  },
  {
    id: 'J-06',
    source: '신한투자증권 리서치',
    schedule: '매일 07:30',
    lastRun: '2026-08-12 07:31',
    status: 'ok',
    fetched: 2,
    dropped: 1,
    ms: 7720,
  },
  {
    id: 'J-07',
    source: '하나증권 리서치',
    schedule: '매일 07:40',
    lastRun: '2026-08-12 07:40',
    status: 'fail',
    fetched: 0,
    dropped: 0,
    ms: 30000,
    note: 'PDF 링크 구조 변경 — 셀렉터 수정 필요',
  },
  {
    id: 'J-08',
    source: '키움 · 메리츠 · 대신',
    schedule: '매일 07:50',
    lastRun: '2026-08-12 07:51',
    status: 'ok',
    fetched: 2,
    dropped: 2,
    ms: 11260,
  },
]

/* ── 검수 큐 — 태깅 신뢰도가 낮아 사람 판단이 필요한 건 ──── */

export interface PendingReport extends Report {
  /** 모델이 제안한 태그 (아직 확정 아님) */
  proposed: string[]
  /** 왜 큐에 남았는지 */
  reason: string
}

export const PENDING: PendingReport[] = [
  {
    id: 'P-2608-101',
    title: '하반기 자산배분 전략 — 위험자산 비중 축소 권고',
    house: '한국투자증권',
    analyst: '류지호',
    date: '2026-08-12',
    pages: 24,
    tags: [],
    proposed: ['매크로', 'ETF-패시브-지수'],
    reason: '상품군이 특정되지 않음 · 신뢰도 0.58',
    summary: [
      '하반기 성장 둔화를 전제로 위험자산 비중을 5~10%p 낮출 것을 권고한다.',
      '대체 자산으로 중기 국채와 배당주를 제시했으나 구체적 상품은 언급하지 않았다.',
      '금리 인하가 지연될 경우의 대안 시나리오를 별도 장으로 다뤘다.',
    ],
    excerpt:
      '자산배분은 예측이 아니라 대비다. 어느 쪽으로 가도 견딜 수 있게 짜 두는 것이 맞히려 애쓰는 것보다 낫다.',
    url: 'https://example.com/demo/report/P-2608-101.pdf',
    confidence: 0.58,
  },
  {
    id: 'P-2608-102',
    title: '2차전지 소재 업황 점검 — 재고 조정 마무리 국면',
    house: '키움증권',
    analyst: '노태식',
    date: '2026-08-12',
    pages: 19,
    tags: [],
    proposed: ['ETF-패시브-테마'],
    reason: '개별 종목 리포트로 보임 · 제외 키워드 후보',
    summary: [
      '주요 소재 업체의 재고 조정이 3분기 중 마무리될 것으로 전망했다.',
      '테마 ETF 편입 종목 중 상위 3개사의 가동률이 반등하고 있다.',
      '다만 판가 회복은 4분기 이후로 늦춰질 가능성이 크다.',
    ],
    excerpt:
      '업황 반등이 곧바로 주가 반등으로 이어지지는 않는다. 재고가 줄어도 판가가 회복되기까지는 시차가 있다.',
    url: 'https://example.com/demo/report/P-2608-102.pdf',
    confidence: 0.44,
  },
  {
    id: 'P-2608-103',
    title: '미 연준 9월 FOMC 프리뷰 — 점도표 하향 여부가 관건',
    house: '메리츠증권',
    analyst: '전유나',
    date: '2026-08-11',
    pages: 8,
    tags: [],
    proposed: ['금리', '매크로', '환율'],
    reason: '태그 3개 이상 제안 · 주 태그 불명확',
    summary: [
      '9월 FOMC에서 점도표가 하향 조정될지가 국내 금리 경로의 최대 변수다.',
      '연준이 동결을 유지할 경우 한미 금리차 확대로 환율 부담이 커진다.',
      '국내 장기물 금리는 미국 장기물과의 동조가 최근 다시 강해졌다.',
    ],
    excerpt:
      '한국은행이 먼저 내리고 연준이 버티면 금리차가 벌어지고, 그 부담은 환율로 나타난다.',
    url: 'https://example.com/demo/report/P-2608-103.pdf',
    confidence: 0.66,
  },
  {
    id: 'P-2608-104',
    title: '채권형 랩 상품 판매 동향 — 개인 자금 유입 지속',
    house: '대신증권',
    analyst: '한지원',
    date: '2026-08-11',
    pages: 6,
    tags: [],
    proposed: ['채권-회사채'],
    reason: '쪽수 하한(5쪽) 근접 · 단신 가능성',
    summary: [
      '개인의 채권형 랩 순유입이 3개월 연속 증가했다.',
      '평균 가입 금액은 낮아지고 계좌 수는 늘어 저변이 넓어지는 흐름이다.',
      '만기 3년 이내 상품에 자금이 집중됐다.',
    ],
    excerpt:
      '개인 투자자의 채권 접근이 늘고 있으나, 만기와 신용등급을 확인하지 않고 가입하는 사례가 함께 늘고 있다.',
    url: 'https://example.com/demo/report/P-2608-104.pdf',
    confidence: 0.61,
  },
  {
    id: 'P-2608-105',
    title: '월간 크레딧 — BBB급 스프레드 확대 조짐',
    house: '하나증권',
    analyst: '심우재',
    date: '2026-08-10',
    pages: 15,
    tags: [],
    proposed: ['채권-회사채', '금리'],
    reason: '신뢰도 0.68 · 하한 미달',
    summary: [
      'BBB급 회사채 스프레드가 2주 연속 벌어지며 하위 등급 경계감이 커졌다.',
      'AA급 이상은 여전히 안정적이며 등급 간 차별화가 뚜렷하다.',
      '경기 둔화가 확인되면 하위 등급부터 조정이 시작될 가능성이 있다.',
    ],
    excerpt:
      '스프레드는 시장이 매긴 위험의 가격이다. 벌어지기 시작하면 그 자체가 신호다.',
    url: 'https://example.com/demo/report/P-2608-105.pdf',
    confidence: 0.68,
  },
]

/* ── 챗봇 응답 로그 ──────────────────────────────────────── */

export interface ChatLog {
  id: string
  at: string
  q: string
  /** 근거 리포트를 붙여 답했는지 */
  grounded: boolean
  sources: string[]
  ms: number
  rating?: 'up' | 'down'
}

export const CHAT_LOGS: ChatLog[] = [
  { id: 'C-241', at: '08-12 09:41', q: '금리가 내리면 뭘 사야 하나요?', grounded: true, sources: ['R-2608-012', 'R-2608-011'], ms: 820, rating: 'up' },
  { id: 'C-240', at: '08-12 09:33', q: 'ETF 패시브랑 액티브 차이가 뭐예요?', grounded: true, sources: ['R-2608-021'], ms: 760, rating: 'up' },
  { id: 'C-239', at: '08-12 09:12', q: '삼성전자 지금 사도 되나요?', grounded: false, sources: [], ms: 410 },
  { id: 'C-238', at: '08-12 08:57', q: '비상금은 얼마나 있어야 해요?', grounded: true, sources: ['R-2608-008'], ms: 690, rating: 'up' },
  { id: 'C-237', at: '08-12 08:44', q: '연금저축 세액공제 한도가 어떻게 되나요?', grounded: false, sources: [], ms: 380 },
  { id: 'C-236', at: '08-11 21:20', q: '환헤지 상품이 더 나은가요?', grounded: true, sources: ['R-2608-006', 'R-2608-019'], ms: 910 },
  { id: 'C-235', at: '08-11 20:58', q: '국채랑 회사채 중에 뭐가 안전해요?', grounded: true, sources: ['R-2608-014'], ms: 730, rating: 'up' },
  { id: 'C-234', at: '08-11 20:31', q: '비트코인도 포트폴리오에 넣어야 하나요?', grounded: false, sources: [], ms: 350 },
  { id: 'C-233', at: '08-11 19:47', q: '듀레이션이 뭔가요?', grounded: true, sources: ['R-2608-011'], ms: 640, rating: 'up' },
  { id: 'C-232', at: '08-11 19:12', q: '적립식이 목돈보다 나은가요?', grounded: true, sources: ['R-2608-017', 'R-2608-008'], ms: 880, rating: 'down' },
  { id: 'C-231', at: '08-11 18:30', q: '지금 달러 사도 될까요?', grounded: true, sources: ['R-2608-019'], ms: 700 },
  { id: 'C-230', at: '08-11 18:02', q: '부동산이랑 비교하면 어때요?', grounded: false, sources: [], ms: 390 },
]

/* ── 운영 지표 ───────────────────────────────────────────── */

export const OPS = {
  /** 진단 완료 수 */
  diagnosed: 1284,
  /** 진단 시작 대비 완료 비율 */
  completion: 0.71,
  /** 평균 소요 (초) */
  avgSeconds: 168,
  /** 성향 분포 */
  profileMix: [
    { name: '안정형', v: 214 },
    { name: '안정추구형', v: 391 },
    { name: '위험중립형', v: 402 },
    { name: '적극투자형', v: 218 },
    { name: '공격투자형', v: 59 },
  ],
  /** 문항별 이탈률 — 어디서 창을 닫는지 */
  dropoff: [
    { q: 'q1', label: '연령', rate: 0.03 },
    { q: 'q2', label: '자금 사용 시점', rate: 0.06 },
    { q: 'q3', label: '지식 · 경험', rate: 0.11 },
    { q: 'q4', label: '투자 비중', rate: 0.05 },
    { q: 'q5', label: '소득 안정성', rate: 0.04 },
    { q: 'q6', label: '손실 시나리오', rate: 0.09 },
    { q: 'q7', label: '수익 기대', rate: 0.03 },
    { q: 'q8', label: '비상금', rate: 0.02 },
  ],
}
