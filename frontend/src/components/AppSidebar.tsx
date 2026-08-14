/**
 * 좌측 사이드바 — 딱 하나뿐이다.
 *
 * 예전엔 이 사이드바(메뉴)와 대화 보관함(대화 기록)이 나란히 놓인 두 칸
 * 이었는데, 그러면 "새 대화" 버튼이 두 군데에 보이는 등 사이드바가 두 개
 * 겹친 것처럼 보였다. 그래서 대화 기록을 이 컴포넌트 안으로 들여왔다.
 *
 *   맨 위      브랜드
 *   새 대화    범용 LLM들처럼 목록 맨 위, 아이콘 한 줄로
 *   메뉴       내 포트폴리오 · 리포트 서재 · 마이페이지
 *   대화 기록  남는 공간을 전부 차지하며 늘어난다 (대화 화면에서만 채워짐)
 *   ↓ 여백 ↓   기록이 짧아도 아래 기능들과 붙지 않도록 flex로 밀어낸다
 *   CTA        성향 진단 — 대화 화면일 때만. 다른 화면에마다 다 떠 있으면
 *              같은 버튼이 곳곳에 반복되는 느낌만 준다
 *   맨 아래    알림 · 계정
 *
 * 대화 기록 칸의 실제 내용(ChatVault)과 "새 대화"를 눌렀을 때 실제로
 * 새 대화를 시작하는 동작은 전부 Chat.tsx가 갖고 있는 상태·로직 그대로다.
 * 이 컴포넌트는 그걸 어디에 놓을지만 정한다.
 */
import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useProfile } from '../lib/store'
import { TODAY_REPORTS } from '../lib/chatEngine'
import Notifications from './Notifications'
import AccountMenu from './AccountMenu'
import { IconArrowLeft, IconArrowRight, IconBook, IconCalendar, IconChat, IconPie, IconQuill, IconTarget, IconUser } from './icons'

export default function AppSidebar({
  newChat,
  history,
}: {
  /** "새 대화" 자리에 놓을 요소. 안 주면 대화 화면으로 가는 평범한 링크를 쓴다 */
  newChat?: ReactNode
  /** 대화 기록 칸 내용물. 대화 화면이 아니면 이 칸 자체를 안 그린다 */
  history?: ReactNode
}) {
  const { diagnosis } = useProfile()
  /* 접기·펼치기는 이 컴포넌트 안에서만 도는 화면 상태다 */
  const [collapsed, setCollapsed] = useState(false)
  /* 성향 진단 CTA는 대화 화면(새 대화든 진행 중이든)에서만 보여 준다.
     history는 Chat.tsx에서 렌더링할 때만 넘어오는 값이라 그 자체로
     "지금 대화 화면인가"를 뜻한다. 다른 화면에마다 이 버튼이 다 떠 있으면
     여기저기 같은 CTA가 덕지덕지 반복되는 느낌만 준다. */
  const onChatScreen = history !== undefined

  return (
    <aside className={`app-sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="side-top">
        <NavLink to="/" end className="side-brand">
          <IconQuill size={20} className="brand-mark" />
          <span className="brand-name">macmiri</span>
        </NavLink>
        <button
          className="side-collapse"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <IconArrowRight size={14} /> : <IconArrowLeft size={14} />}
        </button>
      </div>

      <nav className="side-nav">
        {newChat ?? (
          <NavLink to="/" end className="side-link side-newchat">
            <IconChat size={18} />
            <span>새 대화</span>
          </NavLink>
        )}
        <NavLink to="/portfolio" className="side-link">
          <IconPie size={18} />
          <span>내 포트폴리오</span>
        </NavLink>
        <NavLink to="/library" className="side-link">
          <IconBook size={18} />
          <span>리포트 서재</span>
          {TODAY_REPORTS.length > 0 && (
            <span className="side-badge">{TODAY_REPORTS.length}</span>
          )}
        </NavLink>
        <NavLink to="/calendar" className="side-link">
          <IconCalendar size={18} />
          <span>캘린더</span>
        </NavLink>
        <NavLink to="/mypage" className="side-link">
          <IconUser size={18} />
          <span>마이페이지</span>
        </NavLink>
      </nav>

      {history ? (
        <div className="side-history">
          <div className="side-history-label">대화 기록</div>
          <div className="side-history-scroll">{history}</div>
        </div>
      ) : (
        <div className="side-spacer" />
      )}

      {onChatScreen && (
        <NavLink to="/onboarding" className="btn btn-primary btn-sm side-cta" aria-label={diagnosis ? '조건 다시 잡기' : '성향 진단 시작'}>
          {collapsed ? <IconTarget size={16} /> : <IconArrowRight size={14} />}
          <span>{diagnosis ? '조건 다시 잡기' : '성향 진단 시작'}</span>
        </NavLink>
      )}

      <div className="side-foot">
        <Notifications />
        <AccountMenu />
      </div>
    </aside>
  )
}
