/**
 * 라우트 보호
 *
 * 관리자 콘솔은 로그인 없이는 열리지 않는다.
 *
 * 인증이 설정되지 않았을 때(키 없음)도 **통과시키지 않는다.** 예전에는 경고 띠만
 * 띄우고 열어 뒀는데, 그건 "주소를 아는 사람은 누구나 배분표와 검수 큐를 고칠 수
 * 있다"는 뜻이었다. 경고문은 사고를 막지 못한다. 잠그는 것이 막는다.
 *
 * ⚠ 다만 이건 화면 차단이다. 프런트 라우팅은 우회할 수 있다.
 *   진짜 권한 통제는 DB의 RLS가 한다(supabase/rls.sql). 서버 정책은
 *   "프런트는 언제든 뚫린다"는 전제로 짜야 한다.
 */
import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { IconArrowRight, IconShield } from './icons'

export default function RequireAuth({ admin }: { admin?: boolean }) {
  const { enabled, ready, user } = useAuth()
  const loc = useLocation()

  /** 관리자 명단 조회 결과. null = 아직 확인 중 */
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  /** admins 테이블이 아직 없는 경우 — 설정 중이라는 뜻이라 막지 않고 알린다 */
  const [tableMissing, setTableMissing] = useState(false)

  useEffect(() => {
    if (!admin || !user || !supabase) return
    let alive = true

    supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          // 테이블이 없거나 정책이 아직 안 걸린 상태. 설정 중으로 보고 통과시키되 알린다
          setTableMissing(true)
          setIsAdmin(true)
          return
        }
        setIsAdmin(Boolean(data))
      })

    return () => {
      alive = false
    }
  }, [admin, user])

  /* ── 인증이 설정되지 않았다 ── */
  if (!enabled) {
    // 고객 화면은 그대로 쓸 수 있다. 로그인은 아직 선택 기능이다
    if (!admin) return <Outlet />

    // 관리자 콘솔은 잠근다
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="gate-icon">
            <IconShield size={22} />
          </div>
          <h1 className="auth-title">관리자 콘솔은 잠겨 있습니다</h1>
          <p className="auth-lead">
            로그인이 설정되지 않아 이 화면을 열 수 없습니다. 여기서는 배분표와 검수 큐를
            고칠 수 있어서, 인증 없이 열어 두지 않습니다.
          </p>

          <div className="auth-note">
            <IconShield size={15} />
            <div>
              켜는 순서 —<br />
              <b>1.</b> <code>supabase/schema.sql</code> 실행
              <br />
              <b>2.</b> <code>supabase/rls.sql</code> 실행 (건너뛰지 말 것)
              <br />
              <b>3.</b> <code>frontend/.env.local</code>에 URL과 anon 키 입력
              <br />
              <b>4.</b> 개발 서버 재시작
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

  /* ── 첫 세션 조회 중 ──
     여기서 화면을 먼저 그리면 로그인한 사용자에게 로그인 화면이 깜빡인다 */
  if (!ready) return <div className="auth-wait">확인 중…</div>

  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />

  /* ── 로그인은 했다. 관리자인가 ── */
  if (admin) {
    if (isAdmin === null) return <div className="auth-wait">권한 확인 중…</div>

    if (!isAdmin) {
      return (
        <div className="auth-shell">
          <div className="auth-card">
            <div className="gate-icon">
              <IconShield size={22} />
            </div>
            <h1 className="auth-title">권한이 없습니다</h1>
            <p className="auth-lead">
              로그인은 되었지만 관리자 명단에 없습니다. 관리자 추가는 대시보드에서만
              가능하며, 사용자가 스스로 올릴 수는 없습니다.
            </p>
            <Link className="btn btn-primary btn-block mt-6" to="/">
              대화로 돌아가기
              <IconArrowRight size={15} />
            </Link>
          </div>
        </div>
      )
    }

    return (
      <>
        {tableMissing && (
          <div className="open-warn">
            admins 테이블을 확인하지 못했습니다. schema.sql과 rls.sql을 아직 실행하지
            않았다면 지금은 권한 검사가 동작하지 않는 상태입니다.
          </div>
        )}
        <Outlet />
      </>
    )
  }

  return <Outlet />
}
