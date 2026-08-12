/**
 * 라우트 보호
 *
 * 인증이 꺼져 있으면(키 없음) 그냥 통과시킨다. 다만 관리자 콘솔은 통과시키되
 * "지금 무방비"라는 사실을 화면 위에 계속 띄워 둔다. 조용히 열어 두는 것이
 * 가장 나쁘다 — 열려 있다는 걸 아무도 모르기 때문이다.
 *
 * ⚠ 이건 화면 차단일 뿐이다. 진짜 권한 통제는 DB의 RLS가 한다.
 *   프런트 라우팅은 우회할 수 있다는 전제로 서버 정책을 짜야 한다.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function RequireAuth({ admin }: { admin?: boolean }) {
  const { enabled, ready, user } = useAuth()
  const loc = useLocation()

  // 인증이 아예 꺼진 상태 — 프로토타입 모드로 통과시킨다
  if (!enabled) {
    return admin ? (
      <>
        <div className="open-warn">
          인증이 설정되지 않아 관리자 콘솔이 열려 있습니다. 주소를 아는 사람은 누구나
          들어올 수 있어요. 외부에 올리기 전에 반드시 로그인을 먼저 붙이세요.
        </div>
        <Outlet />
      </>
    ) : (
      <Outlet />
    )
  }

  // 첫 세션 조회가 끝날 때까지는 아무것도 보여 주지 않는다.
  // 여기서 화면을 먼저 그리면 로그인한 사용자에게 로그인 화면이 깜빡인다
  if (!ready) return <div className="auth-wait">확인 중…</div>

  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />

  return <Outlet />
}
