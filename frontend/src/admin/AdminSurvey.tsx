/**
 * 설문 · 가중치
 *
 * 문항 자체는 코드에 고정돼 있고, 여기서는 채점 비중만 조정한다.
 * 문항 문구를 DB로 빼는 건 다음 단계 — 지금 편집 기능을 만들면
 * 이미 진단을 받은 사용자의 결과가 소급해서 달라지는 문제를 먼저 풀어야 한다.
 */
import { useState } from 'react'
import { QUESTIONS } from '../lib/survey'
import { OPS } from '../lib/adminMock'
import { getAdmin, setAdmin, useAdmin } from '../lib/overrides'
import { useToast } from '../components/ui'
import { IconAlert, IconCheck, IconChevronDown } from '../components/icons'

const AXIS_LABEL: Record<string, string> = {
  horizon: '기간 여력',
  literacy: '지식 · 경험',
  capacity: '감당 여력',
  tolerance: '손실 감내',
  purpose: '수익 기대',
}

export default function AdminSurvey() {
  const admin = useAdmin()
  const toast = useToast()
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(QUESTIONS.map((q) => [q.id, admin.weights[q.id] ?? q.weight]))
  )
  const [open, setOpen] = useState<string | null>(null)

  const total = QUESTIONS.reduce((s, q) => s + draft[q.id], 0)
  const dirty = QUESTIONS.some((q) => draft[q.id] !== (admin.weights[q.id] ?? q.weight))

  const dropoffOf = (qid: string) =>
    OPS.dropoff.find((d) => d.q === qid)?.rate ?? 0

  return (
    <div className="col gap-4">
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-k">문항 수</div>
          <div className="kpi-v">{QUESTIONS.length}</div>
          <div className="kpi-s">평균 응답 {OPS.avgSeconds}초</div>
        </div>
        <div className="kpi">
          <div className="kpi-k">가중치 합</div>
          <div className="kpi-v">{total}</div>
          <div className="kpi-s">
            합이 얼마든 100점으로 정규화됩니다 · 비율만 의미 있음
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-k">완주율</div>
          <div className="kpi-v">{Math.round(OPS.completion * 100)}%</div>
          <div className="kpi-s">시작 대비 결과 도달</div>
        </div>
        <div className="kpi">
          <div className="kpi-k">최대 이탈 문항</div>
          <div className="kpi-v" style={{ fontSize: 19 }}>
            지식 · 경험
          </div>
          <div className="kpi-s">11% 이탈</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>문항과 채점 비중</h3>
            <div className="sub">
              선택지 점수(0~4) × 가중치를 합산해 100점으로 환산합니다
            </div>
          </div>
        </div>

        <div className="panel-body">
          {QUESTIONS.map((q, i) => {
            const w = draft[q.id]
            const share = Math.round((w / total) * 100)
            const changed = w !== q.weight
            const isOpen = open === q.id
            const drop = dropoffOf(q.id)
            return (
              <div
                key={q.id}
                style={{
                  padding: '14px 0',
                  borderBottom:
                    i < QUESTIONS.length - 1 ? '1px solid var(--line-soft)' : undefined,
                }}
              >
                <div className="row gap-4 wrap">
                  <span
                    className="xs mono faint"
                    style={{ width: 26, flex: 'none', paddingTop: 3 }}
                  >
                    {q.id}
                  </span>

                  <div style={{ flex: '1 1 300px', minWidth: 240 }}>
                    <button
                      className="row gap-2"
                      style={{ textAlign: 'left', width: '100%' }}
                      onClick={() => setOpen(isOpen ? null : q.id)}
                    >
                      <span className="small strong keep">{q.title}</span>
                      <IconChevronDown
                        size={14}
                        style={{
                          color: 'var(--ink-4)',
                          flex: 'none',
                          transform: isOpen ? 'rotate(180deg)' : undefined,
                          transition: 'transform .2s',
                        }}
                      />
                    </button>
                    <div className="row gap-2 mt-1">
                      <span className="tag">{AXIS_LABEL[q.axis]}</span>
                      <span className="xs faint">선택지 {q.choices.length}개</span>
                      {drop >= 0.09 && (
                        <span className="xs" style={{ color: 'var(--danger)' }}>
                          이탈 {(drop * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="row gap-3" style={{ flex: '1 1 260px', minWidth: 220 }}>
                    <input
                      className="slider grow"
                      type="range"
                      min={0}
                      max={40}
                      step={1}
                      value={w}
                      onChange={(e) =>
                        setDraft({ ...draft, [q.id]: Number(e.target.value) })
                      }
                    />
                    <span
                      className="num strong"
                      style={{
                        width: 66,
                        textAlign: 'right',
                        flex: 'none',
                        color: changed ? 'var(--brand)' : undefined,
                      }}
                    >
                      {w}
                      <span className="xs faint"> · {share}%</span>
                    </span>
                  </div>
                </div>

                {isOpen && (
                  <div
                    className="mt-3"
                    style={{
                      marginLeft: 42,
                      padding: '12px 16px',
                      borderRadius: 'var(--r-md)',
                      background: 'var(--surface-sunken)',
                    }}
                  >
                    {q.help && (
                      <p className="xs muted keep mb-3" style={{ lineHeight: 1.75 }}>
                        {q.help}
                      </p>
                    )}
                    {q.choices.map((c, ci) => (
                      <div
                        key={ci}
                        className="row-between"
                        style={{ padding: '5px 0', fontSize: 'var(--t-sm)' }}
                      >
                        <span>
                          <span className="faint mono" style={{ marginRight: 8 }}>
                            {ci + 1}
                          </span>
                          {c.text}
                          {c.sub && <span className="xs faint"> · {c.sub}</span>}
                        </span>
                        <span className="num small strong" style={{ flex: 'none' }}>
                          {c.score}점
                        </span>
                      </div>
                    ))}
                    <p className="xs faint mt-3">
                      문항 문구와 선택지는 코드에 고정돼 있습니다. DB로 옮기려면 이미
                      진단받은 사용자의 결과를 어떻게 처리할지부터 정해야 합니다.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="panel-foot">
          손실 감내 문항(q6)의 비중이 가장 큽니다. 이 값을 낮추면 전체 사용자의 성향 점수가
          올라가 위험자산 비중이 함께 올라갑니다.
        </div>
      </div>

      {dirty && (
        <div className="savebar">
          <IconAlert size={15} style={{ color: 'var(--gold-bright)', flex: 'none' }} />
          <span className="grow">
            가중치를 바꿨습니다. 저장하면 이후 진단부터 적용됩니다.
          </span>
          <button
            className="btn btn-sm btn-ghost"
            style={{ color: '#f3ead8' }}
            onClick={() =>
              setDraft(
                Object.fromEntries(
                  QUESTIONS.map((q) => [q.id, admin.weights[q.id] ?? q.weight])
                )
              )
            }
          >
            되돌리기
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              const next: Record<string, number> = {}
              for (const q of QUESTIONS) {
                if (draft[q.id] !== q.weight) next[q.id] = draft[q.id]
              }
              setAdmin({ weights: next })
              toast('가중치를 저장했습니다')
            }}
          >
            <IconCheck size={14} />
            저장
          </button>
        </div>
      )}

      <div className="row-between">
        <span className="xs faint">기본값과 다른 항목은 갈색으로 표시됩니다.</span>
        <button
          className="btn btn-sm btn-ghost"
          disabled={Object.keys(getAdmin().weights).length === 0}
          onClick={() => {
            setAdmin({ weights: {} })
            setDraft(Object.fromEntries(QUESTIONS.map((q) => [q.id, q.weight])))
            toast('기본 가중치로 되돌렸습니다')
          }}
        >
          기본값으로 초기화
        </button>
      </div>
    </div>
  )
}
