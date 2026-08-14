import { useEffect, useMemo, useState } from 'react'
import { getCalendarEvents, type CalendarEvent } from '../lib/calendarApi'
import { Badge, Empty, Spinner } from '../components/ui'
import { IconArrowLeft, IconArrowRight } from '../components/icons'

const CATEGORY_TONE: Record<string, 'info' | 'brand' | 'outline'> = {
  FOMC: 'info',
  금통위: 'brand',
  '지수 리밸런싱': 'outline',
}

function formatRange(start: string, end: string): string {
  return start === end ? start : `${start} ~ ${end}`
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [failed, setFailed] = useState(false)
  // 지금은 FOMC만 있어 2026-08부터 보여준다 — 화살표로 다른 달로 이동 가능.
  const [cursor, setCursor] = useState({ year: 2026, month: 8 })

  useEffect(() => {
    getCalendarEvents()
      .then(setEvents)
      .catch((e) => {
        console.error('[calendar] 일정 조회 실패:', e)
        setFailed(true)
      })
  }, [])

  const monthLabel = `${cursor.year}년 ${cursor.month}월`
  const monthKey = `${cursor.year}-${String(cursor.month).padStart(2, '0')}`

  const list = useMemo(() => {
    if (!events) return []
    return events
      .filter((e) => e.date_start.startsWith(monthKey) || e.date_end.startsWith(monthKey))
      .sort((a, b) => (a.date_start < b.date_start ? -1 : 1))
  }, [events, monthKey])

  const goMonth = (delta: number) => {
    setCursor((prev) => {
      let month = prev.month + delta
      let year = prev.year
      if (month < 1) {
        month = 12
        year -= 1
      } else if (month > 12) {
        month = 1
        year += 1
      }
      return { year, month }
    })
  }

  return (
    <div className="container" style={{ padding: 'var(--sp-12) 0 var(--sp-24)' }}>
      <div className="page-head">
        <h1 className="page-title">캘린더</h1>
        <p className="page-lead">
          투자 판단에 영향을 주는 주요 일정입니다. 지금은 FOMC·금통위·지수 리밸런싱 일정이 반영되어 있습니다.
        </p>
      </div>

      <div className="row row-between mb-6">
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => goMonth(-1)} aria-label="이전 달">
          <IconArrowLeft size={16} />
        </button>
        <span className="strong num">{monthLabel}</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => goMonth(1)} aria-label="다음 달">
          <IconArrowRight size={16} />
        </button>
      </div>

      {failed ? (
        <Empty title="일정을 불러오지 못했습니다" description="잠시 후 다시 시도해 주세요." />
      ) : events === null ? (
        <Spinner label="일정을 불러오는 중…" />
      ) : list.length === 0 ? (
        <Empty title="이번 달 예정된 일정이 없습니다" description="화살표로 다른 달을 확인해 보세요." />
      ) : (
        <div className="col gap-3">
          {list.map((e) => (
            <div key={e.id} className="cal-row">
              <div className="cal-row-date num">{formatRange(e.date_start, e.date_end)}</div>
              <div className="cal-row-body">
                <div className="row gap-2" style={{ alignItems: 'center' }}>
                  <Badge tone={CATEGORY_TONE[e.category] ?? 'info'}>{e.category}</Badge>
                  <span className="strong">{e.title}</span>
                </div>
                {e.note && (
                  <div className="mt-1">
                    <Badge tone="outline">{e.note}</Badge>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
