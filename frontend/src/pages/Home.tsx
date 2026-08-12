import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ASSET_META,
  ASSET_ORDER,
  DEMO_TODAY,
  LESSON,
  MARKET,
  PRODUCTS,
  REPORTS,
  SUGGESTS,
} from '../lib/mock'
import { PROFILES } from '../lib/survey'
import { finalAlloc } from '../lib/survey'
import { useProfile } from '../lib/store'
import { shortDate, signed } from '../lib/format'
import { CountUp, Reveal } from '../components/ui'
import { SourceChip, SourceList } from '../components/Evidence'
import { Term } from '../components/Term'
import { AllocDonut } from '../components/Charts'
import {
  IconArrowRight,
  IconBook,
  IconCoin,
  IconLayers,
  IconSearch,
  IconSend,
  IconShield,
  IconSparkle,
} from '../components/icons'

export default function Home() {
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const { diagnosis } = useProfile()

  // 진단 전에는 위험중립형을 예시로 보여 준다 (빈 화면을 만들지 않는다)
  const sample = diagnosis ? finalAlloc(diagnosis) : PROFILES[2].alloc
  const sampleName = diagnosis ? diagnosis.profile.name : '위험중립형'

  const ask = (text: string) => {
    const value = text.trim()
    if (!value) return
    window.dispatchEvent(new CustomEvent('quill:ask', { detail: value }))
    setQ('')
  }

  const picks = PRODUCTS.filter((p) => sample[p.asset] > 0).slice(0, 3)

  return (
    <>
      {/* ── 대문 ───────────────────────────────────────── */}
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <span className="eyebrow">
              <span className="rule-gold" />
              증권사 리포트 기반 자산 배분
            </span>

            <h1 className="mt-5">
              어려운 리포트는
              <br />
              제가 읽을게요.
              <span className="under">당신은 결정만 하시면 됩니다.</span>
            </h1>

            <p className="hero-lead">
              매일 쏟아지는 증권사 리포트에서 <Term k="채권">채권</Term>과{' '}
              <Term k="ETF">ETF</Term> 이야기만 골라 3줄로 줄이고, 당신의 투자 성향에 맞춰
              무엇을 왜 담아야 하는지 <b className="mark">근거와 함께</b> 알려 드립니다.
            </p>

            <div className="hero-sign">
              <span className="hand" style={{ fontSize: '1.55rem' }}>
                딱 3분, 8개 질문이면 끝나요
              </span>
            </div>

            <div className="hero-cta">
              <Link className="btn btn-primary btn-lg" to="/survey">
                내 투자 성향 진단하기
                <IconArrowRight size={17} />
              </Link>
              <Link className="btn btn-ghost btn-lg" to="/library">
                <IconBook size={17} />
                리포트 서재 둘러보기
              </Link>
            </div>

            <div className="hero-stats">
              <div className="hero-stat">
                <b>
                  <CountUp to={REPORTS.length} />건
                </b>
                <span>수집·태깅된 리포트</span>
              </div>
              <div className="hero-stat">
                <b>
                  <CountUp to={10} />종
                </b>
                <span>상품군 태그 체계</span>
              </div>
              <div className="hero-stat">
                <b>
                  <CountUp to={100} />%
                </b>
                <span>출처가 붙는 답변</span>
              </div>
            </div>
          </div>

          {/* 리포트가 겹쳐 쌓인 모습 */}
          <div className="hero-art" aria-hidden>
            <div className="paper-card p1">
              <div className="xs faint">{REPORTS[0].house}</div>
              <div className="strong small mt-2 clamp-2 keep">{REPORTS[0].title}</div>
              <div className="row wrap gap-1 mt-3">
                <span className="tag">채권 · 장기 · 국채</span>
                <span className="tag">금리</span>
              </div>
            </div>
            <div className="paper-card p2">
              <div className="row-between">
                <span className="xs faint">3줄 요약</span>
                <span className="badge badge-brand">태깅 완료</span>
              </div>
              <ul className="rep-sum col gap-2 mt-3">
                <li className="clamp-2">{REPORTS[0].summary[0]}</li>
                <li className="clamp-2">{REPORTS[0].summary[2]}</li>
              </ul>
            </div>
            <div className="paper-card p3">
              <div className="xs faint">오늘 수집</div>
              <div className="row gap-2 mt-2" style={{ alignItems: 'baseline' }}>
                <b className="num" style={{ fontSize: 26, fontWeight: 680 }}>
                  {REPORTS.filter((r) => r.date === DEMO_TODAY).length + 6}
                </b>
                <span className="small muted">건 · 키워드 미달 12건 폐기</span>
              </div>
            </div>
          </div>
        </div>

        {/* 질문 입력 — 대문 아래를 가로지른다 */}
        <div className="container mt-10">
          <form
            className="ask"
            onSubmit={(e) => {
              e.preventDefault()
              ask(q)
            }}
          >
            <IconSearch size={19} style={{ color: 'var(--ink-4)', flex: 'none' }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="금융, 뭐든 물어보세요.  예 · 금리가 내리면 뭘 사야 하나요?"
              aria-label="질문 입력"
            />
            <button className="btn btn-primary" disabled={!q.trim()}>
              물어보기
              <IconSend size={16} />
            </button>
          </form>
          <div className="suggests">
            {SUGGESTS.map((s) => (
              <button key={s} className="chip" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── 오늘의 시황 · 금융 지식 ─────────────────────── */}
      <section className="container" style={{ paddingBottom: 'var(--sp-12)' }}>
        <Reveal>
          <div className="brief">
            {MARKET.map((m) => (
              <div key={m.key}>
                <div className="brief-k">{m.key}</div>
                <div className="brief-v">
                  <b>{m.value}</b>
                  <span className="faint xs">{m.unit}</span>
                  <span
                    className={`delta ${m.delta > 0 ? 'up' : m.delta < 0 ? 'down' : 'flat'}`}
                  >
                    {signed(m.delta, m.key === '원/달러' ? 1 : 2)}
                  </span>
                </div>
                <p className="xs faint keep" style={{ marginTop: 10, lineHeight: 1.7 }}>
                  {m.note}
                </p>
              </div>
            ))}
            <div>
              <div className="row-between">
                <span className="brief-k">오늘의 금융 지식</span>
                <IconSparkle size={15} style={{ color: 'var(--gold)' }} />
              </div>
              <div className="strong mt-2" style={{ fontSize: 'var(--t-md)' }}>
                {LESSON.term}
              </div>
              <p className="small muted keep" style={{ marginTop: 4, lineHeight: 1.7 }}>
                {LESSON.oneLine}
              </p>
              <div className="mt-3">
                <SourceChip id={LESSON.source} />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── 완성된 포트폴리오 ───────────────────────────── */}
      <section className="section section-sunken">
        <div className="container">
          <Reveal>
            <div className="section-head">
              <span className="eyebrow">
                <span className="rule-gold" />
                결과 미리보기
              </span>
              <h2 className="mt-4">
                {diagnosis ? '당신의 포트폴리오입니다' : '이렇게 완성됩니다'}
              </h2>
              <p>
                {diagnosis
                  ? '진단 결과에 맞춰 짠 배분입니다. 항목마다 어떤 리포트를 근거로 삼았는지 함께 보여 드립니다.'
                  : '진단을 마치면 이런 화면을 받습니다. 아래는 위험중립형 예시이며, 모든 항목에 근거 리포트가 붙습니다.'}
              </p>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="card card-crest card-pad">
              <div
                className="row wrap gap-8"
                style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
              >
                <div className="row gap-6 wrap" style={{ alignItems: 'center' }}>
                  <AllocDonut alloc={sample} size={200} />
                  <div>
                    <span className="badge badge-brand">{sampleName}</span>
                    <div
                      className="display mt-3"
                      style={{ fontSize: 'var(--t-xl)', letterSpacing: '-0.03em' }}
                    >
                      채권으로 바닥을 받치고
                      <br />
                      지수로 성장을 따라갑니다
                    </div>
                    <p className="small muted keep mt-3" style={{ maxWidth: 330, lineHeight: 1.9 }}>
                      개별 종목·레버리지·파생은 다루지 않습니다. 현금성·채권·ETF만으로
                      구성해 초보 구간의 큰 손실을 먼저 막습니다.
                    </p>
                  </div>
                </div>

                <div style={{ flex: '1 1 320px', minWidth: 280 }}>
                  {ASSET_ORDER.filter((k) => sample[k] > 0).map((k) => (
                    <div className="alloc-row" key={k}>
                      <span
                        className="alloc-swatch"
                        style={{ background: ASSET_META[k].color }}
                      />
                      <div style={{ width: 112, flex: 'none' }}>
                        <div className="small strong">{ASSET_META[k].label}</div>
                        <div className="xs faint truncate">{ASSET_META[k].note}</div>
                      </div>
                      <div className="alloc-bar">
                        <i
                          style={{
                            width: `${sample[k]}%`,
                            background: ASSET_META[k].color,
                          }}
                        />
                      </div>
                      <span
                        className="num small strong"
                        style={{ width: 38, textAlign: 'right', flex: 'none' }}
                      >
                        {sample[k]}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <hr className="hairline-gold mt-6" />

              <div className="grid g3 mt-6">
                {picks.map((p) => (
                  <div key={p.id}>
                    <div className="row gap-2">
                      <span
                        className="alloc-swatch"
                        style={{ background: ASSET_META[p.asset].color }}
                      />
                      <span className="small strong">{p.name}</span>
                    </div>
                    <p className="small muted keep mt-2" style={{ lineHeight: 1.8 }}>
                      {p.desc}
                    </p>
                    <div className="mt-3">
                      <SourceList ids={p.sources} label="" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="row wrap gap-3 mt-8">
                <Link className="btn btn-primary" to={diagnosis ? '/result' : '/survey'}>
                  {diagnosis ? '전체 결과 보기' : '내 성향으로 만들기'}
                  <IconArrowRight size={16} />
                </Link>
                <span className="small faint">
                  진단 결과는 이 브라우저에만 저장됩니다 · 로그인 없음
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 왜 믿을 수 있나 ─────────────────────────────── */}
      <section className="section">
        <div className="container">
          <Reveal>
            <div className="section-head">
              <span className="eyebrow">
                <span className="rule-gold" />
                수집 파이프라인
              </span>
              <div
                className="script mt-4"
                style={{ fontSize: 'clamp(38px,5vw,58px)', color: 'var(--brand)' }}
              >
                Every answer, with its source.
              </div>
              <h2 className="mt-2" style={{ fontSize: 'clamp(30px,3.8vw,40px)' }}>
                지어내지 않습니다. 읽고 옮깁니다.
              </h2>
              <p>
                범용 챗봇은 그럴듯한 말을 길게 늘어놓습니다. Quill은 근거가 없으면
                없다고 답합니다. 아래 네 단계를 거친 리포트만 답변에 쓰입니다.
              </p>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <div className="pipe">
              <div className="pipe-step">
                <h4>수집</h4>
                <p>
                  공개 리서치 페이지를 매일 돌며 제목·증권사·발행일·요약·원문 PDF 링크를
                  메타데이터로 분리해 적재합니다.
                </p>
              </div>
              <div className="pipe-step">
                <h4>1차 필터</h4>
                <p>
                  제목이나 요약에 채권·ETF·금리 같은 지정 키워드가 없으면 그 자리에서
                  버립니다. 양보다 질을 먼저 봅니다.
                </p>
              </div>
              <div className="pipe-step">
                <h4>태깅 보정</h4>
                <p>
                  남은 리포트의 서론을 모델에 넣어 [채권-장기-국채] 같은 상품군 태그를 답니다.
                  신뢰도 70% 미만은 사람이 검수합니다.
                </p>
              </div>
              <div className="pipe-step">
                <h4>3줄 요약 · 인용</h4>
                <p>
                  핵심만 세 줄로 줄이고 인용할 원문 구간을 함께 저장합니다. 답변에는 이
                  구간이 그대로 붙습니다.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="grid g3 mt-6">
              <div className="card card-pad">
                <IconShield size={20} style={{ color: 'var(--brand)' }} />
                <h4 className="mt-3">출처 없는 문장은 안 씁니다</h4>
                <p className="small muted keep mt-2" style={{ lineHeight: 1.9 }}>
                  모든 답변 아래에 근거 리포트 칩이 붙고, 누르면 3줄 요약과 인용 원문이
                  그대로 열립니다.
                </p>
              </div>
              <div className="card card-pad">
                <IconCoin size={20} style={{ color: 'var(--brand)' }} />
                <h4 className="mt-3">안전자산부터 시작합니다</h4>
                <p className="small muted keep mt-2" style={{ lineHeight: 1.9 }}>
                  현금성·채권·ETF만 다룹니다. 개별 종목과 레버리지는 취급하지 않아
                  초보 구간의 큰 손실을 구조적으로 막습니다.
                </p>
              </div>
              <div className="card card-pad">
                <IconLayers size={20} style={{ color: 'var(--brand)' }} />
                <h4 className="mt-3">모르면 모른다고 합니다</h4>
                <p className="small muted keep mt-2" style={{ lineHeight: 1.9 }}>
                  수집된 리포트에 근거가 없으면 답을 만들어 내지 않고 그렇게 말씀드립니다.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 취급 상품 ───────────────────────────────────── */}
      <section className="section section-sunken">
        <div className="container">
          <Reveal>
            <div className="section-head">
              <span className="eyebrow">
                <span className="rule-gold" />
                취급 상품
              </span>
              <h2 className="mt-4">딱 두 가지만 깊게 다룹니다</h2>
              <p>
                넓게 벌리는 대신 <Term k="국채">국채</Term>·
                <Term k="회사채">회사채</Term>와 <Term k="ETF">ETF</Term>에 집중합니다.
                초보 구간에서 가장 자주 권해지지만, 정작 제대로 설명해 주는 곳이 없는
                상품군입니다.
              </p>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <div className="cover">
              <div className="cover-col">
                <h3>
                  <IconCoin size={20} style={{ color: 'var(--brand)' }} />
                  채권
                </h3>
                <ul className="tree">
                  <li className="t-head">국채 — 메이저 국가</li>
                  <li>단기 · 만기 1년 이내, 파킹과 비상금</li>
                  <li>장기 · 듀레이션 6년 내외, 금리 하락기 주력</li>
                  <li className="t-head">회사채</li>
                  <li>AA− 이상 우량 등급만 · 만기 보유 전제</li>
                </ul>
                <div className="mt-5">
                  <SourceList
                    ids={['R-2608-011', 'R-2608-009', 'R-2608-014']}
                    label="근거"
                  />
                </div>
              </div>

              <div className="cover-col">
                <h3>
                  <IconLayers size={20} style={{ color: 'var(--brand)' }} />
                  ETF
                </h3>
                <ul className="tree">
                  <li className="t-head">
                    <Term k="패시브">패시브</Term>
                  </li>
                  <li>지수추종 · 코스피200, S&amp;P500</li>
                  <li>테마 · 배당성장 등, 전체의 10~15% 이내</li>
                  <li className="t-head">
                    <Term k="액티브">액티브</Term>
                  </li>
                  <li>지수형 · 채권 액티브 위주</li>
                  <li>테마형 · 보수 부담이 커 곁가지로만</li>
                </ul>
                <div className="mt-5">
                  <SourceList
                    ids={['R-2608-017', 'R-2608-003', 'R-2608-021']}
                    label="근거"
                  />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Before / After ──────────────────────────────── */}
      <section className="section">
        <div className="container">
          <Reveal>
            <div className="section-head">
              <span className="eyebrow">
                <span className="rule-gold" />
                달라지는 것
              </span>
              <h2 className="mt-4">창을 닫지 않게 만드는 일</h2>
              <p>
                네이버 리서치 탭을 열었다가 전문 용어에 막혀 그냥 닫아 본 적 있다면,
                그 지점이 이 서비스가 시작되는 자리입니다.
              </p>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <div className="ba">
              <div className="ba-card ba-before">
                <div className="eyebrow" style={{ color: 'var(--ink-4)' }}>
                  Before
                </div>
                <q className="keep" style={{ display: 'block', marginTop: 16 }}>
                  금리가 내린다는데 나는 뭘 사야 하지? 리포트는 외계어 같아서 못 읽겠고…
                  그냥 남들이 많이 산다는 ETF 아무거나 사야겠다.
                </q>
              </div>
              <div className="ba-card ba-after">
                <div className="eyebrow">After</div>
                <q className="keep" style={{ display: 'block', marginTop: 16 }}>
                  아, 지금 금리 인하 기대 때문에 장기 국채를 담으라는 거구나. 이해하고 나니
                  확신을 갖고 넣을 수 있겠어.
                </q>
                <div className="mt-6">
                  <SourceList ids={['R-2608-011', 'R-2608-012']} label="이 답의 근거" />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 마지막 권유 ─────────────────────────────────── */}
      <section className="section section-sunken" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal>
            <div
              className="card card-pad"
              style={{ textAlign: 'center', padding: 'clamp(40px,6vw,72px)' }}
            >
              <span className="hand" style={{ fontSize: '1.9rem' }}>
                오늘 {shortDate(DEMO_TODAY)}, 8개 질문이면 됩니다
              </span>
              <h2
                className="script mt-4"
                style={{ fontSize: 'clamp(38px,5.4vw,60px)' }}
              >
                시작은 상품이 아니라 나를 아는 것부터
              </h2>
              <p
                className="muted keep mt-4"
                style={{ maxWidth: 520, margin: '16px auto 0', lineHeight: 1.9 }}
              >
                손실을 얼마나 견딜 수 있는지, 이 돈을 언제 쓸 건지부터 정리합니다.
                그다음에 상품 이야기를 합니다.
              </p>
              <div className="mt-8">
                <button className="btn btn-primary btn-lg" onClick={() => nav('/survey')}>
                  3분 진단 시작하기
                  <IconArrowRight size={17} />
                </button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
