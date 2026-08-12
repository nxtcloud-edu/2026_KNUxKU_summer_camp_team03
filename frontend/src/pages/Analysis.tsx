import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useProfile } from '../lib/store'
import { REPORTS } from '../lib/mock'
import { readTag } from '../lib/format'
import { IconCheck, IconDoc, IconQuill } from '../components/icons'

const STEPS = [
  {
    title: '응답 정리',
    note: '8개 문항을 축별로 나눠 가중 합산합니다. 손실 감내에 30%를 줍니다.',
  },
  {
    title: '리포트 검색',
    note: '성향에 맞는 상품군 태그로 수집된 리포트를 좁힙니다.',
  },
  {
    title: '상품 스크리닝',
    note: '위험도·총보수·거래량 조건을 걸어 후보를 추립니다.',
  },
  {
    title: '배분 계산',
    note: '자산군별 비중을 정하고, 안전 장치 규칙이 성향 점수를 덮어씁니다.',
  },
  {
    title: '근거 연결',
    note: '항목마다 인용할 리포트 구간을 붙입니다. 근거가 없으면 항목을 뺍니다.',
  },
]

/** 단계별로 하나씩 쌓아 보여 줄 리포트 */
const PICKED = [
  'R-2608-012',
  'R-2608-011',
  'R-2608-009',
  'R-2608-017',
  'R-2608-008',
  'R-2607-042',
]

export default function Analysis() {
  const nav = useNavigate()
  const { diagnosis } = useProfile()
  const [step, setStep] = useState(0)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (!diagnosis) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      nav('/result', { replace: true })
      return
    }
    const timers: number[] = []
    STEPS.forEach((_, i) => {
      timers.push(window.setTimeout(() => setStep(i + 1), 620 * (i + 1)))
    })
    PICKED.forEach((_, i) => {
      timers.push(window.setTimeout(() => setShown(i + 1), 380 + 520 * i))
    })
    timers.push(
      window.setTimeout(() => nav('/result', { replace: true }), 620 * STEPS.length + 900)
    )
    return () => timers.forEach(clearTimeout)
  }, [diagnosis, nav])

  if (!diagnosis) return <Navigate to="/survey" replace />

  return (
    <div className="container analysis-wrap">
      <div>
        <span className="eyebrow">
          <span className="rule-gold" />
          분석 중
        </span>
        <h2
          className="script mt-4"
          style={{ fontSize: 'clamp(36px,4.8vw,52px)' }}
        >
          리포트를 읽고 있습니다
        </h2>
        <p className="muted keep mt-4" style={{ maxWidth: '30em', lineHeight: 1.9 }}>
          진단 결과에 맞는 리포트를 골라 상품을 추립니다. 각 단계에서 무엇을 참고했는지
          오른쪽에 그대로 쌓입니다.
        </p>

        <div className="steps">
          {STEPS.map((s, i) => {
            const state = i < step ? 'done' : i === step ? 'run' : ''
            return (
              <div className={`step ${state}`} key={s.title}>
                <span className="step-dot">
                  {i < step ? (
                    <IconCheck size={15} />
                  ) : i === step ? (
                    <span className="spinner" style={{ width: 13, height: 13, opacity: 1 }} />
                  ) : (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'currentColor',
                      }}
                    />
                  )}
                </span>
                <div className="grow">
                  <div className="step-title">{s.title}</div>
                  {i <= step && <div className="step-note">{s.note}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="row-between mb-4">
          <span className="eyebrow">
            <span className="rule-gold" />
            참고한 리포트
          </span>
          <span className="small muted num">{shown}건</span>
        </div>

        <div className="stack">
          {PICKED.slice(0, shown).map((id) => {
            const r = REPORTS.find((x) => x.id === id)!
            return (
              <div className="stack-item" key={id}>
                <IconDoc size={16} style={{ color: 'var(--gold)', flex: 'none' }} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="strong truncate" style={{ fontSize: 'var(--t-sm)' }}>
                    {r.title}
                  </div>
                  <div className="xs faint truncate">
                    {r.house} · {readTag(r.tags[0])}
                  </div>
                </div>
              </div>
            )
          })}
          {shown === 0 && (
            <div className="stack-item" style={{ color: 'var(--ink-4)' }}>
              <IconQuill size={16} style={{ flex: 'none' }} />
              불러오는 중…
            </div>
          )}
        </div>

        <p className="xs faint keep mt-6" style={{ lineHeight: 1.9 }}>
          지금은 시연용 진행 화면입니다. 실제 서비스에서는 이 자리에서 벡터 검색으로 후보
          리포트를 뽑고, 모델이 인용 구간을 지정합니다.
        </p>
      </div>
    </div>
  )
}
