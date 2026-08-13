import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { IconArrowRight, IconQuill } from './icons'
import ChatWidget from './ChatWidget'
import Notifications from './Notifications'
import AccountMenu from './AccountMenu'
import { useProfile } from '../lib/store'
import { REPORTS } from '../lib/mock'

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const { diagnosis } = useProfile()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`site-header${scrolled ? ' scrolled' : ''}`}>
      <div className="container">
        <Link to="/" className="brand" aria-label="Quill 홈">
          <IconQuill size={25} className="brand-mark" />
          <span className="brand-name">Quill</span>
          <span className="brand-sub">퀼</span>
        </Link>

        <nav className="nav">
          <NavLink to="/" end>
            대화
          </NavLink>
          <NavLink to="/portfolio">내 포트폴리오</NavLink>
          <NavLink to="/library">리포트 서재</NavLink>
          <NavLink to="/mypage">마이페이지</NavLink>
        </nav>

        <span className="spacer" />

        <Notifications />

        <AccountMenu />

        <Link className="btn btn-primary btn-sm" to="/onboarding">
          {diagnosis ? '조건 다시 잡기' : '성향 진단'}
          <IconArrowRight size={15} />
        </Link>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="row-between wrap gap-6">
          <div>
            <div className="row" style={{ gap: 9 }}>
              <IconQuill size={22} style={{ color: 'var(--brand)' }} />
              <span className="brand-name" style={{ fontSize: 30 }}>
                Quill
              </span>
            </div>
            <p className="small muted keep mt-3" style={{ maxWidth: 380, lineHeight: 1.9 }}>
              증권사 리포트를 읽고 정리해, 채권과 ETF 중심의 자산 배분을
              당신의 눈높이로 설명합니다.
            </p>
          </div>

          <div className="row gap-8 wrap" style={{ alignItems: 'flex-start' }}>
            <div className="col gap-2">
              <div className="eyebrow mb-2">서비스</div>
              <Link className="small muted" to="/onboarding">
                투자 성향 진단
              </Link>
              <Link className="small muted" to="/library">
                리포트 서재
              </Link>
            </div>
            <div className="col gap-2">
              <div className="eyebrow mb-2">데이터</div>
              <span className="small muted">수집 리포트 {REPORTS.length}건</span>
              <span className="small muted">태그 체계 10종</span>
              <Link className="small muted" to="/admin">
                관리자 콘솔 (로그인 필요)
              </Link>
            </div>
          </div>
        </div>

        <p className="footer-note">
          ⚠ 데모 화면입니다. 리포트는 네이버 리서치에서 수집한 실제 공개 자료이지만, 3줄 요약과
          상품군 태그는 자동 생성분이라 검수를 거치지 않았습니다. 배분 비중과 상품 예시는 계산
          결과를 보여 주기 위한 값입니다. 어떤 내용도 투자 권유나 자문이 아니고, 투자 판단과 그
          결과에 대한 책임은 투자자 본인에게 있습니다. 원금 손실이 발생할 수 있습니다.
          <br />
          <br />© 2026 Quill · 화면 프로토타입 (DB · 추천 알고리즘 미연결)
        </p>
      </div>
    </footer>
  )
}

/** 대화 화면 전용 셸 — 헤더만 두고 푸터와 떠 있는 챗 버튼은 뺀다.
 *  대화가 메인인 화면에서 챗 버튼을 또 띄우면 같은 기능이 두 번 보인다. */
export function ChatLayout() {
  return (
    <>
      <SiteHeader />
      <main>
        <Outlet />
      </main>
    </>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  return (
    <>
      <SiteHeader />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
      <ChatWidget />
    </>
  )
}
