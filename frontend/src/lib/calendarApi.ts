/**
 * 캘린더 탭 백엔드 클라이언트.
 *
 * 정적 데이터(지금은 FOMC뿐)를 그대로 받아오는 용도라 챗봇처럼 로컬 목업
 * 폴백은 두지 않는다 — 실패하면 에러를 던지고, 페이지 쪽에서 Empty로
 * "불러오지 못했습니다"만 보여주면 충분하다.
 */

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:8000'

export interface CalendarEvent {
  id: string
  category: string // 'fomc' 등. 지금은 화면에서 이 값으로 분기하지 않는다.
  title: string
  date_start: string // YYYY-MM-DD
  date_end: string
  note: string | null
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const res = await fetch(`${API_BASE}/api/calendar`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.events
}
