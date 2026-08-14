import { useEffect, useRef } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { IconQuill } from './icons'
import ChatWidget from './ChatWidget'
import AppSidebar from './AppSidebar'
import SelectionAsk from './SelectionAsk'
import { REPORTS } from '../lib/mock'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="row-between wrap gap-6">
          <div>
            <div className="row" style={{ gap: 9 }}>
              <IconQuill size={22} style={{ color: 'var(--brand)' }} />
              <span className="brand-name" style={{ fontSize: 30 }}>
                macmiri
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
          <br />© 2026 macmiri · 화면 프로토타입 (DB · 추천 알고리즘 미연결)
        </p>
      </div>
    </footer>
  )
}

/** 대화 화면 전용 셸 — 대화 화면(Chat.tsx)이 사이드바까지 통째로 그린다.
 *  대화 기록을 사이드바 안에 넣으려면 그 상태를 쥔 Chat.tsx가 사이드바도
 *  같이 그려야 해서, 여기서는 더 얹을 게 없다. */
export function ChatLayout() {
  return <Outlet />
}

export default function Layout() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  return (
    <div className="app-row">
      <AppSidebar />
      <div className="app-main" ref={mainRef}>
        {/* 우하단 챗봇이 뜨는 모든 화면에서 드래그 선택 → 바로 물어보기가
            같이 되어야 한다. 페이지마다 따로 감싸지 않고 이 셸 하나에서
            한 번에 건다 — ChatWidget이 뜨는 범위와 정확히 같아진다. */}
        <SelectionAsk>
          <Outlet />
        </SelectionAsk>
        <SiteFooter />
        <ChatWidget />
      </div>
    </div>
  )
}
