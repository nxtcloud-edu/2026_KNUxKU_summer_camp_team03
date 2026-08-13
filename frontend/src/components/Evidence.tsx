/**
 * 근거 표시
 *
 * 이 제품의 핵심 약속 — 화면에 나온 모든 판단은 출처를 달고 나온다.
 * 칩을 누르면 그 리포트의 3줄 요약과 인용 원문이 그대로 열린다.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DEMO_TODAY, reportById, type Report } from '../lib/mock'
import { isPublished } from '../lib/overrides'
import { readTag, shortDate, sinceDays } from '../lib/format'
import { Drawer } from './ui'
import { IconDoc, IconExternal, IconX } from './icons'

/* ── 근거 칩 하나 ─────────────────────────────────────────── */
export function SourceChip({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const r = reportById(id)
  if (!r) return null

  return (
    <>
      <button
        className="src"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        title={r.title}
      >
        <IconDoc size={13} style={{ flex: 'none', opacity: 0.75 }} />
        <span>
          {r.house} · {shortDate(r.date)}
        </span>
      </button>
      {open && <ReportDrawer report={r} onClose={() => setOpen(false)} />}
    </>
  )
}

/* ── 여러 개 ──────────────────────────────────────────────── */
export function SourceList({ ids, label }: { ids: string[]; label?: string }) {
  // 관리자가 보류한 리포트는 근거로 내보내지 않는다.
  // 근거가 하나도 남지 않으면 줄 자체를 없앤다 — 빈 '근거' 라벨만 남는 게 더 나쁘다.
  const live = ids.filter(isPublished)
  if (!live.length) return null
  return (
    <div className="row wrap gap-2" style={{ alignItems: 'center' }}>
      {label !== undefined && (
        <span className="xs faint" style={{ flex: 'none' }}>
          {label || '근거'}
        </span>
      )}
      <div className="src-list">
        {live.map((id) => (
          <SourceChip key={id} id={id} />
        ))}
      </div>
    </div>
  )
}

/* ── 서랍 ─────────────────────────────────────────────────── */
export function ReportDrawer({
  report: r,
  onClose,
}: {
  report: Report
  onClose: () => void
}) {
  return (
    <Drawer onClose={onClose}>
      <div className="drawer-head">
        <div className="grow">
          <div className="row gap-2 xs faint">
            <span>{r.house}</span>
            <span>·</span>
            <span>{r.analyst}</span>
            <span>·</span>
            <span>{r.pages}쪽</span>
          </div>
          <h3 className="display mt-2" style={{ fontSize: 'var(--t-lg)' }}>
            {r.title}
          </h3>
          <div className="row gap-2 mt-2 xs muted">
            <span>{r.date}</span>
            <span className="faint">({sinceDays(r.date, DEMO_TODAY)})</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="닫기">
          <IconX size={17} />
        </button>
      </div>

      <div className="drawer-body">
        <div className="row wrap gap-2">
          {r.tags.map((t) => (
            <span key={t} className="tag">
              {readTag(t)}
            </span>
          ))}
        </div>

        <div className="mt-6">
          <div className="eyebrow mb-3">3줄 요약</div>
          <ul className="rep-sum col gap-2">
            {r.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>

        <div className="mt-6">
          <div className="eyebrow mb-3">인용 원문</div>
          <div className="excerpt">{r.excerpt}</div>
        </div>

        <div className="mt-6 card-quiet" style={{ borderRadius: 'var(--r-md)', padding: 16 }}>
          <div className="row-between">
            <span className="xs muted">LLM 태깅 신뢰도</span>
            <span className="num small strong">{(r.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="bar mt-2">
            <i style={{ width: `${r.confidence * 100}%` }} />
          </div>
          <p className="xs faint mt-3 keep" style={{ lineHeight: 1.7 }}>
            수집 단계에서 제목·요약에 키워드가 없으면 버리고, 남은 리포트의 서론을 모델에 넣어
            상품군 태그를 붙입니다. 신뢰도 70% 미만은 사람이 검수하는 큐로 넘어갑니다.
          </p>
        </div>

        <div className="row gap-2 mt-6">
          <Link className="btn btn-soft grow" to={`/library/${r.id}`} onClick={onClose}>
            서재에서 열기
          </Link>
          <a
            className="btn btn-ghost"
            href={r.url}
            target="_blank"
            rel="noreferrer"
            title="샘플 링크입니다"
          >
            원문 PDF
            <IconExternal size={15} />
          </a>
        </div>

        <p className="xs faint mt-6 keep" style={{ lineHeight: 1.8 }}>
          ⚠ 이 리포트는 화면 검증용으로 지어낸 샘플입니다. 실제 증권사 리포트가 아니며 투자
          판단의 근거가 될 수 없습니다.
        </p>
      </div>
    </Drawer>
  )
}
