/**
 * 관리자 콘솔 셸
 *
 * 고객 사이트와 완전히 분리한다 — 사이트 헤더도, 챗봇도 여기 들어오지 않는다.
 * 지금은 인증이 없다. 로그인이 붙기 전까지는 주소를 아는 사람이 들어올 수 있으므로
 * 상단에 그 사실을 계속 띄워 둔다.
 */
import { useEffect, useMemo } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { PENDING } from '../lib/adminMock'
import { getAdmin } from '../lib/overrides'
import {
  IconAlert,
  IconArrowLeft,
  IconBox,
  IconChat,
  IconClipboard,
  IconDoc,
  IconGauge,
  IconInbox,
  IconInspect,
  IconQuill,
  IconSliders,
} from '../components/icons'

const NAV = [
  {
    group: '운영',
    items: [
      { to: '/admin', end: true, label: '개요', icon: IconGauge },
      { to: '/admin/ingest', label: '수집 현황', icon: IconInbox },
      { to: '/admin/review', label: '검수 큐', icon: IconInspect, badge: true },
      { to: '/admin/reports', label: '리포트', icon: IconDoc },
    ],
  },
  {
    group: '설정',
    items: [
      { to: '/admin/rules', label: '필터 규칙', icon: IconSliders },
      { to: '/admin/products', label: '상품 · 배분표', icon: IconBox },
      { to: '/admin/survey', label: '설문 · 가중치', icon: IconClipboard },
    ],
  },
  {
    group: '품질',
    items: [{ to: '/admin/quality', label: '챗봇 응답', icon: IconChat }],
  },
]

const TITLES: Record<string, { h: string; sub: string }> = {
  '/admin': { h: '개요', sub: '오늘 파이프라인이 어떻게 돌았는지' },
  '/admin/ingest': { h: '수집 현황', sub: '소스별 크롤링 잡과 일자별 실적' },
  '/admin/review': { h: '검수 큐', sub: '모델이 확신하지 못한 건을 사람이 판단합니다' },
  '/admin/reports': { h: '리포트', sub: '공개 중인 근거 자료' },
  '/admin/rules': { h: '필터 규칙', sub: '무엇을 남기고 무엇을 버릴지' },
  '/admin/products': { h: '상품 · 배분표', sub: '성향별 자산 배분 비중' },
  '/admin/survey': { h: '설문 · 가중치', sub: '문항 구성과 채점 비중' },
  '/admin/quality': { h: '챗봇 응답', sub: '근거 없이 답한 건을 추적합니다' },
}

export default function AdminLayout() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? { h: '관리자 콘솔', sub: '' }

  useEffect(() => {
    document.title = `${title.h} · 맥미리 관리자`
    window.scrollTo({ top: 0 })
    return () => {
      document.title = '맥미리 · 리포트를 읽어주는 금융 과외'
    }
  }, [pathname, title.h])

  const pendingCount = useMemo(() => {
    const decided = getAdmin().decided
    return PENDING.filter((p) => !decided[p.id]).length
  }, [pathname])

  return (
    <div className="admin-root">
      <div className="admin-shell">
        <aside className="admin-side">
          <Link to="/admin" className="admin-brand">
            <IconQuill size={22} style={{ color: 'var(--brand)' }} />
            <span className="brand-name">맥미리</span>
            <span className="chip-console">CONSOLE</span>
          </Link>

          <nav className="admin-nav">
            {NAV.map((g) => (
              <div key={g.group}>
                <div className="group">{g.group}</div>
                {g.items.map((it) => {
                  const Icon = it.icon
                  return (
                    <NavLink key={it.to} to={it.to} end={it.end}>
                      <Icon size={16} />
                      {it.label}
                      {it.badge && pendingCount > 0 && (
                        <span className="count">{pendingCount}</span>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            ))}
          </nav>

          <div className="admin-side-foot">
            <Link className="btn btn-ghost btn-sm" to="/" style={{ paddingLeft: 8 }}>
              <IconArrowLeft size={14} />
              고객 사이트로
            </Link>
            <p style={{ marginTop: 10 }}>
              데모 콘솔입니다. 변경 사항은 이 브라우저에만 저장되고 서버로 나가지 않습니다.
            </p>
          </div>
        </aside>

        <div>
          <header className="admin-top">
            <div>
              <h1>{title.h}</h1>
              {title.sub && <div className="sub">{title.sub}</div>}
            </div>
            <span className="spacer" />
            <span className="demo-flag">
              <IconAlert size={13} />
              인증 미연결 · 샘플 데이터
            </span>
          </header>

          <main className="admin-main">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
