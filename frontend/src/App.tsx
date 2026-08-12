/** 라우팅 — 고객 사이트와 관리자 콘솔(/admin)을 완전히 분리한다.
 *  관리자 셸에는 사이트 헤더도 챗봇도 들어오지 않는다. */
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Survey from './pages/Survey'
import Analysis from './pages/Analysis'
import Result from './pages/Result'
import Library from './pages/Library'
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
      {/* ── 고객 사이트 ─────────────────────────────── */}
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/survey" element={<Survey />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/result" element={<Result />} />
        <Route path="/library" element={<Library />} />
        <Route path="/library/:id" element={<ReportPage />} />
      </Route>

      {/* ── 관리자 콘솔 (별도 셸) ───────────────────── */}
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
