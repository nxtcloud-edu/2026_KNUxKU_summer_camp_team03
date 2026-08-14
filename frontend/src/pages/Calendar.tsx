import { useEffect, useMemo, useState } from 'react'
import { getCalendarEvents, type CalendarEvent } from '../lib/calendarApi'
import { Badge, Empty, Spinner } from '../components/ui'
import { IconArrowLeft, IconArrowRight, IconChevronDown } from '../components/icons'

const CATEGORY_TONE: Record<string, 'info' | 'brand' | 'outline'> = {
  FOMC: 'info',
  금통위: 'brand',
  '지수 리밸런싱': 'outline',
}

// 하루·한 카테고리 안에 이 개수를 넘으면 접어서 "N건"으로만 보여준다.
// 실적발표처럼 종목을 필터링 안 하는 소스는 하루에도 수십 건씩 나온다.
const COLLAPSE_THRESHOLD = 3

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토']

function formatDayHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${m}월 ${d}일 (${WEEKDAY_KR[dt.getDay()]})`
}

function formatRange(start: string, end: string): string {
  return start === end ? start : `${start} ~ ${end}`
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = keyFn(item)
    const arr = map.get(k)
    if (arr) arr.push(item)
    else map.set(k, [item])
  }
  return map
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [failed, setFailed] = useState(false)
  // 지금은 FOMC만 있어 2026-08부터 보여준다 — 화살표로 다른 달로 이동 가능.
  const [cursor, setCursor] = useState({ year: 2026, month: 8 })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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

  const byDate = useMemo(() => groupBy(list, (e) => e.date_start), [list])

  // 달이 바뀌면 이전 달에서 펼쳐 둔 상태가 그대로 남아 있을 이유가 없다.
  useEffect(() => {
    setExpanded(new Set())
  }, [monthKey])

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
        <div className="col gap-5">
          {[...byDate.entries()].map(([dateKey, dayEvents]) => (
            <div key={dateKey}>
              <div className="cal-day-head num">{formatDayHeading(dateKey)}</div>
              <div className="col gap-2">
                {[...groupBy(dayEvents, (e) => e.category).entries()].map(([category, catEvents]) => {
                  const tone = CATEGORY_TONE[category] ?? 'info'

                  if (catEvents.length <= COLLAPSE_THRESHOLD) {
                    return catEvents.map((e) => (
                      <div key={e.id} className="cal-row">
                        <div className="row gap-2" style={{ alignItems: 'center' }}>
                          <Badge tone={tone}>{category}</Badge>
                          <span className="strong">{e.title}</span>
                        </div>
                        {e.date_start !== e.date_end && (
                          <div className="small muted mt-1 num">{formatRange(e.date_start, e.date_end)}</div>
                        )}
                        {e.note && (
                          <div className="mt-1">
                            <Badge tone="outline">{e.note}</Badge>
                          </div>
                        )}
                      </div>
                    ))
                  }

                  const key = `${dateKey}:${category}`
                  const isOpen = expanded.has(key)
                  return (
                    <div key={key} className="cal-cat-group">
                      <button
                        className="cal-cat-toggle"
                        onClick={() => toggle(key)}
                        aria-expanded={isOpen}
                      >
                        <Badge tone={tone}>{category}</Badge>
                        <span className="small muted">{catEvents.length}건</span>
                        <IconChevronDown size={14} className={isOpen ? 'cal-cat-chevron open' : 'cal-cat-chevron'} />
                      </button>
                      {isOpen && (
                        <div className="cal-cat-list">
                          {catEvents.map((e) => (
                            <div key={e.id} className="cal-mini-row">
                              <span className="strong">{e.title}</span>
                              {e.note && <span className="small muted"> · {e.note}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
