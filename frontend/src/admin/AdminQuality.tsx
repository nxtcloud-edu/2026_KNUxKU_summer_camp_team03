/**
 * 챗봇 응답 품질
 *
 * 이 서비스가 범용 LLM과 갈라지는 지점은 "근거 없이 답하지 않는다"는 약속 하나다.
 * 그 약속이 지켜지는지 확인하는 화면이므로, 잘 답한 건보다
 * 근거 없이 넘어간 건을 먼저 보여 준다.
 */
import { useState } from 'react'
import { CHAT_LOGS } from '../lib/adminMock'
import { reportById } from '../lib/mock'
import { SourceList } from '../components/Evidence'
import { IconAlert, IconCheck, IconX } from '../components/icons'

type Filter = 'all' | 'ungrounded' | 'down'

export default function AdminQuality() {
  const [filter, setFilter] = useState<Filter>('ungrounded')

  const grounded = CHAT_LOGS.filter((c) => c.grounded)
  const rate = grounded.length / CHAT_LOGS.length
  const down = CHAT_LOGS.filter((c) => c.rating === 'down')
  const avgMs = Math.round(CHAT_LOGS.reduce((s, c) => s + c.ms, 0) / CHAT_LOGS.length)

  const list = CHAT_LOGS.filter((c) => {
    if (filter === 'ungrounded') return !c.grounded
    if (filter === 'down') return c.rating === 'down'
    return true
  })

  /** 근거 없이 넘어간 질문들을 주제별로 묶어 본다 — 다음에 무엇을 수집할지의 힌트 */
  const gaps = CHAT_LOGS.filter((c) => !c.grounded).map((c) => c.q)

  return (
    <div className="col gap-4">
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-k">근거 부착률</div>
          <div className="kpi-v" style={{ color: rate < 0.8 ? 'var(--warn)' : 'var(--ok)' }}>
            {Math.round(rate * 100)}%
          </div>
          <div className="kpi-s">
            {CHAT_LOGS.length}건 중 {grounded.length}건에 출처가 붙었습니다
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-k">근거 없이 답한 건</div>
          <div className="kpi-v">{CHAT_LOGS.length - grounded.length}</div>
          <div className="kpi-s">모두 "모른다"고 답했습니다</div>
        </div>
        <div className="kpi">
          <div className="kpi-k">부정 평가</div>
          <div className="kpi-v">{down.length}</div>
          <div className="kpi-s">근거는 있었으나 도움이 안 된 건</div>
        </div>
        <div className="kpi">
          <div className="kpi-k">평균 응답</div>
          <div className="kpi-v">{avgMs}ms</div>
          <div className="kpi-s">규칙 매칭 기준 · RAG 붙으면 늘어납니다</div>
        </div>
      </div>

      {gaps.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>답하지 못한 질문</h3>
              <div className="sub">
                다음에 무엇을 수집해야 하는지가 여기 적혀 있습니다
              </div>
            </div>
          </div>
          <div className="panel-body">
            <div className="row wrap gap-2">
              {gaps.map((g, i) => (
                <span key={i} className="kw" style={{ height: 30 }}>
                  {g}
                </span>
              ))}
            </div>
            <p className="xs faint keep mt-4" style={{ lineHeight: 1.85 }}>
              지금은 개별 종목·세제·부동산·가상자산 질문이 대부분입니다. 이 서비스가 다루지
              않기로 한 영역이므로 <b>수집 범위를 넓히는 대신 "다루지 않습니다"를 더 분명히
              말하는 편</b>이 맞습니다. 반대로 채권·ETF 안쪽 질문이 여기 쌓이기 시작하면
              그때는 필터 규칙이 너무 빡빡한 것입니다.
            </p>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>응답 로그</h3>
            <div className="sub">최근 {CHAT_LOGS.length}건</div>
          </div>
          <div className="tabs">
            <button
              className="tab"
              aria-selected={filter === 'ungrounded'}
              onClick={() => setFilter('ungrounded')}
            >
              근거 없음 {CHAT_LOGS.length - grounded.length}
            </button>
            <button
              className="tab"
              aria-selected={filter === 'down'}
              onClick={() => setFilter('down')}
            >
              부정 평가 {down.length}
            </button>
            <button
              className="tab"
              aria-selected={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              전체 {CHAT_LOGS.length}
            </button>
          </div>
        </div>

        <div className="panel-body">
          <div className="table-wrap">
            <table className="table adm-table">
              <thead>
                <tr>
                  <th style={{ width: 96 }}>시각</th>
                  <th>질문</th>
                  <th style={{ width: 260 }}>근거</th>
                  <th className="num-cell" style={{ width: 74 }}>
                    응답
                  </th>
                  <th style={{ width: 84 }}>평가</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td className="mono xs muted">{c.at}</td>
                    <td>
                      <span className="strong">{c.q}</span>
                      {!c.grounded && (
                        <div className="xs" style={{ color: 'var(--warn)', marginTop: 3 }}>
                          수집된 리포트에 근거가 없어 답하지 않음
                        </div>
                      )}
                    </td>
                    <td>
                      {c.sources.length > 0 ? (
                        <SourceList ids={c.sources.filter((s) => reportById(s))} label="" />
                      ) : (
                        <span className="st st-warn">
                          <IconAlert size={12} />
                          없음
                        </span>
                      )}
                    </td>
                    <td className="num-cell muted">{c.ms}ms</td>
                    <td>
                      {c.rating === 'up' ? (
                        <span className="st st-ok">
                          <IconCheck size={12} />
                          도움됨
                        </span>
                      ) : c.rating === 'down' ? (
                        <span className="st st-fail">
                          <IconX size={12} />
                          아쉬움
                        </span>
                      ) : (
                        <span className="xs faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel-foot">
          근거 부착률이 100%가 되는 것이 목표가 아닙니다. 모르는 질문에 "모른다"고 답한 건도
          여기서는 정상 처리로 봅니다. 위험한 건 <b>근거 없이 그럴듯하게 답하는 경우</b>이며,
          그런 건이 잡히면 즉시 여기 뜨도록 만들 자리입니다.
        </div>
      </div>
    </div>
  )
}
