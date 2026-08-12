/**
 * 알림 — 헤더의 종 아이콘
 *
 * 설계문서 ERD의 notifications 테이블에 대응한다. 눈여겨볼 규칙 하나:
 * 모든 알림에 evidence_report_id가 걸려 있다. 근거 없는 알림은 만들지 않는다.
 * 알림은 "지금 뭔가 해야 할 것 같은" 압박을 주는 자리라, 오히려 여기서
 * 근거를 더 엄격히 요구해야 한다.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { NOTIFICATIONS, reportById } from '../lib/mock'
import { IconBell } from './icons'

export default function Notifications() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(NOTIFICATIONS)
  const ref = useRef<HTMLDivElement>(null)

  const unread = items.filter((n) => !n.read).length

  // 바깥을 누르면 닫는다
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="noti" ref={ref}>
      <button
        className="noti-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={`알림 ${unread}건`}
        aria-expanded={open}
      >
        <IconBell size={18} />
        {unread > 0 && <span className="noti-dot" />}
      </button>

      {open && (
        <div className="noti-pop">
          <div className="noti-head">
            <span className="eyebrow">알림</span>
            {unread > 0 && (
              <button
                className="noti-read"
                onClick={() => setItems((l) => l.map((n) => ({ ...n, read: true })))}
              >
                모두 읽음
              </button>
            )}
          </div>

          <div className="noti-list">
            {items.map((n) => {
              const r = reportById(n.evidenceReportId)
              return (
                <div className={`noti-item${n.read ? ' read' : ''}`} key={n.id}>
                  <div className="row gap-2">
                    <span className={`noti-type ${n.type === '제안' ? 'sug' : 'info'}`}>
                      {n.type}
                    </span>
                    <span className="xs faint">{n.at.slice(5, 10).replace('-', '/')}</span>
                  </div>
                  <div className="noti-title">{n.title}</div>
                  <p className="noti-body">{n.body}</p>
                  {r && (
                    <Link className="noti-src" to={`/library/${r.id}`}>
                      근거 · {r.house} 「{r.title}」
                    </Link>
                  )}
                </div>
              )
            })}
          </div>

          <p className="noti-foot">
            모든 알림에는 근거 리포트가 붙습니다. 근거 없이 알리지 않습니다.
          </p>
        </div>
      )}
    </div>
  )
}
