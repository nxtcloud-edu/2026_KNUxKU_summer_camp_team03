/**
 * 첫 세션 안내창 — 예전에는 대화 화면 한가운데를 이 소개문과 진단 유도
 * 카드가 차지했다. 대화가 시작되면 다시 볼 일 없는 내용이라, 세션마다
 * 한 번만 뜨는 별도 창으로 옮겼다.
 *
 * 이 컴포넌트는 완전히 독립적이다 — 열림 상태를 스스로 들고 있어서
 * Chat 화면의 기존 상태·로직은 한 줄도 건드리지 않는다.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCopilot } from '../lib/copilot'
import { IconArrowRight, IconQuill, IconX } from './icons'

const SEEN_KEY = 'quill.welcome.seen'

export default function WelcomeModal() {
  const { input } = useCopilot()
  const [dismissed, setDismissed] = useState(false)

  const open = !input && !dismissed && sessionStorage.getItem(SEEN_KEY) !== '1'

  const close = () => {
    sessionStorage.setItem(SEEN_KEY, '1')
    setDismissed(true)
  }

  if (!open) return null

  return (
    <div className="welcome-overlay" role="dialog" aria-modal="true" aria-label="Quill 소개">
      <div className="welcome-card">
        <button className="welcome-close" onClick={close} aria-label="닫기">
          <IconX size={16} />
        </button>

        <IconQuill size={26} style={{ color: 'var(--gold)' }} />

        <h1 className="welcome-title">
          어려운 리포트는 제가 읽을게요.
          <br />
          당신은 결정만 하시면 됩니다.
        </h1>

        <p className="welcome-lead">
          증권사 리포트에서 채권·ETF 이야기만 골라 읽고, 근거를 붙여 해설합니다. 6개
          질문에 답하면 기준 비중부터 잡아 드려요.
        </p>

        <div className="welcome-actions">
          <Link className="btn btn-primary" to="/onboarding" onClick={close}>
            시작하기 · 성향 진단
            <IconArrowRight size={15} />
          </Link>
          <button className="btn btn-ghost" onClick={close}>
            나중에 할게요
          </button>
        </div>
      </div>
    </div>
  )
}
