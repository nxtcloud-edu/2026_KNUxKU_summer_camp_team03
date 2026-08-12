import { useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useProfile } from '../lib/store'
import { finalAlloc, PROFILES } from '../lib/survey'
import {
  ASSET_META,
  ASSET_ORDER,
  PRODUCTS,
  type AssetKey,
} from '../lib/mock'
import { pct, riskLabel } from '../lib/format'
import { AllocDonut, AxisBars, RateChart } from '../components/Charts'
import { SourceList } from '../components/Evidence'
import { Term } from '../components/Term'
import { Reveal } from '../components/ui'
import { IconAlert, IconArrowRight, IconTarget, IconTrend } from '../components/icons'

export default function Result() {
  const { diagnosis, reset } = useProfile()

  const alloc = useMemo(
    () => (diagnosis ? finalAlloc(diagnosis) : null),
    [diagnosis]
  )

  /** 자산군별 대표 상품의 기대수익을 비중으로 가중 평균 */
  const expected = useMemo(() => {
    if (!alloc) return 0
    let sum = 0
    for (const k of ASSET_ORDER) {
      const inAsset = PRODUCTS.filter((p) => p.asset === k)
      if (!inAsset.length || !alloc[k]) continue
      const avg = inAsset.reduce((s, p) => s + p.expected - p.fee, 0) / inAsset.length
      sum += (alloc[k] / 100) * avg
    }
    return sum
  }, [alloc])

  /** 자산군 비중을 그 안의 상품들에 나눠 담는다.
   *  나누지 않으면 같은 자산군 상품이 각각 자산군 전체 비중으로 표시되어 합이 100%를 넘는다. */
  const weightOf = useMemo(() => {
    const map: Record<string, number> = {}
    if (!alloc) return map
    for (const k of ASSET_ORDER) {
      const inAsset = PRODUCTS.filter((x) => x.asset === k)
      if (!inAsset.length || !alloc[k]) continue
      const each = Math.floor(alloc[k] / inAsset.length)
      let rest = alloc[k] - each * inAsset.length
      inAsset.forEach((x) => {
        map[x.id] = each + (rest-- > 0 ? 1 : 0)
      })
    }
    return map
  }, [alloc])

  if (!diagnosis || !alloc) return <Navigate to="/survey" replace />

  const p = diagnosis.profile
  const level = PROFILES.findIndex((x) => x.key === p.key)
  const picks = PRODUCTS.filter((x) => (weightOf[x.id] ?? 0) > 0)
  const safe = alloc.cash + alloc.govShort + alloc.govLong + alloc.corp

  return (
    <div className="container" style={{ padding: 'var(--sp-12) 0 var(--sp-24)' }}>
      {/* ── 진단 결과 ─────────────────────────────────── */}
      <Reveal>
        <div className="verdict">
          <span className="eyebrow">
            <span className="rule-gold" />
            진단 결과
          </span>

          <div className="row-between wrap gap-8 mt-5" style={{ alignItems: 'flex-end' }}>
            <div>
              <div className="verdict-type">{p.name}</div>
              <div className="hand mt-3" style={{ fontSize: '1.7rem' }}>
                {p.oneLine}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="xs faint">성향 점수</div>
              <div
                className="num"
                style={{ fontSize: 44, fontWeight: 680, letterSpacing: '-0.04em', lineHeight: 1.1 }}
              >
                {diagnosis.score}
              </div>
              <div className="xs faint">100점 만점</div>
            </div>
          </div>

          <div className="scale">
            {PROFILES.map((x, i) => (
              <span
                key={x.key}
                className={`scale-seg${i <= level ? ' on' : ''}${i === level ? ' cur' : ''}`}
              />
            ))}
          </div>
          <div className="scale-label">
            {PROFILES.map((x, i) => (
              <span key={x.key} style={i === level ? { color: 'var(--brand)', fontWeight: 700 } : undefined}>
                {x.name}
              </span>
            ))}
          </div>

          <p className="keep mt-8" style={{ maxWidth: '46em', lineHeight: 1.95, color: 'var(--ink-2)' }}>
            {p.summary}
          </p>

          <div className="alert alert-warn mt-6">
            <IconAlert size={16} style={{ flex: 'none', marginTop: 3 }} />
            <div className="keep">{p.caution}</div>
          </div>
        </div>
      </Reveal>

      {/* ── 안전 장치가 개입한 경우 ───────────────────── */}
      {(diagnosis.shortHorizon || diagnosis.needsBuffer) && (
        <Reveal delay={40}>
          <div className="card card-pad mt-4" style={{ background: 'var(--brand-tint)' }}>
            <div className="row gap-3">
              <IconTarget size={19} style={{ color: 'var(--brand)', flex: 'none' }} />
              <div>
                <h4>성향 점수보다 먼저 적용한 규칙이 있습니다</h4>
                {diagnosis.shortHorizon && (
                  <p className="small keep mt-3" style={{ lineHeight: 1.9 }}>
                    1년 안에 써야 하는 돈이라고 답하셨습니다. 이 경우 점수가 아무리 높게
                    나와도 장기 국채와 주식형 ETF는 담지 않습니다. 만기 전에 팔아야 하면
                    손실이 확정되기 때문입니다. 전액을 현금성과 단기 국채로 옮겼습니다.
                  </p>
                )}
                {diagnosis.needsBuffer && !diagnosis.shortHorizon && (
                  <p className="small keep mt-3" style={{ lineHeight: 1.9 }}>
                    비상금이 확보되지 않았다고 답하셨습니다. 신규 투자자가 중간에 그만두는
                    첫째 이유는 시장 하락이 아니라 생활자금 부족이었습니다. 현금성 비중을
                    25%까지 먼저 채우고 나머지를 비례해서 줄였습니다.
                  </p>
                )}
                <div className="mt-4">
                  <SourceList ids={['R-2608-008', 'R-2608-009']} label="근거" />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      )}

      {/* ── 배분 ──────────────────────────────────────── */}
      <Reveal delay={60}>
        <div className="grid mt-6" style={{ gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)' }}>
          <div className="card card-pad">
            <h3 className="display" style={{ fontSize: 'var(--t-lg)' }}>
              추천 자산 배분
            </h3>
            <div className="row wrap gap-6 mt-5" style={{ alignItems: 'center' }}>
              <AllocDonut alloc={alloc} size={196} />
              <div className="grow" style={{ minWidth: 240 }}>
                {ASSET_ORDER.filter((k) => alloc[k] > 0).map((k: AssetKey) => (
                  <div className="alloc-row" key={k}>
                    <span className="alloc-swatch" style={{ background: ASSET_META[k].color }} />
                    <div style={{ width: 112, flex: 'none' }}>
                      <div className="small strong">{ASSET_META[k].label}</div>
                      <div className="xs faint truncate">{ASSET_META[k].note}</div>
                    </div>
                    <div className="alloc-bar">
                      <i style={{ width: `${alloc[k]}%`, background: ASSET_META[k].color }} />
                    </div>
                    <span
                      className="num small strong"
                      style={{ width: 36, textAlign: 'right', flex: 'none' }}
                    >
                      {alloc[k]}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <hr className="hairline-gold mt-6" />

            <div className="grid g3 mt-5">
              <div>
                <div className="xs faint">연 기대수익</div>
                <div className="num mt-1" style={{ fontSize: 'var(--t-xl)', fontWeight: 680 }}>
                  {pct(expected, 1)}
                </div>
                <div className="xs faint">보수 차감 후</div>
              </div>
              <div>
                <div className="xs faint">연 변동 폭</div>
                <div className="num mt-1" style={{ fontSize: 'var(--t-xl)', fontWeight: 680 }}>
                  ±{p.band}%
                </div>
                <div className="xs faint">통상 구간</div>
              </div>
              <div>
                <div className="xs faint">안전자산 비중</div>
                <div className="num mt-1" style={{ fontSize: 'var(--t-xl)', fontWeight: 680 }}>
                  {safe}%
                </div>
                <div className="xs faint">현금성 + 채권</div>
              </div>
            </div>

            <p className="xs faint keep mt-5" style={{ lineHeight: 1.85 }}>
              기대수익은 상품별 <Term k="총보수">총보수</Term>를 뺀 값을 비중으로 가중 평균한
              참고치입니다. 확정 수익률이 아니며, 실제 성과는 이 범위를 벗어날 수 있습니다.
            </p>
          </div>

          <div className="col gap-4">
            <div className="card card-pad">
              <h3 className="display" style={{ fontSize: 'var(--t-lg)' }}>
                다섯 축으로 본 당신
              </h3>
              <div className="mt-5">
                <AxisBars axes={diagnosis.axes} />
              </div>
            </div>

            <div className="card card-pad">
              <div className="row-between">
                <h3 className="display" style={{ fontSize: 'var(--t-lg)' }}>
                  왜 지금 장기 국채인가
                </h3>
                <IconTrend size={18} style={{ color: 'var(--gold)' }} />
              </div>
              <p className="small muted keep mt-3" style={{ lineHeight: 1.85 }}>
                <Term k="기준금리">기준금리</Term>가 내려가면 이미 발행된 채권 값은 오릅니다.
                <Term k="듀레이션">듀레이션</Term>이 길수록 그 폭이 큽니다.
              </p>
              <div className="mt-4">
                <RateChart height={168} />
              </div>
              <div className="mt-4">
                <SourceList ids={['R-2608-011', 'R-2608-012']} label="근거" />
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ── 상품별 해설 ───────────────────────────────── */}
      <Reveal delay={80}>
        <div className="section-head mt-12" style={{ marginBottom: 'var(--sp-6)' }}>
          <span className="eyebrow">
            <span className="rule-gold" />
            무엇을 왜 담는가
          </span>
          <h2 className="mt-4" style={{ fontSize: 'clamp(32px,4vw,42px)' }}>
            항목마다 이유를 적어 뒀습니다
          </h2>
        </div>

        <div className="col gap-4">
          {picks.map((x) => (
            <div className="pick" key={x.id}>
              <div>
                <div className="row wrap gap-2">
                  <span className="alloc-swatch" style={{ background: ASSET_META[x.asset].color }} />
                  <span className="strong" style={{ fontSize: 'var(--t-md)' }}>
                    {x.name}
                  </span>
                  <span className="tag">{x.tag.split('-').join(' · ')}</span>
                </div>
                <p className="small muted keep mt-2" style={{ lineHeight: 1.85 }}>
                  {x.desc}
                </p>
                <div className="pick-why">
                  <span className="hand" style={{ fontSize: '1.3rem', marginRight: 8 }}>
                    왜냐면
                  </span>
                  {x.why}
                </div>
                <div className="mt-4">
                  <SourceList ids={x.sources} label="근거" />
                </div>
              </div>

              <div className="pick-num">
                <div className="xs faint">배분</div>
                <b>{weightOf[x.id]}%</b>
                <div className="small muted mt-3">
                  기대 {pct(x.expected, 2)}
                </div>
                <div className="xs faint">
                  보수 {x.fee > 0 ? pct(x.fee, 2) : '없음'}
                </div>
                <div className="xs faint mt-2">위험 {riskLabel(x.risk)}</div>
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── 실행 순서 ─────────────────────────────────── */}
      <Reveal delay={100}>
        <div className="card card-pad mt-8">
          <h3 className="display" style={{ fontSize: 'var(--t-lg)' }}>
            이 순서대로 하시면 됩니다
          </h3>
          <ul className="checklist mt-4">
            <li>
              <span className="n">1</span>
              <span>
                먼저 3~6개월치 생활비를 <b>언제든 뺄 수 있는 자리</b>에 옮겨 둡니다. 이게
                되어 있지 않으면 나머지는 의미가 없습니다.
              </span>
            </li>
            <li>
              <span className="n">2</span>
              <span>
                증권 계좌를 만들고, 매달 자동이체를 겁니다.{' '}
                <Term k="적립식">적립식</Term>으로 넣은 그룹의 3년 유지율이 2.3배 높았습니다.
              </span>
            </li>
            <li>
              <span className="n">3</span>
              <span>
                장기 국채는 <b>한 번에 담지 말고 3개월에 나눠</b> 삽니다. 금리 예측이
                빗나가도 평균 매수 단가가 지켜집니다.
              </span>
            </li>
            <li>
              <span className="n">4</span>
              <span>
                ETF는 <Term k="총보수">총보수</Term>와{' '}
                <Term k="괴리율">괴리율</Term>을 먼저 확인합니다. 순자산 1,000억원 이상,
                일평균 거래대금 10억원 이상을 기준으로 보세요.
              </span>
            </li>
            <li>
              <span className="n">5</span>
              <span>
                6개월에 한 번만 열어 보고 비중을 원래대로 되돌립니다. 매일 보면 팔게 됩니다.
              </span>
            </li>
          </ul>
          <div className="mt-5">
            <SourceList ids={['R-2608-008', 'R-2607-035', 'R-2607-042']} label="근거" />
          </div>
        </div>
      </Reveal>

      {/* ── 마무리 ────────────────────────────────────── */}
      <Reveal delay={120}>
        <div className="row-between wrap gap-4 mt-8">
          <div className="row gap-3 wrap">
            <Link className="btn btn-primary" to="/library">
              근거 리포트 전부 보기
              <IconArrowRight size={16} />
            </Link>
            <button
              className="btn btn-ghost"
              onClick={() => {
                reset()
                window.location.assign('/survey')
              }}
            >
              처음부터 다시 진단
            </button>
          </div>
          <span className="small faint">결과는 이 브라우저에만 저장됩니다</span>
        </div>

        <div className="alert mt-6 keep" style={{ lineHeight: 1.9 }}>
          <IconAlert size={16} style={{ flex: 'none', marginTop: 3, color: 'var(--ink-4)' }} />
          <div>
            이 화면은 데모입니다. 표시된 리포트·수익률·시황은 전부 지어낸 샘플이며 실제
            자료가 아닙니다. 투자 권유나 자문이 아니고, 어떤 상품도 원금 손실이 발생할 수
            있습니다.
          </div>
        </div>
      </Reveal>
    </div>
  )
}
