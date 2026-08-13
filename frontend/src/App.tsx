/** 라우팅
 *
 *  대화(/)가 메인이다. 화면을 꽉 채워야 해서 푸터도 떠 있는 챗 버튼도 없는
 *  전용 셸(ChatLayout)을 쓴다.
 *
 *  관리자 콘솔(/admin)은 고객 사이트와 완전히 분리된 셸이다.
 *  사이트 헤더도 챗봇도 들어오지 않는다.
 */
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout, { ChatLayout } from './components/Layout'
import Chat from './pages/Chat'
import Onboarding from './pages/Onboarding'
import Portfolio from './pages/Portfolio'
import MyPage from './pages/MyPage'
import Library from './pages/Library'
import Login from './pages/Login'
import RequireAuth from './components/RequireAuth'
import ReportPage from './pages/ReportPage'

import AdminLayout from './admin/AdminLayout'
import AdminOverview from './admin/AdminOverview'
import AdminIngest from './admin/AdminIngest'
import AdminReview from './admin/AdminReview'
import AdminReports from './admin/AdminReports'
import AdminRules from './admin/AdminRules'
import AdminProducts from './admin/AdminProducts'
import AdminSurvey from './admin/AdminSurvey'
import AdminQuality from './admin/AdminQuality'

export default function App() {
  return (
    <Routes>
      {/* ── 대화 — 메인 ─────────────────────────────── */}
      <Route element={<ChatLayout />}>
        <Route path="/" element={<Chat />} />
      </Route>

      {/* ── 나머지 고객 화면 ────────────────────────── */}
      <Route element={<Layout />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/library" element={<Library />} />
        <Route path="/library/:id" element={<ReportPage />} />
      </Route>

      <Route path="/login" element={<Login />} />

      {/* ── 관리자 콘솔 (별도 셸) ─────────────────────
             인증이 켜져 있으면 로그인 없이는 못 들어온다.
             꺼져 있으면 통과시키되 무방비라는 경고를 띄운다. ── */}
      <Route element={<RequireAuth admin />}>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminOverview />} />
        <Route path="ingest" element={<AdminIngest />} />
        <Route path="review" element={<AdminReview />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="rules" element={<AdminRules />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="survey" element={<AdminSurvey />} />
        <Route path="quality" element={<AdminQuality />} />
      </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
