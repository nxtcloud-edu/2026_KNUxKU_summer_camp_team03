/**
 * 검수 큐
 *
 * 모델이 신뢰도 하한을 못 넘긴 리포트를 사람이 판단하는 자리.
 * 승인하면 태그가 확정되고 근거 자료로 쓰이며, 반려하면 버려진다.
 * 태그를 손대지 않고 승인하면 모델이 제안한 태그가 그대로 확정된다.
 */
import { useState } from 'react'
import { PENDING } from '../lib/adminMock'
import { ALL_TAGS } from '../lib/mock'
import { getAdmin, setAdmin, useAdmin } from '../lib/overrides'
import { readTag } from '../lib/format'
import { useToast, Empty } from '../components/ui'
import { IconAlert, IconCheck, IconExternal, IconX } from '../components/icons'

export default function AdminReview() {
  const admin = useAdmin()
  const toast = useToast()
  const [showDone, setShowDone] = useState(false)

  const list = showDone ? PENDING : PENDING.filter((p) => !admin.decided[p.id])

  const decide = (id: string, verdict: 'approved' | 'rejected', tags: string[]) => {
    const s = getAdmin()
    setAdmin({
      decided: { ...s.decided, [id]: verdict },
      tagOverrides:
        verdict === 'approved' ? { ...s.tagOverrides, [id]: tags } : s.tagOverrides,
    })
    toast(verdict === 'approved' ? '승인했습니다' : '반려했습니다')
  }

  const remaining = PENDING.filter((p) => !admin.decided[p.id]).length

  return (
    <div className="col gap-4">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>
              검수 대기 {remaining}건
              <span className="muted" style={{ fontWeight: 400 }}>
                {' '}
                / 전체 {PENDING.length}건
              </span>
            </h3>
            <div className="sub">
              태깅 신뢰도 {Math.round(admin.rules.minConfidence * 100)}% 미만이거나 규칙에
              걸린 건입니다
            </div>
          </div>
          <div className="row gap-2">
            <button
              className="chip"
              aria-pressed={showDone}
              onClick={() => setShowDone((v) => !v)}
            >
              처리한 건도 보기
            </button>
            {Object.keys(admin.decided).length > 0 && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setAdmin({ decided: {}, tagOverrides: {} })
                  toast('판정을 되돌렸습니다')
                }}
              >
                판정 초기화
              </button>
            )}
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="panel">
          <Empty
            title="검수할 리포트가 없습니다"
            description="모델이 확신하지 못한 건만 여기로 올라옵니다. 비어 있다면 오늘 수집분은 전부 자동 처리됐다는 뜻입니다."
          />
        </div>
      ) : (
        <div className="queue">
          {list.map((p) => (
            <QueueCard
              key={p.id}
              report={p}
              verdict={admin.decided[p.id]}
              onDecide={decide}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function QueueCard({
  report: p,
  verdict,
  onDecide,
}: {
  report: (typeof PENDING)[number]
  verdict?: 'approved' | 'rejected'
  onDecide: (id: string, v: 'approved' | 'rejected', tags: string[]) => void
}) {
  const [tags, setTags] = useState<string[]>(p.proposed)
  const settled = Boolean(verdict)

  const toggle = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  return (
    <article className={`q-card${settled ? ' settled' : ''}`}>
      <div className="row-between wrap gap-3">
        <div className="row gap-2 wrap">
          <span className="q-reason">
            <IconAlert size={12} />
            {p.reason}
          </span>
          <span className="badge badge-neutral">신뢰도 {(p.confidence * 100).toFixed(0)}%</span>
          {verdict && (
            <span className={`badge ${verdict === 'approved' ? 'badge-ok' : 'badge-danger'}`}>
              {verdict === 'approved' ? '승인함' : '반려함'}
            </span>
          )}
        </div>
        <div className="xs faint">
          {p.house} · {p.analyst} · {p.date} · {p.pages}쪽
        </div>
      </div>

      <h3 className="mt-3" style={{ fontSize: 'var(--t-md)', lineHeight: 1.5 }}>
        {p.title}
      </h3>

      <ul className="rep-sum col gap-1 mt-3">
        {p.summary.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>

      <div className="excerpt mt-4" style={{ background: 'var(--surface-sunken)' }}>
        {p.excerpt}
      </div>

      <div className="mt-5">
        <div className="row-between mb-2">
          <span className="xs strong">상품군 태그</span>
          <span className="xs faint">
            모델 제안 {p.proposed.map(readTag).join(', ') || '없음'}
          </span>
        </div>
        <div className="row wrap gap-1">
          {ALL_TAGS.map((t) => (
            <button
              key={t}
              className={`tag-pick${p.proposed.includes(t) ? ' proposed' : ''}`}
              aria-pressed={tags.includes(t)}
              disabled={settled}
              onClick={() => toggle(t)}
            >
              {readTag(t)}
            </button>
          ))}
        </div>
      </div>

      <div className="row-between wrap gap-3 mt-5">
        <a
          className="btn btn-sm btn-ghost"
          href={p.url}
          target="_blank"
          rel="noreferrer"
          style={{ paddingLeft: 8 }}
        >
          원문 PDF
          <IconExternal size={14} />
        </a>
        <div className="row gap-2">
          <button
            className="btn btn-sm btn-ghost"
            disabled={settled}
            onClick={() => onDecide(p.id, 'rejected', [])}
          >
            <IconX size={14} />
            반려
          </button>
          <button
            className="btn btn-sm btn-primary"
            disabled={settled || tags.length === 0}
            onClick={() => onDecide(p.id, 'approved', tags)}
            title={tags.length === 0 ? '태그를 하나 이상 골라야 승인할 수 있습니다' : undefined}
          >
            <IconCheck size={14} />
            승인 · 태그 {tags.length}개 확정
          </button>
        </div>
      </div>
    </article>
  )
}
