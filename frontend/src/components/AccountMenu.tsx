/**
 * 계정 표시 — 헤더 오른쪽
 *
 * 인증이 꺼져 있어도 로그인 버튼은 띄운다. 버튼이 아예 없으면 이 서비스에
 * 로그인이 없는 것처럼 보인다. 대신 누르면 "아직 켜지지 않았다"는 사실과
 * 켜는 방법을 그대로 알려 준다 — 되는 척하는 것보다 낫다.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function AccountMenu() {
  const { enabled, ready, user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const nav = useNavigate()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // 세션을 확인하는 잠깐 동안만 자리를 비워 둔다 (버튼이 깜빡이지 않게)
  if (enabled && !ready) return null

  if (!user) {
    return (
      <Link className="btn btn-soft btn-sm" to="/login">
        로그인
        {/* 아직 붙지 않았다는 표시. 시연 중 오해를 막는다 */}
        {!enabled && <span className="login-off" title="인증 미설정" />}
      </Link>
    )
  }

  const email = user.email ?? '계정'
  const initial = email.slice(0, 1).toUpperCase()

  return (
    <div className="acct" ref={ref}>
      <button
        className="acct-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="계정 메뉴"
      >
        {initial}
      </button>

      {open && (
        <div className="acct-pop">
          <div className="acct-mail truncate">{email}</div>
          <button
            className="acct-item"
            onClick={async () => {
              setOpen(false)
              await signOut()
              nav('/', { replace: true })
            }}
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}
