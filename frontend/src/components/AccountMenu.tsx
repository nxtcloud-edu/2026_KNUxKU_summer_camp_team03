/**
 * 계정 표시 — 헤더 오른쪽
 *
 * 인증이 꺼져 있으면 아무것도 그리지 않는다. 로그인 버튼만 덩그러니 있는데
 * 눌러도 아무 일이 없으면 그게 더 혼란스럽다.
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

  if (!enabled || !ready) return null

  if (!user) {
    return (
      <Link className="btn btn-ghost btn-sm" to="/login">
        로그인
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
