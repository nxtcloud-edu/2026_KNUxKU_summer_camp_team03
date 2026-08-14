/**
 * 포트폴리오 — 기준 비중과 조정 예시를 나란히 놓는 화면
 *
 * 설계문서의 "2박자 리듬"을 그대로 구현했다.
 *   슬라이더를 움직이면  → 1~2단계 순수 연산이 즉시 다시 돈다 (밀리초)
 *   손을 떼고 1.2초 뒤   → 3단계 에이전트가 다시 검토한다 (디바운스)
 *
 * 두 레이어의 속도 차이를 몸으로 느끼게 하는 것이 목적이다.
 * "즉각 반응하는 계산"과 "한 박자 뒤 도착하는 의견"이 다른 것임을
 * 설명하지 않고 보여 준다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCopilot } from '../lib/copilot'
import {
  ALLOCATION_PARAMS,
  applyAdjustments,
  ASSET_COLOR,
  ASSET_LABEL,
  ASSET_NOTE,
  baselineWeights,
  type AdjustResult,
  type Adjustment,
  type Weights,
} from '../lib/quant'
import { idsByTag, PRODUCTS, reportById } from '../lib/mock'
import { DISCLAIMER } from '../lib/guardrails'
import AllocBar from '../components/AllocBar'
import { SourceList } from '../components/Evidence'
import { IconArrowRight, IconShield } from '../components/icons'

/** 오늘의 델타 제안 — 실제로는 Recommendation 에이전트가 만든다.
 *  근거 없는 제안 하나를 일부러 섞어, 코드가 폐기하는 모습을 보여 준다. */
/** 조정 이유는 지어내지 않는다. 근거 리포트의 제목을 그대로 인용한다.
 *  실제 증권사가 하지 않은 말을 우리가 만들어 붙이면 인용이 아니라 창작이다.
 *  실서비스에서는 Recommendation 에이전트가 본문을 읽고 쓰되, 여기서도
 *  "리포트가 한 말"의 범위를 넘지 않는다. */
const EVIDENCE_REASON = (() => {
  const r = reportById(idsByTag('채권-장기-국채', 1)[0])
  return r ? `${r.house} 「${r.title}」 관점을 반영했습니다.` : '근거 리포트 관점을 반영했습니다.'
})()

const PROPOSALS: Adjustment[] = [
  {
    asset: 'etf',
    delta_pp: -6,
    evidence_report_id: idsByTag('채권-장기-국채', 1)[0],
    reason: EVIDENCE_REASON,
  },
  {
    asset: 'bond',
    delta_pp: 6,
    evidence_report_id: idsByTag('채권-장기-국채', 1)[0],
    reason: EVIDENCE_REASON,
  },
  {
    asset: 'etf',
    delta_pp: 15,
    reason: '최근 지수 흐름이 좋아 보입니다.',
  },
]

/** 자산군별로 어떤 상품이 들어가는지 — 상품은 배분이 정해진 뒤에 고른다 */
const ASSET_PRODUCTS: Record<keyof Weights, string[]> = {
  cash: ['P-CASH-01'],
  bond: ['P-GOVL-01', 'P-CORP-01'],
  etf: ['P-ETFP-01', 'P-ETFP-02'],
}

export default function Portfolio() {
  const { input, profile, effectiveRisk, setOverride } = useCopilot()

  // 슬라이더가 만지는 값 — 즉시 반응해야 하므로 로컬에 둔다
  const [risk, setRisk] = useState(effectiveRisk ?? 50)
  const [reviewing, setReviewing] = useState(false)
  const [alloc, setAlloc] = useState<AdjustResult | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (effectiveRisk !== null) setRisk(effectiveRisk)
  }, [effectiveRisk])

  /* ── 1박자 · 순수 연산. 슬라이더를 움직이는 즉시 ── */
  const baseline = useMemo(() => baselineWeights(risk), [risk])

  /* ── 2박자 · 손을 뗀 뒤 디바운스로 에이전트 재검토 ── */
  useEffect(() => {
    setAlloc(null)
    setReviewing(true)
    if (timer.current) window.clearTimeout(timer.current)

    timer.current = window.setTimeout(() => {
      setAlloc(applyAdjustments(baseline, PROPOSALS))
      setReviewing(false)
    }, 1200)

    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [baseline])

  if (!input || !profile) {
    return (
      <div className="container" style={{ padding: '80px 24px' }}>
        <div className="narrow" style={{ textAlign: 'center' }}>
          <h1 className="ob-title">아직 조건이 없습니다</h1>
          <p className="muted keep mt-4" style={{ lineHeight: 1.9 }}>
            6개 질문에 답하시면 기준 비중을 계산해 드려요. 숫자는 전부 코드가 계산하고,
            에이전트는 근거를 들고 조정만 제안합니다.
          </p>
          <Link className="btn btn-primary btn-lg mt-8" to="/onboarding">
            성향 진단 시작
            <IconArrowRight size={16} />
          </Link>
        </div>
      </div>
    )
  }

  const shown = alloc?.adjusted ?? baseline

  return (
    <div className="pf-shell">
      <div className="pf-head">
        <span className="eyebrow">
          <span className="rule-gold" />
          내 포트폴리오
        </span>
        <h1 className="ob-title">
          기준은 코드가 잡고,
          <br />
          <span className="muted">조정은 근거가 있을 때만 합니다.</span>
        </h1>
      </div>

      {/* ── 위 · 위험점수·슬라이더·배분·근거를 한 덩어리로 ──────────
          예전엔 이 내용이 카드 두 개로 나뉘어 있었는데, 하나는 곧장
          다른 하나를 낳는 값이라(슬라이더→배분) 따로 쪼개면 관계없는
          두 블록처럼 보였다. 헤어라인 하나로만 안을 나눈다. */}
      <section className="pf-summary">
        <div className="row-between wrap gap-4">
          <div>
            <div className="pf-card-t">위험 점수</div>
            <div className="pf-risk num">{risk}</div>
          </div>
          <div className="pf-scores">
            <span>
              Capacity <b className="num">{profile.capacity}</b>
            </span>
            <span>
              Tolerance <b className="num">{profile.tolerance}</b>
            </span>
          </div>
        </div>

        {/* 슬라이더 — 1박자 */}
        <div className="pf-slider mt-5">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={risk}
            onChange={(e) => setRisk(Number(e.target.value))}
            onMouseUp={() => setOverride(risk)}
            onTouchEnd={() => setOverride(risk)}
            aria-label="위험 점수 조정"
          />
          <div className="pf-slider-scale">
            <span>안정</span>
            <span>공격</span>
          </div>
        </div>

        <p className="xs faint keep mt-3" style={{ lineHeight: 1.7 }}>
          슬라이더를 움직이면 기준 비중이 즉시 다시 계산됩니다. 손을 떼고 잠시 뒤
          에이전트가 오늘 리포트를 다시 읽고 조정을 제안해요.
        </p>

        <div className="pf-alloc-block">
          <AllocBar
            baseline={baseline}
            adjusted={alloc?.adjusted}
            rejected={alloc?.rejected.length}
          />

          {reviewing && (
            <div className="pf-reviewing">
              <span className="spinner" />
              에이전트가 오늘 리포트를 다시 읽고 있어요
            </div>
          )}

          {alloc && !!alloc.applied.length && (
            <div className="pf-reasons">
              {alloc.applied.map((a, i) => {
                const r = reportById(a.evidence_report_id!)
                return (
                  <div className="pf-reason" key={i}>
                    <span
                      className="pf-reason-dot"
                      style={{ background: ASSET_COLOR[a.asset] }}
                    />
                    <div className="grow">
                      <div className="small">
                        <b>
                          {ASSET_LABEL[a.asset]} {a.delta_pp > 0 ? '+' : ''}
                          {a.delta_pp}%p
                        </b>{' '}
                        — {a.reason}
                      </div>
                      {r && (
                        <div className="xs faint mt-1">
                          근거 · {r.house} 「{r.title}」 ({r.date})
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {alloc && !!alloc.rejected.length && (
            <div className="pf-rejected">
              <IconShield size={14} />
              <div>
                <b>폐기된 제안 {alloc.rejected.length}건</b>
                {alloc.rejected.map((r, i) => (
                  <div className="xs" key={i}>
                    「{r.adjustment.reason}」 — {r.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="pf-disc">{DISCLAIMER}</p>
      </section>

      {/* ── 아래 · 자산군 3열 ─────────────────────────────────────
          세로로 쌓지 않는다 — 성격이 같은 셋을 나란히 놓으면 grid가
          알아서 세 칸의 높이를 맞춰 준다. 카드 안에 또 카드를 넣지
          않고, 상품 사이도 헤어라인으로만 나눈다. */}
      <section className="pf-assets">
        {/* 배분 막대(AllocBar)가 그리는 순서(현금성·ETF·채권)와 맞춘다 —
            달랐던 예전엔 위 다이어그램과 아래 카드 순서가 서로 어긋나 보였다 */}
        {(['cash', 'etf', 'bond'] as (keyof Weights)[]).map((k) => (
          <div className="pf-asset" key={k}>
            <div className="row-between">
              <div className="row gap-2">
                <span className="pf-dot" style={{ background: ASSET_COLOR[k] }} />
                <span className="strong">{ASSET_LABEL[k]}</span>
              </div>
              <span className="pf-pct num">{shown[k]}%</span>
            </div>
            <div className="xs faint mt-1">{ASSET_NOTE[k]}</div>

            <div className="pf-prods">
              {ASSET_PRODUCTS[k]
                .map((id) => PRODUCTS.find((p) => p.id === id))
                .filter(Boolean)
                .map((p) => (
                  <div className="pf-prod" key={p!.id}>
                    <div className="small strong">{p!.name}</div>
                    <p className="xs muted keep mt-1" style={{ lineHeight: 1.7 }}>
                      {p!.why}
                    </p>
                    <div className="mt-2">
                      <SourceList ids={p!.sources} label="" />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── 파라미터 — 얇은 한 줄. 이것도 굳이 카드로 안 세운다 ──── */}
      <div className="pf-params">
        <span className="eyebrow">적용된 파라미터</span>
        <div className="pf-params-row">
          <Row k="현금 하한" v={`${ALLOCATION_PARAMS.cash_floor}%`} />
          <Row k="조정 한도" v={`±${ALLOCATION_PARAMS.adjust_cap_pp}%p`} />
          <Row
            k="스코어 배합"
            v={`capacity ${ALLOCATION_PARAMS.capacity_weight} : tolerance ${ALLOCATION_PARAMS.tolerance_weight}`}
          />
        </div>
        <p className="xs faint keep mt-3" style={{ lineHeight: 1.7 }}>
          이 값들은 코드가 아니라 파라미터 테이블에 있습니다. 운영 중 튜닝할 때 배포
          없이 바꿉니다.
        </p>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="pf-param-row">
      <span className="xs faint">{k}</span>
      <b className="num small">{v}</b>
    </div>
  )
}
