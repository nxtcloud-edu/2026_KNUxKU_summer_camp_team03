import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QUESTIONS } from '../lib/survey'
import { useProfile } from '../lib/store'
import { IconArrowLeft, IconArrowRight, IconCheck } from '../components/icons'

/** 문항 사이 격려 문구 — 이탈이 잦은 중반부에만 손글씨로 한 번 */
const ENCOURAGE: Record<number, string> = {
  2: '잘하고 계세요. 정답이 있는 시험이 아니에요',
  5: '이 문항 하나가 결과의 3할을 정합니다',
  7: '마지막 질문이에요',
}

export default function Survey() {
  const nav = useNavigate()
  const { answers, answer } = useProfile()
  const [i, setI] = useState(0)

  const q = QUESTIONS[i]
  const picked = answers[q.id]
  const last = i === QUESTIONS.length - 1
  const progress = ((i + (picked !== undefined ? 1 : 0)) / QUESTIONS.length) * 100

  // 첫 미응답 문항에서 시작한다 (돌아왔을 때 처음부터 다시 묻지 않도록)
  useEffect(() => {
    const first = QUESTIONS.findIndex((x) => answers[x.id] === undefined)
    setI(first === -1 ? QUESTIONS.length - 1 : first)
    // 최초 진입 시 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = (idx: number) => {
    answer(q.id, idx)
    window.setTimeout(() => {
      if (last) nav('/analysis')
      else setI((v) => Math.min(QUESTIONS.length - 1, v + 1))
    }, 260)
  }

  // 1~5 키로도 고를 수 있게
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= q.choices.length) choose(n - 1)
      if (e.key === 'ArrowLeft' && i > 0) setI(i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="container survey-wrap">
      <div className="narrow">
        <div className="survey-rail">
          <div className="row-between mb-3">
            <span className="eyebrow">
              <span className="rule-gold" />
              투자 성향 진단
            </span>
            <span className="small muted num">
              {i + 1} / {QUESTIONS.length}
            </span>
          </div>
          <div className="bar">
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="survey-q" key={q.id}>
          <h2>{q.title}</h2>
          {q.help && <p className="survey-help">{q.help}</p>}

          <div className="opts">
            {q.choices.map((c, idx) => (
              <button
                key={idx}
                className="opt"
                aria-pressed={picked === idx}
                onClick={() => choose(idx)}
              >
                <span className="opt-key">{picked === idx ? <IconCheck size={15} /> : idx + 1}</span>
                <span className="grow">
                  <span className="opt-text" style={{ display: 'block' }}>
                    {c.text}
                  </span>
                  {c.sub && <span className="opt-sub" style={{ display: 'block' }}>{c.sub}</span>}
                </span>
              </button>
            ))}
          </div>

          {ENCOURAGE[i] && (
            <div className="mt-6">
              <span className="hand hand-note" style={{ fontSize: '1.45rem' }}>
                {ENCOURAGE[i]}
              </span>
            </div>
          )}

          <div className="survey-nav">
            <button
              className="btn btn-ghost"
              disabled={i === 0}
              onClick={() => setI((v) => Math.max(0, v - 1))}
            >
              <IconArrowLeft size={16} />
              이전
            </button>

            <div className="row gap-3">
              <span className="xs faint">숫자 키로도 고를 수 있어요</span>
              <button
                className="btn btn-primary"
                disabled={picked === undefined}
                onClick={() => (last ? nav('/analysis') : setI((v) => v + 1))}
              >
                {last ? '결과 보기' : '다음'}
                <IconArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
