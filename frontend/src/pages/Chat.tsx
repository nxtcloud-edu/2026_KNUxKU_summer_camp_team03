/**
 * 대화 화면 — 이 서비스의 메인이다.
 *
 * 왼쪽은 대화, 오른쪽은 근거 패널. 답변에 인용된 리포트가 오른쪽에 쌓이고,
 * 누르면 원문 발췌가 그 자리에서 열린다. "출처 없는 문장은 쓰지 않는다"는
 * 약속을 화면 구조 자체로 보여 주려는 배치다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { answer, TODAY_REPORTS, type ChatAnswer, type TraceStep } from '../lib/chatEngine'
import { useCopilot } from '../lib/copilot'
import { baselineWeights, riskProfile as calcProfile, type RiskProfile } from '../lib/quant'
import { reportById, SUGGESTS } from '../lib/mock'
import AllocBar from '../components/AllocBar'
import EvidencePanel from '../components/EvidencePanel'
import AgentTrace from '../components/AgentTrace'
import { IconArrowRight, IconQuill, IconSend, IconShield } from '../components/icons'

interface Msg {
  id: string
  role: 'user' | 'agent'
  text: string
  /** 스트리밍 중이면 여기까지만 보여 준다 */
  shown: number
  done: boolean
  data?: ChatAnswer
}

let seq = 0
const nextId = () => `m${++seq}`

/** 한 글자씩 흘리는 속도(ms). 실제 SSE로 바꾸면 이 값은 사라진다 */
const TICK = 12

export default function Chat() {
  const { input, profile, effectiveRisk } = useCopilot()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [trace, setTrace] = useState<TraceStep[]>([])
  const [traceOpen, setTraceOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // 새 내용이 흐를 때마다 바닥에 붙인다
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  /** 화면이 실제로 쓰는 프로필 — 슬라이더로 위험 점수를 덮어썼으면 그 값으로 다시 만든다 */
  const activeProfile: RiskProfile | null =
    profile && effectiveRisk !== null ? { ...profile, risk: effectiveRisk } : profile

  const send = useCallback(
    (text: string) => {
      const value = text.trim()
      if (!value || busy) return

      setQ('')
      setBusy(true)
      setMsgs((m) => [
        ...m,
        { id: nextId(), role: 'user', text: value, shown: value.length, done: true },
      ])

      const res = answer(value, activeProfile ?? undefined)
      setTrace(res.trace)

      // 에이전트가 도구를 호출하는 동안의 지연 — 트레이스 합계만큼 기다린다
      const think = res.trace.reduce((s, t) => s + t.ms, 0)
      const id = nextId()

      timers.current.push(
        window.setTimeout(() => {
          setMsgs((m) => [
            ...m,
            { id, role: 'agent', text: res.text, shown: 0, done: false, data: res },
          ])

          // 한 글자씩 흘린다
          const iv = window.setInterval(() => {
            setMsgs((m) =>
              m.map((x) => {
                if (x.id !== id) return x
                if (x.shown >= x.text.length) return x
                return { ...x, shown: Math.min(x.text.length, x.shown + 2) }
              }),
            )
          }, TICK)

          timers.current.push(
            window.setTimeout(
              () => {
                clearInterval(iv)
                setMsgs((m) => m.map((x) => (x.id === id ? { ...x, shown: x.text.length, done: true } : x)))
                setBusy(false)
              },
              (res.text.length / 2) * TICK + 120,
            ),
          )
        }, Math.min(think, 900)),
      )
    },
    [activeProfile, busy],
  )

  // 다른 화면에서 던진 질문을 받는다
  useEffect(() => {
    const onAsk = (e: Event) => send((e as CustomEvent<string>).detail)
    window.addEventListener('quill:ask', onAsk)
    return () => window.removeEventListener('quill:ask', onAsk)
  }, [send])

  /** 지금까지 인용된 리포트 (중복 제거, 최신 인용이 위로) */
  const cited: string[] = []
  for (let i = msgs.length - 1; i >= 0; i--) {
    for (const id of msgs[i].data?.evidence ?? []) {
      if (!cited.includes(id)) cited.push(id)
    }
  }

  const empty = msgs.length === 0

  return (
    <div className="chat-shell">
      {/* ── 대화 ─────────────────────────────────────── */}
      <section className="chat-main">
        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-inner">
            {empty && <Opening onPick={send} hasProfile={!!input} risk={effectiveRisk} />}

            {msgs.map((m) =>
              m.role === 'user' ? (
                <div className="bubble-row user" key={m.id}>
                  <div className="bubble bubble-user">{m.text}</div>
                </div>
              ) : (
                <div className="bubble-row agent" key={m.id}>
                  <span className="bubble-mark" aria-hidden>
                    <IconQuill size={15} />
                  </span>
                  <div className="grow">
                    {m.data?.notice && (
                      <div className="guard-notice">
                        <IconShield size={14} />
                        <span>{m.data.notice}</span>
                      </div>
                    )}

                    <div className="bubble bubble-agent">
                      <p className="chat-text">
                        {m.text.slice(0, m.shown)}
                        {!m.done && <span className="caret" aria-hidden />}
                      </p>

                      {m.done && m.data?.alloc && (
                        <div className="alloc-block">
                          <AllocBar
                            baseline={m.data.alloc.baseline}
                            adjusted={m.data.alloc.adjusted}
                            rejected={m.data.alloc.rejected.length}
                          />
                        </div>
                      )}

                      {m.done && !!m.data?.evidence.length && (
                        <div className="cite-row">
                          {m.data.evidence.map((id) => {
                            const r = reportById(id)
                            if (!r) return null
                            return (
                              <button
                                key={id}
                                className="cite"
                                onClick={() =>
                                  window.dispatchEvent(
                                    new CustomEvent('quill:open-report', { detail: id }),
                                  )
                                }
                              >
                                <span className="cite-house">{r.house}</span>
                                {r.title}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ),
            )}

            {busy && msgs[msgs.length - 1]?.role === 'user' && (
              <div className="bubble-row agent">
                <span className="bubble-mark" aria-hidden>
                  <IconQuill size={15} />
                </span>
                <div className="bubble bubble-agent thinking">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  <span className="small muted" style={{ marginLeft: 8 }}>
                    리포트를 찾고 있어요
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 입력 ── */}
        <div className="chat-composer">
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              send(q)
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="금융, 뭐든 물어보세요.  예 · 금리가 내리면 뭘 사야 하나요?"
              aria-label="질문 입력"
              disabled={busy}
            />
            <button className="btn btn-primary" disabled={!q.trim() || busy}>
              보내기
              <IconSend size={15} />
            </button>
          </form>
          <div className="composer-foot">
            <button
              className={`trace-toggle${traceOpen ? ' on' : ''}`}
              onClick={() => setTraceOpen((v) => !v)}
              disabled={!trace.length}
            >
              에이전트 트레이스 {trace.length ? `(${trace.length})` : ''}
            </button>
            <span className="xs faint">
              샘플 데이터 · 투자 권유가 아닙니다
            </span>
          </div>
          {traceOpen && !!trace.length && <AgentTrace steps={trace} />}
        </div>
      </section>

      {/* ── 근거 패널 ─────────────────────────────────── */}
      <EvidencePanel cited={cited} />
    </div>
  )
}

/* ── 대화 시작 화면 ─────────────────────────────────────── */

function Opening({
  onPick,
  hasProfile,
  risk,
}: {
  onPick: (s: string) => void
  hasProfile: boolean
  risk: number | null
}) {
  const w = risk !== null ? baselineWeights(risk) : null

  return (
    <div className="opening">
      <div className="opening-mark" aria-hidden>
        <span className="script-en script-sign">Quill</span>
      </div>

      <h1 className="opening-title">
        어려운 리포트는 제가 읽을게요.
        <br />
        <span className="opening-title-2">당신은 결정만 하시면 됩니다.</span>
      </h1>

      <p className="opening-lead">
        증권사 리포트에서 채권·ETF 이야기만 골라 읽고, 근거를 붙여 해설합니다.
        근거가 없으면 답을 만들지 않습니다.
      </p>

      {hasProfile && w ? (
        <div className="opening-card">
          <div className="row-between">
            <span className="eyebrow">현재 기준 비중</span>
            <span className="xs faint num">위험 점수 {risk}</span>
          </div>
          <div className="mt-3">
            <AllocBar baseline={w} compact />
          </div>
          <Link className="btn btn-soft btn-sm mt-4" to="/portfolio">
            포트폴리오 자세히 보기
            <IconArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="opening-card">
          <div className="row gap-3">
            <div className="grow">
              <div className="strong">아직 성향을 모릅니다</div>
              <p className="small muted keep mt-1">
                6개 질문에 답하면 기준 비중을 계산해 드려요. 숫자는 전부 코드가 계산하고,
                에이전트는 근거를 들고 조정만 제안합니다.
              </p>
            </div>
          </div>
          <Link className="btn btn-primary btn-sm mt-4" to="/onboarding">
            성향 진단 시작
            <IconArrowRight size={14} />
          </Link>
        </div>
      )}

      <div className="opening-suggests">
        {SUGGESTS.map((s) => (
          <button key={s} className="sug" onClick={() => onPick(s)}>
            {s}
          </button>
        ))}
        <button className="sug" onClick={() => onPick('내 비중은 어떻게 되나요?')}>
          내 비중은 어떻게 되나요?
        </button>
      </div>

      <div className="opening-today">
        <span className="eyebrow">오늘 들어온 리포트</span>
        <div className="mt-3 col gap-2">
          {TODAY_REPORTS.map((r) => (
            <div className="today-row" key={r.id}>
              <span className="today-house">{r.house}</span>
              <span className="truncate">{r.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 온보딩 입력이 없을 때 데모용으로 쓰는 중립 프로필 */
export const NEUTRAL_PROFILE = calcProfile({
  seedMoney: 10_000_000,
  monthlyInvest: 300_000,
  horizon: 'mid',
  targetReturn: 'inflation',
  drop20: 'hold',
  mddPct: 20,
})
