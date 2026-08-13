/**
 * 샘플 데이터
 *
 * ⚠ 여기 담긴 리포트·발췌문·수치는 전부 화면 검증용으로 지어낸 것이다.
 *   실제 증권사 리포트가 아니며 투자 판단의 근거가 될 수 없다.
 *   나중에 수집 파이프라인이 붙으면 이 파일만 lib/api.ts 호출로 갈아 끼운다.
 *
 * 스키마는 수집 설계안의 메타데이터 정의를 그대로 따랐다.
 *   제목 · 증권사 · 발행일 · 3줄 요약 · 원본 PDF 링크 · 상품군 태그
 */

export const DEMO_TODAY = '2026-08-12'

/* ── 리포트 ──────────────────────────────────────────────── */

export interface Report {
  id: string
  title: string
  house: string
  analyst: string
  date: string
  pages: number
  /** LLM 태깅 보정 단계에서 붙는 상품군 태그 */
  tags: string[]
  /** 3줄 요약 */
  summary: string[]
  /** 근거로 인용하는 원문 발췌 */
  excerpt: string
  url: string
  /** 태깅 신뢰도 (0~1). 0.7 미만은 사람이 검수하도록 큐에 남긴다 */
  confidence: number
}

/* ── 실데이터 ────────────────────────────────────────────────
   collector/collect.py 가 네이버 리서치에서 긁어 만든 파일이다.
   더 이상 지어낸 샘플이 아니다.

       python collector/collect.py --pages 2

   다시 돌리면 이 JSON이 갱신되고 화면도 따라 바뀐다. */
import rawReports from '../data/reports.json'

interface RawReport {
  id: string
  title: string
  house: string
  analyst: string
  date: string
  category: string
  tags: string[]
  summary: string[]
  excerpt: string
  url: string
  confidence: number
  published: boolean
}

/** 검수를 통과한(신뢰도 0.7 이상) 리포트만 화면에 내보낸다.
 *  미달분은 관리자 검수 큐에 남아 있어야지, 근거로 인용되면 안 된다. */
export const REPORTS: Report[] = (rawReports as RawReport[])
  .filter((r) => r.published)
  .map((r) => ({
    id: r.id,
    title: r.title,
    house: r.house,
    analyst: r.analyst || '리서치센터',
    date: r.date,
    pages: 0,
    tags: r.tags,
    summary: r.summary,
    excerpt: r.excerpt,
    url: r.url,
    confidence: r.confidence,
  }))

/** 검수 대기분 — 관리자 화면에서 쓴다 */
export const PENDING_REPORTS = (rawReports as RawReport[]).filter((r) => !r.published)

/** 태그로 리포트를 고른다. 아래에서 근거를 실데이터로 연결할 때 쓴다.
 *  ID를 코드에 박아 두면 수집을 다시 돌릴 때마다 전부 깨진다. */
export function byTag(tag: string, n = 2): Report[] {
  const hit = REPORTS.filter((r) => r.tags.some((t) => t.startsWith(tag)))
  return (hit.length ? hit : REPORTS).slice(0, n)
}

export const idsByTag = (tag: string, n = 2) => byTag(tag, n).map((r) => r.id)

export const reportById = (id: string) => REPORTS.find((r) => r.id === id)

export const ALL_TAGS = [
  '채권-장기-국채',
  '채권-단기-국채',
  '채권-회사채',
  'ETF-패시브-지수',
  'ETF-패시브-테마',
  'ETF-액티브-지수',
  'ETF-액티브-테마',
  '금리',
  '환율',
  '매크로',
]

/* ── 상품 ────────────────────────────────────────────────── */

export type AssetKey =
  | 'cash'
  | 'govShort'
  | 'govLong'
  | 'corp'
  | 'etfPassive'
  | 'etfActive'

/** 색은 tokens.css의 --a1~--a6과 같은 값이다.
 *  SVG(recharts)에 그대로 넘겨야 해서 여기서는 hex로 둔다. */
export const ASSET_META: Record<
  AssetKey,
  { label: string; color: string; note: string }
> = {
  cash: { label: '현금성', color: '#e2d3ae', note: '비상금 · 파킹' },
  govShort: { label: '단기 국채', color: '#c6a877', note: '만기 1년 이내' },
  govLong: { label: '장기 국채', color: '#a9854a', note: '듀레이션 6년 내외' },
  corp: { label: '우량 회사채', color: '#8a6a32', note: 'AA- 이상' },
  etfPassive: { label: '패시브 ETF', color: '#6b5024', note: '지수추종' },
  etfActive: { label: '액티브 ETF', color: '#4a3717', note: '테마 · 초과성과' },
}

export const ASSET_ORDER: AssetKey[] = [
  'cash',
  'govShort',
  'govLong',
  'corp',
  'etfPassive',
  'etfActive',
]

export interface Product {
  id: string
  name: string
  ticker: string
  asset: AssetKey
  /** 상품군 태그 — 리포트 태그와 같은 체계를 쓴다 */
  tag: string
  /** 만기수익률 또는 기대수익률(연, %) */
  expected: number
  /** 총보수(연, %). 채권 직접투자는 0 */
  fee: number
  /** 1(매우 낮음) ~ 5(높음) */
  risk: number
  /** 한 줄 설명 */
  desc: string
  /** 눈높이 해설 — 왜 이걸 담는지 */
  why: string
  /** 근거 리포트 */
  sources: string[]
}

export const PRODUCTS: Product[] = [
  {
    id: 'P-CASH-01',
    name: '초단기 채권형 파킹',
    ticker: 'DEMO 0001',
    asset: 'cash',
    tag: '채권-단기-국채',
    expected: 2.4,
    fee: 0.05,
    risk: 1,
    desc: '하루만 맡겨도 이자가 붙고 언제든 뺄 수 있는 자리.',
    why: '먼저 3~6개월치 생활비를 여기 둡니다. 이 돈이 있어야 시장이 빠졌을 때 억지로 손해 보고 파는 일이 안 생겨요.',
    sources: idsByTag('채권-단기-국채', 2),
  },
  {
    id: 'P-GOVS-01',
    name: '국고채 1년 만기 매칭',
    ticker: 'DEMO 0002',
    asset: 'govShort',
    tag: '채권-단기-국채',
    expected: 2.38,
    fee: 0,
    risk: 1,
    desc: '만기 1년 이내 국채. 금리가 흔들려도 가격이 거의 안 움직입니다.',
    why: '나라가 갚는 돈이라 떼일 걱정이 사실상 없고, 만기가 짧아서 금리가 올라도 손실이 0.5% 수준에 그칩니다.',
    sources: idsByTag('채권-단기-국채', 2),
  },
  {
    id: 'P-GOVL-01',
    name: '국고채 10년 ETF',
    ticker: 'DEMO 0003',
    asset: 'govLong',
    tag: '채권-장기-국채',
    expected: 3.05,
    fee: 0.05,
    risk: 3,
    desc: '금리가 내려가면 가격이 올라가는, 이번 국면의 주인공.',
    why: '금리 인하 사이클에서는 이자보다 가격 상승으로 버는 몫이 커집니다. 다만 반대로 움직일 때 손실도 같은 크기라, 한 번에 담지 말고 3개월에 나눠 사세요.',
    sources: idsByTag('채권-장기-국채', 2),
  },
  {
    id: 'P-CORP-01',
    name: 'AA- 우량 회사채 3년',
    ticker: 'DEMO 0004',
    asset: 'corp',
    tag: '채권-회사채',
    expected: 3.12,
    fee: 0,
    risk: 2,
    desc: '국채보다 이자를 조금 더 주는 대신, 회사가 갚아야 합니다.',
    why: 'AA- 이상 등급은 지난 10년간 부도 사례가 사실상 없었습니다. 만기까지 들고 가면 중간 가격 등락은 신경 쓸 필요가 없어요.',
    sources: idsByTag('채권-회사채', 2),
  },
  {
    id: 'P-ETFP-01',
    name: 'S&P500 지수추종 ETF',
    ticker: 'DEMO 0005',
    asset: 'etfPassive',
    tag: 'ETF-패시브-지수',
    expected: 7.2,
    fee: 0.09,
    risk: 4,
    desc: '미국 대표 500개 기업을 통째로. 종목을 고르지 않습니다.',
    why: '한 회사가 망해도 지수는 사라지지 않습니다. 대신 시장 전체가 빠지는 구간은 그대로 맞아요. 20년 백테스트에서 최대 -35%까지 내려간 적이 있습니다.',
    sources: idsByTag('ETF-패시브', 2),
  },
  {
    id: 'P-ETFP-02',
    name: '코스피200 지수추종 ETF',
    ticker: 'DEMO 0006',
    asset: 'etfPassive',
    tag: 'ETF-패시브-지수',
    expected: 5.4,
    fee: 0.07,
    risk: 4,
    desc: '국내 대표 200개 기업. 환율 걱정이 없습니다.',
    why: '원화로 사고파니 환율 변동이 성과에 끼어들지 않습니다. 해외 상품과 절반씩 섞으면 환율이 어느 쪽으로 가도 충격이 반으로 줄어요.',
    sources: idsByTag('ETF-패시브', 2),
  },
  {
    id: 'P-ETFP-03',
    name: '배당성장 테마 ETF',
    ticker: 'DEMO 0007',
    asset: 'etfPassive',
    tag: 'ETF-패시브-테마',
    expected: 6.1,
    fee: 0.15,
    risk: 3,
    desc: '배당을 꾸준히 늘려 온 기업만 골라 담은 테마형.',
    why: '금리가 내려가면 이자 대신 배당을 찾는 돈이 늘어납니다. 다만 테마는 편입 종목이 좁으니 전체의 10~15%를 넘기지 마세요.',
    sources: idsByTag('ETF-패시브', 2),
  },
  {
    id: 'P-ETFA-01',
    name: '액티브 채권 ETF',
    ticker: 'DEMO 0008',
    asset: 'etfActive',
    tag: 'ETF-액티브-지수',
    expected: 3.9,
    fee: 0.29,
    risk: 3,
    desc: '운용역이 만기와 종목을 조정하는 채권형.',
    why: '액티브 상품 중 실제로 지수를 이긴 쪽은 채권형에 몰려 있었습니다. 그래도 보수가 3배 비싸니 뼈대가 아니라 곁가지로만 두세요.',
    sources: idsByTag('ETF-액티브', 2),
  },
]

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id)

/* ── 오늘의 시황 ─────────────────────────────────────────── */

export interface Metric {
  key: string
  value: string
  delta: number
  unit?: string
  /** 이 숫자를 어떻게 읽어야 하는지 한 줄 */
  note: string
}

export const MARKET: Metric[] = [
  {
    key: '기준금리',
    value: '2.25',
    delta: -0.25,
    unit: '%',
    note: '8월 금통위 인하 · 연내 1회 더 전망',
  },
  {
    key: '국고채 3년',
    value: '2.61',
    delta: -0.04,
    unit: '%',
    note: '전일 대비 · 인하 기대 선반영',
  },
  {
    key: '국고채 10년',
    value: '2.98',
    delta: -0.02,
    unit: '%',
    note: '전일 대비 · 30~40bp 하락 여지',
  },
  {
    key: '원/달러',
    value: '1,342',
    delta: 4.5,
    unit: '원',
    note: '전일 대비 · 연말 1,300원 전망',
  },
]

/** 국고채 10년 금리 추이 — 결과 화면 차트용 */
export const RATE_TREND = [
  { m: '2월', gov10: 3.42, base: 3.0 },
  { m: '3월', gov10: 3.38, base: 3.0 },
  { m: '4월', gov10: 3.24, base: 2.75 },
  { m: '5월', gov10: 3.16, base: 2.75 },
  { m: '6월', gov10: 3.09, base: 2.5 },
  { m: '7월', gov10: 3.02, base: 2.5 },
  { m: '8월', gov10: 2.98, base: 2.25 },
]

/* ── 오늘의 금융 지식 ────────────────────────────────────── */

export interface Lesson {
  term: string
  oneLine: string
  body: string
  source: string
}

export const LESSON: Lesson = {
  term: '듀레이션',
  oneLine: '금리가 1% 움직일 때 내 채권 값이 몇 % 흔들리는지를 나타내는 숫자',
  body: '듀레이션 6년짜리 채권을 들고 있는데 시장금리가 1%p 내려가면, 채권 값은 대략 6% 오릅니다. 반대로 금리가 1%p 오르면 6% 떨어지고요. 그래서 금리가 내려갈 것 같으면 긴 걸, 오를 것 같으면 짧은 걸 담습니다. 예측이 어렵다면 만기를 3·5·7년으로 나눠 담는 방법도 있어요.',
  source: idsByTag('금리', 1)[0],
}

/* ── 용어 사전 — <Term> 컴포넌트가 참조한다 ───────────────── */

export const GLOSSARY: Record<string, string> = {
  듀레이션:
    '금리가 1%p 움직일 때 채권 가격이 몇 % 변하는지를 나타내는 값. 숫자가 클수록 금리에 민감합니다.',
  기준금리:
    '한국은행이 정하는 기준이 되는 이자율. 이게 내려가면 예금 이자도 내려가고, 이미 발행된 채권 값은 올라갑니다.',
  국채: '나라가 돈을 빌리며 발행하는 채권. 발행 주체가 국가라 떼일 위험이 사실상 없습니다.',
  회사채:
    '기업이 발행하는 채권. 국채보다 이자를 더 주지만, 그 회사가 갚지 못할 위험을 투자자가 떠안습니다.',
  신용등급:
    '돈을 갚을 능력을 AAA부터 D까지 매긴 평가. AA- 이상을 보통 우량 등급으로 봅니다.',
  스프레드: '회사채 금리에서 같은 만기 국채 금리를 뺀 차이. 시장이 보는 그 회사의 위험 가격입니다.',
  ETF: '여러 종목을 한 바구니에 담아 주식처럼 사고팔 수 있게 만든 상품.',
  패시브: '지수를 그대로 따라가도록 만든 방식. 종목을 고르지 않아 보수가 쌉니다.',
  액티브: '운용역이 지수보다 잘해 보려고 비중을 조정하는 방식. 보수가 비쌉니다.',
  총보수: '상품을 들고 있는 동안 매년 떼는 수수료. 여기에 잡히지 않는 비용이 더 붙습니다.',
  괴리율: 'ETF의 시장 가격이 실제 가치보다 얼마나 비싸거나 싸게 거래되는지를 나타내는 값.',
  환헤지:
    '환율 변동을 성과에서 걷어내는 장치. 상품명 끝의 (H)가 표시이며, 대신 매년 비용이 듭니다.',
  MDD: '최대 낙폭. 고점에서 저점까지 얼마나 빠졌는지를 나타내며, 버틸 수 있는지를 가늠하는 숫자입니다.',
  적립식: '매달 일정 금액을 나눠 사는 방식. 비쌀 때 적게, 쌀 때 많이 사는 효과가 납니다.',
  만기사다리:
    '만기를 3·5·7년처럼 나눠 담는 구성. 금리를 못 맞혀도 성과 편차가 줄어듭니다.',
  벤치마크: '성과를 비교하는 기준 지수. 이걸 못 이기면 지수를 그냥 사는 게 나았다는 뜻입니다.',
}

/* ── 챗봇 시연 응답 ──────────────────────────────────────── */

export interface CannedAnswer {
  match: string[]
  text: string
  sources: string[]
}

export const CANNED: CannedAnswer[] = [
  {
    match: ['금리', '인하', '내리'],
    text: '지금은 금리를 내리는 국면이에요. 8월 금통위에서 기준금리가 2.25%로 0.25%p 내려갔고, 연내 한 번 더 내릴 거라는 전망이 우세합니다.\n\n금리가 내려가면 이미 발행된 채권은 상대적으로 이자를 더 주는 셈이 되어 값이 오릅니다. 그래서 이 국면에서는 만기가 긴 국채가 유리해요. 다만 예상이 빗나가면 손실도 같은 크기로 열려 있으니, 한 번에 담지 말고 나눠 사는 걸 권합니다.',
    sources: idsByTag('금리', 2),
  },
  {
    match: ['etf', '패시브', '액티브', '지수'],
    text: '패시브는 지수를 그대로 따라가고, 액티브는 운용역이 지수보다 잘해 보려고 조정하는 상품이에요.\n\n국내 상장 액티브 ETF 87개를 3년 기준으로 보면 지수를 이긴 건 47%에 그쳤습니다. 보수도 패시브 0.16% 대 액티브 0.52%로 세 배 넘게 차이가 나고요. 처음이라면 패시브를 뼈대로 두고, 액티브는 곁가지 정도로 생각하시는 편이 실패 확률이 낮습니다.',
    sources: idsByTag('ETF', 2),
  },
  {
    match: ['채권', '국채', '회사채'],
    text: '채권은 돈을 빌려주고 이자를 받는 상품이에요. 누구한테 빌려주느냐로 나뉩니다.\n\n· 국채 — 나라에 빌려줍니다. 떼일 걱정이 사실상 없고 이자는 낮아요.\n· 회사채 — 기업에 빌려줍니다. 이자를 더 주는 대신 그 회사가 갚아야 합니다.\n\nAA- 이상 우량 등급은 지난 10년 부도 사례가 거의 없었지만, BBB급 아래로 내려가면 경기가 나빠질 때 위험이 확 커집니다.',
    sources: idsByTag('채권-회사채', 2),
  },
  {
    match: ['비상금', '시작', '처음', '초보'],
    text: '가장 먼저 할 일은 상품을 고르는 게 아니라 비상금을 떼어 두는 거예요.\n\n신규 투자자가 중간에 그만두는 이유 1위는 시장이 빠져서가 아니라, 돈이 급해져서 하필 빠진 시점에 팔아야 했기 때문이었습니다. 3~6개월치 생활비를 언제든 뺄 수 있는 자리에 두세요. 그 돈은 불어나라고 두는 게 아니라 나머지 투자를 지키라고 두는 겁니다.',
    sources: idsByTag('채권-단기-국채', 1),
  },
  {
    match: ['환율', '달러', '헤지'],
    text: '해외 상품을 사면 그 나라 자산의 성과와 환율을 함께 떠안게 됩니다. 달러 자산이 5% 올라도 원/달러가 5% 내리면 원화 수익은 0에 가까워져요.\n\n환헤지형(이름 끝에 H)은 환율 영향을 걷어내는 대신 매년 1.2% 내외의 비용이 듭니다. 원화 자산이 이미 많다면 오히려 환노출형이 분산 효과 측면에서 낫다는 분석도 있어요.',
    sources: idsByTag('매크로', 2),
  },
]

export const SUGGESTS = [
  '금리가 내리면 뭘 사야 하나요?',
  'ETF 패시브랑 액티브 차이가 뭐예요?',
  '국채랑 회사채 중에 뭐가 안전해요?',
  '이제 막 시작하는데 뭐부터 해요?',
]

/* ── 상반된 관점 ─────────────────────────────────────────
   Slack의 RAG 설계 원칙: "의견이 갈리면 합치지 않고 병렬 제시한다."
   여러 리포트의 우열을 가리는 판단은 LLM에게도 사람에게도 맡기지 않는다.
   어느 쪽이 맞는지 고르는 대신, 갈렸다는 사실 자체를 보여 준다. */

export interface DivergentView {
  /** 어떤 주제에서 갈렸는가 */
  topic: string
  /** 질문에 이 말이 들어오면 병렬 제시를 띄운다 */
  match: string[]
  sides: {
    reportId: string
    /** 이 리포트의 입장을 한 줄로 */
    stance: string
    /** 그 근거 */
    ground: string
  }[]
}

/** 상반된 관점을 실데이터에서 만든다.
 *
 *  중요: 리포트의 '입장'을 우리가 지어내지 않는다. 실제 증권사 리포트에
 *  없는 주장을 붙이면 그 순간 인용이 아니라 창작이 된다.
 *  그래서 stance는 리포트 제목을, ground는 3줄 요약 첫 줄을 그대로 쓴다. */
function divergent(topic: string, match: string[], tagA: string, tagB: string): DivergentView | null {
  const a = byTag(tagA, 1)[0]
  const b = byTag(tagB, 1)[0]
  if (!a || !b || a.id === b.id) return null
  return {
    topic,
    match,
    sides: [
      { reportId: a.id, stance: a.title, ground: a.summary[0] ?? a.excerpt.slice(0, 160) },
      { reportId: b.id, stance: b.title, ground: b.summary[0] ?? b.excerpt.slice(0, 160) },
    ],
  }
}

export const DIVERGENT: DivergentView[] = [
  divergent(
    '금리 국면에서 채권 만기를 어디에 둘 것인가',
    ['금리', '인하', '장기', '단기', '듀레이션'],
    '채권-장기-국채',
    '채권-단기-국채',
  ),
  divergent('ETF를 어떻게 담을 것인가', ['액티브', '패시브', 'etf'], 'ETF-패시브', 'ETF-액티브'),
].filter((d): d is DivergentView => d !== null)

/* ── 알림 ────────────────────────────────────────────────
   ERD의 notifications 테이블에 대응한다. type은 정보/제안 두 가지뿐이고,
   모든 알림에 근거 리포트가 붙는다(evidence_report_id). 근거 없는 알림은
   만들지 않는다 — 알림이야말로 "카더라"가 끼어들기 쉬운 자리다. */

export interface Notification {
  id: string
  type: '정보' | '제안'
  title: string
  body: string
  evidenceReportId: string
  at: string
  read: boolean
}

export const NOTIFICATIONS: Notification[] = [
  {
    id: 'N-001',
    type: '제안',
    title: '보유 중인 장기 국채와 관련된 리포트가 올라왔어요',
    body: '금리 인하 사이클 진입으로 듀레이션 확대 구간이라는 관점입니다. 회원님 비중에서 채권이 45%라 영향이 있는 항목이에요.',
    evidenceReportId: idsByTag('금리', 1)[0],
    at: '2026-08-12T09:12:00+09:00',
    read: false,
  },
  {
    id: 'N-002',
    type: '정보',
    title: '오늘 수집된 리포트 7건 중 2건이 회원님 태그와 겹칩니다',
    body: '채권-장기-국채, 채권-단기-국채 태그입니다. 서재에서 3줄 요약을 확인하실 수 있어요.',
    evidenceReportId: idsByTag('금리', 1)[0],
    at: '2026-08-12T08:40:00+09:00',
    read: false,
  },
  {
    id: 'N-003',
    type: '정보',
    title: 'AA급 회사채 스프레드가 좁혀졌다는 분석이 나왔습니다',
    body: '크레딧 캐리 전략이 유효하다는 관점이며, 회원님 비중의 회사채 항목과 연결됩니다.',
    evidenceReportId: idsByTag('금리', 1)[0],
    at: '2026-08-11T17:05:00+09:00',
    read: true,
  },
]
