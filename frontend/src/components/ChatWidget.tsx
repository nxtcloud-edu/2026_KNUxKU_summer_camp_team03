/**
 * 질문 챗봇
 *
 * 범용 LLM과의 차이를 이 위젯에서 제일 먼저 보여 준다 —
 * 답변 밑에는 항상 근거 리포트가 붙고, 근거가 없으면 없다고 말한다.
 * 지금은 규칙 매칭이며, 나중에 RAG 응답으로 갈아 끼울 자리다.
 */
import { useEffect, useRef, useState } from 'react'
import { CANNED, SUGGESTS } from '../lib/mock'
import { SourceList } from './Evidence'
import { IconChat, IconQuill, IconSend, IconX } from './icons'

interface Msg {
  role: 'user' | 'bot'
  text: string
  sources?: string[]
}

const GREETING: Msg = {
  role: 'bot',
  text: '안녕하세요. 리포트를 읽어 드리는 Quill입니다.\n금융 용어든 상품이든, 궁금한 걸 편하게 물어보세요. 답할 때는 어느 리포트를 근거로 삼았는지 꼭 같이 보여 드립니다.',
}

function reply(q: string): Msg {
  const lower = q.toLowerCase()
  const hit = CANNED.find((c) => c.match.some((m) => lower.includes(m)))
  if (hit) return { role: 'bot', text: hit.text, sources: hit.sources }
  return {
    role: 'bot',
    text: '아직 이 질문에 근거로 삼을 리포트를 못 찾았어요.\n\n지어내서 답하면 이 서비스를 쓰실 이유가 없어지니, 모를 때는 모른다고 말씀드립니다. 금리·채권·ETF·환율·투자 시작 방법 쪽으로 물어보시면 수집해 둔 리포트를 근거로 답할 수 있어요.',
  }
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([GREETING])
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, typing])

  const send = (q: string) => {
    const question = q.trim()
    if (!question || typing) return
    setMsgs((m) => [...m, { role: 'user', text: question }])
    setText('')
    setTyping(true)
    window.setTimeout(() => {
      setMsgs((m) => [...m, reply(question)])
      setTyping(false)
    }, 700)
  }

  // 대문 입력창에서 던진 질문을 그대로 받아 연다
  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent<string>).detail
      setOpen(true)
      if (!q?.trim()) return
      setMsgs((m) => [...m, { role: 'user', text: q.trim() }])
      setTyping(true)
      window.setTimeout(() => {
        setMsgs((m) => [...m, reply(q)])
        setTyping(false)
      }, 700)
    }
    window.addEventListener('quill:ask', onAsk)
    return () => window.removeEventListener('quill:ask', onAsk)
  }, [])

  if (!open) {
    return (
      <button className="chat-fab no-print" onClick={() => setOpen(true)}>
        <IconChat size={19} />
        무엇이든 물어보세요
      </button>
    )
  }

  return (
    <aside className="chat-panel no-print" role="dialog" aria-label="질문 챗봇">
      <div className="chat-head">
        <IconQuill size={22} style={{ color: 'var(--brand)', flex: 'none' }} />
        <div className="grow">
          <div className="small strong">Quill에게 묻기</div>
          <div className="xs faint">근거 리포트를 붙여서 답합니다</div>
        </div>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => setOpen(false)}
          aria-label="닫기"
        >
          <IconX size={17} />
        </button>
      </div>

      <div className="chat-log" ref={logRef}>
        {msgs.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.text.split('\n').map((line, j) => (
              <div key={j} style={{ minHeight: line ? undefined : 10 }}>
                {line}
              </div>
            ))}
            {m.sources && (
              <div className="mt-3">
                <SourceList ids={m.sources} label="근거" />
              </div>
            )}
          </div>
        ))}
        {typing && (
          <div className="msg msg-bot">
            <span className="typing">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        {msgs.length === 1 && (
          <div className="col gap-2 mt-2">
            {SUGGESTS.map((s) => (
              <button
                key={s}
                className="chip"
                style={{ justifyContent: 'flex-start', height: 'auto', padding: '10px 14px' }}
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chat-foot">
        <form
          className="ask"
          style={{ padding: '5px 5px 5px 16px', boxShadow: 'var(--shadow-sm)' }}
          onSubmit={(e) => {
            e.preventDefault()
            send(text)
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="예 · 금리가 내리면 뭘 사야 하나요?"
            style={{ height: 38, fontSize: 'var(--t-sm)' }}
            aria-label="질문 입력"
          />
          <button
            className="btn btn-primary btn-icon"
            style={{ width: 38, height: 38 }}
            disabled={!text.trim() || typing}
            aria-label="보내기"
          >
            <IconSend size={16} />
          </button>
        </form>
      </div>
    </aside>
  )
}
