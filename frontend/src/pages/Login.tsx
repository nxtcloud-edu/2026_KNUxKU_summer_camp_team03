/**
 * 로그인 · 가입 · 비밀번호 재설정
 *
 * 한 화면에서 모드만 바꾼다. 화면을 셋으로 나누면 오가는 동안 입력이 날아간다.
 */
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { passwordProblem, useAuth } from '../lib/auth'
import { IconArrowRight, IconShield } from '../components/icons'

type Mode = 'in' | 'up' | 'reset'

export default function Login() {
  const { enabled, user, signIn, signUp, resetPassword } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from ?? '/'

  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 이미 로그인했으면 되돌려보낸다
  if (user) return <Navigate to={from} replace />

  // 인증이 꺼져 있는데 이 주소로 들어온 경우
  if (!enabled) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="auth-title">로그인이 아직 켜져 있지 않습니다</h1>
          <p className="auth-lead">
            Supabase 키가 설정되지 않아 비로그인 모드로 동작 중입니다. 지금은 로그인
            없이 모든 화면을 쓰실 수 있어요.
          </p>
          <div className="auth-note">
            <IconShield size={15} />
            <div>
              켜려면 <code>frontend/.env.local</code>에 <code>VITE_SUPABASE_URL</code>과{' '}
              <code>VITE_SUPABASE_ANON_KEY</code>를 넣고 개발 서버를 다시 시작하세요.
              <br />
              <b>RLS 정책을 먼저 적용해야 합니다</b> — <code>supabase/rls.sql</code>을
              보세요.
            </div>
          </div>
          <Link className="btn btn-primary btn-block mt-6" to="/">
            대화로 돌아가기
            <IconArrowRight size={15} />
          </Link>
        </div>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setDone(null)

    if (mode === 'reset') {
      setBusy(true)
      const msg = await resetPassword(email)
      setBusy(false)
      if (msg) setErr(msg)
      else setDone('재설정 링크를 보냈습니다. 메일함을 확인해 주세요.')
      return
    }

    if (mode === 'up') {
      const problem = passwordProblem(pw)
      if (problem) {
        setErr(problem)
        return
      }
    }

    setBusy(true)
    const msg = mode === 'in' ? await signIn(email, pw) : await signUp(email, pw)
    setBusy(false)

    if (msg) {
      setErr(msg)
      return
    }
    if (mode === 'up') {
      setDone('가입했습니다. 확인 메일이 갔다면 링크를 눌러 주세요.')
      return
    }
    nav(from, { replace: true })
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-mark script-en script-sign">Quill</div>

        <h1 className="auth-title">
          {mode === 'in' ? '로그인' : mode === 'up' ? '계정 만들기' : '비밀번호 재설정'}
        </h1>
        <p className="auth-lead">
          {mode === 'reset'
            ? '가입한 이메일을 넣으시면 재설정 링크를 보내 드립니다.'
            : '진단 결과와 대화 기록을 계정에 묶어 어느 기기에서든 이어 보실 수 있습니다.'}
        </p>

        <form onSubmit={submit} className="auth-form">
          <label className="auth-field">
            <span>이메일</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>

          {mode !== 'reset' && (
            <label className="auth-field">
              <span>비밀번호</span>
              <input
                type="password"
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder={mode === 'up' ? '8자 이상 · 영문과 숫자' : ''}
              />
            </label>
          )}

          {err && <p className="auth-err">{err}</p>}
          {done && <p className="auth-done">{done}</p>}

          <button className="btn btn-primary btn-block mt-4" disabled={busy}>
            {busy
              ? '처리 중…'
              : mode === 'in'
                ? '로그인'
                : mode === 'up'
                  ? '가입하기'
                  : '재설정 링크 받기'}
            <IconArrowRight size={15} />
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'in' && (
            <>
              <button onClick={() => setMode('up')}>계정이 없어요</button>
              <button onClick={() => setMode('reset')}>비밀번호를 잊었어요</button>
            </>
          )}
          {mode !== 'in' && <button onClick={() => setMode('in')}>로그인으로 돌아가기</button>}
        </div>

        <p className="auth-foot">
          이 화면은 데모입니다. 표시되는 리포트와 수치는 지어낸 샘플이며 투자 권유가
          아닙니다.
        </p>
      </div>
    </div>
  )
}
