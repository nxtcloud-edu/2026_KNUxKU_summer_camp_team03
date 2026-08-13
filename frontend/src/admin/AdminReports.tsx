/**
 * 공개 리포트 관리
 *
 * 여기서 '보류'로 내리면 고객 사이트의 리포트 서재에서 즉시 빠진다.
 * 근거로 인용 중인 리포트를 내릴 때는 어디에 물려 있는지 먼저 보여 준다.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEMO_TODAY, PRODUCTS, REPORTS } from '../lib/mock'
import { getAdmin, setAdmin, useAdmin } from '../lib/overrides'
import { readTag, sinceDays } from '../lib/format'
import { useToast } from '../components/ui'
import { IconAlert, IconExternal, IconSearch } from '../components/icons'

export default function AdminReports() {
  const admin = useAdmin()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [onlyHeld, setOnlyHeld] = useState(false)

  /** 이 리포트를 근거로 쓰는 상품 수 */
  const usedBy = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const p of PRODUCTS) {
      for (const s of p.sources) (m[s] ??= []).push(p.name)
    }
    return m
  }, [])

  const list = REPORTS.filter((r) => {
    if (onlyHeld && admin.status[r.id] !== 'held') return false
    const n = q.trim().toLowerCase()
    if (!n) return true
    return r.title.toLowerCase().includes(n) || r.house.includes(n)
  }).sort((a, b) => (a.date < b.date ? 1 : -1))

  const held = REPORTS.filter((r) => admin.status[r.id] === 'held')

  const toggle = (id: string, title: string) => {
    const s = getAdmin()
    const next = s.status[id] === 'held' ? 'published' : 'held'
    setAdmin({ status: { ...s.status, [id]: next } })
    toast(
      next === 'held'
        ? `보류했습니다 — 서재에서 빠집니다 · ${title.slice(0, 14)}…`
        : '다시 공개했습니다'
    )
  }

  return (
    <div className="col gap-4">
      {held.length > 0 && (
        <div className="alert alert-warn">
          <IconAlert size={16} style={{ flex: 'none', marginTop: 2 }} />
          <div>
            <b>{held.length}건이 보류 중입니다.</b> 고객 사이트의 리포트 서재에서 보이지
            않습니다. 이 리포트를 근거로 달고 있던 답변은 출처가 비게 되므로 오래 두지
            마세요.
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>공개 리포트 {REPORTS.length - held.length}건</h3>
            <div className="sub">검수를 통과해 근거로 쓰이고 있는 자료</div>
          </div>
          <div className="row gap-2">
            <div className="search" style={{ width: 240 }}>
              <IconSearch size={15} />
              <input
                className="input"
                style={{ height: 34 }}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="제목 · 증권사"
              />
            </div>
            <button
              className="chip"
              aria-pressed={onlyHeld}
              onClick={() => setOnlyHeld((v) => !v)}
            >
              보류만
            </button>
          </div>
        </div>

        <div className="panel-body">
          <div className="table-wrap">
            <table className="table adm-table">
              <thead>
                <tr>
                  <th style={{ width: '38%' }}>제목</th>
                  <th>증권사</th>
                  <th>발행</th>
                  <th>태그</th>
                  <th className="num-cell">신뢰도</th>
                  <th>인용 중</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const isHeld = admin.status[r.id] === 'held'
                  const uses = usedBy[r.id] ?? []
                  return (
                    <tr key={r.id} style={isHeld ? { opacity: 0.55 } : undefined}>
                      <td>
                        <Link to={`/library/${r.id}`} className="strong" target="_blank">
                          {r.title}
                        </Link>
                        <div className="xs faint mono" style={{ marginTop: 2 }}>
                          {r.id}
                        </div>
                      </td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {r.house}
                      </td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {r.date}
                        <div className="xs faint">{sinceDays(r.date, DEMO_TODAY)}</div>
                      </td>
                      <td>
                        <div className="row wrap gap-1" style={{ maxWidth: 190 }}>
                          {(admin.tagOverrides[r.id] ?? r.tags).map((t) => (
                            <span key={t} className="tag">
                              {readTag(t)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="num-cell">
                        <span
                          className="strong"
                          style={{
                            color:
                              r.confidence < admin.rules.minConfidence
                                ? 'var(--warn)'
                                : undefined,
                          }}
                        >
                          {(r.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td>
                        {uses.length > 0 ? (
                          <span className="badge badge-brand" title={uses.join(', ')}>
                            상품 {uses.length}개
                          </span>
                        ) : (
                          <span className="xs faint">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`st ${isHeld ? 'st-idle' : 'st-ok'}`}>
                          <span className={`dot ${isHeld ? 'dot-idle' : 'dot-ok'}`} />
                          {isHeld ? '보류' : '공개'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <a
                          className="btn btn-sm btn-ghost btn-icon"
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          title="원문 PDF"
                        >
                          <IconExternal size={14} />
                        </a>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => toggle(r.id, r.title)}
                        >
                          {isHeld ? '공개' : '보류'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel-foot">
          상태 변경은 이 브라우저에만 저장됩니다. 새 탭에서 고객 사이트의{' '}
          <Link to="/library" target="_blank" className="strong">
            리포트 서재
          </Link>
          를 열어 보면 바로 반영된 것을 확인할 수 있습니다.
        </div>
      </div>
    </div>
  )
}
