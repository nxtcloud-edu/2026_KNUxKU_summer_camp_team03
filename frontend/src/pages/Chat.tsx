/**
 * 대화 화면 — 이 서비스의 메인이다.
 *
 * 세 칸으로 나눈다.
 *   왼쪽   사이드바 — 메뉴 + 대화 기록(확인 키를 만든 경우에만 채워진다)
 *   가운데 대화
 *   오른쪽 근거 패널 — 인용된 리포트가 쌓이고 그 자리에서 원문이 열린다
 *
 * "출처 없는 문장은 쓰지 않는다"는 약속을 화면 구조로 보여 주려는 배치다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { type ChatAnswer, type TraceStep } from '../lib/chatEngine'
import { askChat, clearSession } from '../lib/api'
import { useCopilot } from '../lib/copilot'
import type { RiskProfile } from '../lib/quant'
import { reportById, SUGGESTS } from '../lib/mock'
import {
  createVault,
  destroyVault,
  loadConversations,
  saveConversations,
  unlockVault,
  vaultExists,
  type Conversation,
} from '../lib/vault'
import AllocBar from '../components/AllocBar'
import EvidencePanel from '../components/EvidencePanel'
import AgentTrace from '../components/AgentTrace'
import ParallelViews from '../components/ParallelViews'
import RichText from '../components/RichText'
import InkText from '../components/InkText'
import ChatVault, { type VaultState } from '../components/ChatVault'
import WelcomeModal from '../components/WelcomeModal'
import AppSidebar from '../components/AppSidebar'
import { IconChat, IconQuill, IconSend, IconShield } from '../components/icons'

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

/** 손글씨 리듬 — 사람이 쓰듯 고르지 않게 흘린다.
 *
 *  균일한 속도가 '출력'처럼 보이게 만드는 가장 큰 원인이다. 글자마다
 *  쓰는 데 걸리는 시간이 실제로 다르다는 점을 그대로 반영했다.
 *
 *    한글 한 음절   획이 여럿이라 오래 걸린다
 *    영문·숫자      획이 적어 빠르다
 *    띄어쓰기       펜을 종이에서 뗀다
 *    문장 끝        손이 멈추고 다음 문장을 생각한다
 *
 *  실제 SSE로 바꾸면 이 함수는 사라지고 서버가 주는 토큰 간격을 쓴다.
 */
function penDelay(ch: string): number {
  // 문장을 맺고 나면 손이 쉰다
  if ('.!?'.includes(ch)) return 300 + Math.random() * 90
  if (ch === '\n') return 200
  if (',·'.includes(ch)) return 130 + Math.random() * 40
  // 펜을 떼는 순간
  if (ch === ' ') return 52 + Math.random() * 26

  // 한글 음절 — 획이 많아 가장 오래 걸린다
  if (/[가-힣]/.test(ch)) return 34 + Math.random() * 26
  // 영문·숫자 — 획이 적다
  if (/[a-zA-Z0-9]/.test(ch)) return 19 + Math.random() * 14

  return 24 + Math.random() * 16
}

export default function Chat() {
  const { profile, effectiveRisk } = useCopilot()
  const [chatMode, setChatMode] = useState<'chat' | 'persona'>('chat')
  const [chatMsgs, setChatMsgs] = useState<Msg[]>([])
  const [personaMsgs, setPersonaMsgs] = useState<Msg[]>([])
  const msgs = chatMode === 'chat' ? chatMsgs : personaMsgs
  const setMsgs = chatMode === 'chat' ? setChatMsgs : setPersonaMsgs
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [trace, setTrace] = useState<TraceStep[]>([])
  const [traceOpen, setTraceOpen] = useState(false)
  /** 답변 본문을 만년필 명조로 쓸지. 질문은 사용자가 친 글이라 그대로 둔다. */
  const [pen, setPen] = useState<boolean>(
    () => localStorage.getItem('quill.pen') !== 'off',
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  /** 최신 메시지 목록. 저장할 때 setMsgs 안에서 다른 상태를 건드리지 않으려고 둔다 */
  const msgsRef = useRef<Msg[]>([])

  /* ── 보관함 ── */
  const [vault, setVault] = useState<VaultState>(() => (vaultExists() ? 'locked' : 'off'))
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null)
  const [convos, setConvos] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  /** send()가 만든 클로저는 예전 activeId를 붙들고 있다.
   *  같은 대화를 두 번 저장하지 않으려면 현재 값을 ref로 따로 들고 있어야 한다. */
  const activeIdRef = useRef<string | null>(null)
  const [vaultErr, setVaultErr] = useState<string | null>(null)
  const [vaultBusy, setVaultBusy] = useState(false)

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(() => {
    localStorage.setItem('quill.pen', pen ? 'on' : 'off')
  }, [pen])

  // 새 내용이 흐를 때마다 바닥에 붙인다
  useEffect(() => {
    msgsRef.current = msgs
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  /** 화면이 실제로 쓰는 프로필 — 슬라이더로 위험 점수를 덮어썼으면 그 값으로 */
  const activeProfile: RiskProfile | null =
    profile && effectiveRisk !== null ? { ...profile, risk: effectiveRisk } : profile

  /* ── 보관함 조작 ─────────────────────────────────── */

  const createKey = async (pin: string) => {
    setVaultBusy(true)
    setVaultErr(null)
    const key = await createVault(pin)
    setVaultKey(key)
    setConvos([])
    setVault('open')
    setVaultBusy(false)
  }

  const unlock = async (pin: string) => {
    setVaultBusy(true)
    setVaultErr(null)
    const key = await unlockVault(pin)
    if (!key) {
      setVaultErr('확인 키가 맞지 않습니다.')
      setVaultBusy(false)
      return
    }
    setVaultKey(key)
    setConvos(await loadConversations(key))
    setVault('open')
    setVaultBusy(false)
  }

  const lock = () => {
    setVaultKey(null)
    setConvos([])
    setVault('locked')
  }

  const wipe = () => {
    destroyVault()
    setVaultKey(null)
    setConvos([])
    setActive(null)
    setVault('off')
    setVaultErr(null)
  }

  /** activeId는 항상 ref와 함께 움직인다 */
  const setActive = (id: string | null) => {
    activeIdRef.current = id
    setActiveId(id)
  }

  const newChat = () => {
    setChatMsgs([])
    setPersonaMsgs([])
    setActive(null)
    setTrace([])
    clearSession()
  }

  const openConvo = (id: string) => {
    const c = convos.find((x) => x.id === id)
    if (!c) return
    setActive(id)
    setTrace([])
    setMsgs(
      c.messages.map((m) => ({
        id: nextId(),
        role: m.role,
        text: m.text,
        shown: m.text.length,
        done: true,
        data: m.evidence
          ? ({ text: m.text, evidence: m.evidence, trace: [] } as ChatAnswer)
          : undefined,
      })),
    )
  }

  /** 대화가 끝날 때마다 보관함에 밀어 넣는다 (열려 있을 때만) */
  const persist = useCallback(
    (all: Msg[]) => {
      if (vault !== 'open' || !vaultKey) return
      const first = all.find((m) => m.role === 'user')
      if (!first) return

      const record: Conversation = {
        id: activeIdRef.current ?? `c${Date.now()}`,
        title: first.text.slice(0, 40),
        at: new Date().toISOString(),
        messages: all.map((m) => ({
          role: m.role,
          text: m.text,
          evidence: m.data?.evidence,
        })),
      }

      setConvos((prev) => {
        const next = [record, ...prev.filter((c) => c.id !== record.id)]
        void saveConversations(vaultKey, next)
        return next
      })
      activeIdRef.current = record.id
      setActiveId(record.id)
    },
    [vault, vaultKey],
  )

  /* ── 전송 ────────────────────────────────────────── */

  const send = useCallback(
    async (text: string) => {
      const value = text.trim()
      if (!value || busy) return

      setQ('')
      setBusy(true)
      const userMsg: Msg = {
        id: nextId(),
        role: 'user',
        text: value,
        shown: value.length,
        done: true,
      }
      setMsgs((m) => [...m, userMsg])

      const res = await askChat(value, activeProfile ?? undefined, chatMode)
      setTrace(res.trace)

      const think = res.trace.reduce((s, t) => s + t.ms, 0)
      const id = nextId()

      timers.current.push(
        window.setTimeout(() => {
          setMsgs((m) => [
            ...m,
            { id, role: 'agent', text: res.text, shown: 0, done: false, data: res },
          ])

          // 한 글자씩, 글자마다 다른 간격으로
          let i = 0
          const write = () => {
            if (i >= res.text.length) {
              setMsgs((m) =>
                m.map((x) => (x.id === id ? { ...x, shown: x.text.length, done: true } : x)),
              )
              setBusy(false)
              // 저장은 상태 반영이 끝난 뒤에 한다
              timers.current.push(window.setTimeout(() => persist(msgsRef.current), 0))
              return
            }
            i += 1
            setMsgs((m) => m.map((x) => (x.id === id ? { ...x, shown: i } : x)))
            timers.current.push(window.setTimeout(write, penDelay(res.text[i - 1])))
          }
          write()
        }, Math.min(think, 900)),
      )
    },
    [activeProfile, busy, persist],
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

  return (
    <div className="app-row">
      <AppSidebar
        newChat={
          <button className="side-link side-newchat" onClick={newChat}>
            <IconChat size={18} />
            <span>새 대화</span>
          </button>
        }
        history={
          <ChatVault
            state={vault}
            list={convos}
            activeId={activeId}
            error={vaultErr}
            busy={vaultBusy}
            onCreate={createKey}
            onUnlock={unlock}
            onOpen={openConvo}
            onLock={lock}
            onDestroy={wipe}
          />
        }
      />

    <div className="chat-shell">
      <WelcomeModal />

      {/* ── 대화 ─────────────────────────────────────── */}
      <section className="chat-main">
        {/* ── 리서치/훈수 탭 전환 ── */}
        <div className="chat-mode-tabs">
          <button
            className={`chat-mode-tab${chatMode === 'chat' ? ' active' : ''}`}
            onClick={() => setChatMode('chat')}
          >
            🔬 리서치
          </button>
          <button
            className={`chat-mode-tab${chatMode === 'persona' ? ' active' : ''}`}
            onClick={() => setChatMode('persona')}
          >
            💬 훈수
          </button>
        </div>

        <div className="chat-scroll" ref={scrollRef}>
          <div className={`chat-inner${msgs.length === 0 ? ' chat-inner-empty' : ''}`}>
            {msgs.length === 0 && <Opening onPick={send} />}

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

                    {/* ── 훈수 탭: 페르소나 카드 렌더링 ── */}
                    {m.done && m.data?.personas && m.data.personas.length > 0 ? (
                      <div className="persona-cards">
                        {m.data.personas.map((p) => (
                          <div className="persona-card" key={p.persona}>
                            <div className="persona-card-header">
                              {p.emoji} {p.persona} ({p.label})
                            </div>
                            <p className={`persona-card-body${pen ? ' pen' : ''}`}>
                              {p.message}
                            </p>
                            {p.evidence.length > 0 && (
                              <button
                                className="persona-evidence-pill"
                                onClick={() => {
                                  for (const id of p.evidence) {
                                    window.dispatchEvent(
                                      new CustomEvent('quill:open-report', { detail: id }),
                                    )
                                  }
                                }}
                              >
                                📄 근거 {p.evidence.length}건
                              </button>
                            )}
                          </div>
                        ))}
                        {m.data.disclaimer && (
                          <p className="persona-disclaimer">{m.data.disclaimer}</p>
                        )}
                      </div>
                    ) : (
                    <div className="bubble bubble-agent">
                      <p className={`chat-text${pen ? ' pen' : ''}`}>
                        {/* 다 흐른 뒤에만 용어 풀이를 입힌다 (잘린 단어에 밑줄이 깜빡이지 않게) */}
                        {m.done ? (
                          <RichText text={m.text} />
                        ) : (
                          <InkText text={m.text} shown={m.shown} done={m.done} />
                        )}
                      </p>

                      {m.done && m.data?.divergent && (
                        <ParallelViews view={m.data.divergent} />
                      )}

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
                          {m.data.evidence.map((id, n) => {
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
                                <span className="cite-num">{n + 1}</span>
                                <span className="cite-house">{r.house}</span>
                                <span className="cite-title">{r.title}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    )}
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
            <button className="btn btn-primary btn-icon composer-send" disabled={!q.trim() || busy} aria-label="보내기">
              <IconSend size={16} />
            </button>
          </form>
          <div className="composer-foot">
            <span className="row" style={{ gap: 0 }}>
              <button
                className={`trace-toggle${traceOpen ? ' on' : ''}`}
                onClick={() => setTraceOpen((v) => !v)}
                disabled={!trace.length}
              >
                에이전트 트레이스 {trace.length ? `(${trace.length})` : ''}
              </button>
              {/* 필기체는 읽는 속도를 떨어뜨린다. 언제든 되돌릴 수 있게 둔다 */}
              <button
                className={`pen-toggle${pen ? ' on' : ''}`}
                onClick={() => setPen((v) => !v)}
                aria-pressed={pen}
              >
                답변 만년필체 {pen ? '켬' : '끔'}
              </button>
            </span>
            <span className="xs faint">실제 수집 리포트 · 투자 권유가 아닙니다</span>
          </div>
          {traceOpen && !!trace.length && <AgentTrace steps={trace} />}
        </div>
      </section>

      <EvidencePanel cited={cited} />
    </div>
    </div>
  )
}

/* ── 대화 시작 화면 ─────────────────────────────────────── */

function Opening({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="opening">
      <IconQuill size={24} style={{ color: 'var(--gold)' }} />

      <h1 className="opening-title">무엇이 궁금하신가요?</h1>

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
    </div>
  )
}
