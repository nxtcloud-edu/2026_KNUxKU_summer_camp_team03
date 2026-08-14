import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ALL_TAGS, DEMO_TODAY, REPORTS } from '../lib/mock'
import { isPublished } from '../lib/overrides'
import { readTag, sinceDays } from '../lib/format'
import { Empty, Reveal } from '../components/ui'
import { IconSearch } from '../components/icons'

export default function Library() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return REPORTS.filter((r) => {
      // 관리자 콘솔에서 보류한 리포트는 서재에 내보내지 않는다
      if (!isPublished(r.id)) return false
      if (tag && !r.tags.includes(tag)) return false
      if (!needle) return true
      return (
        r.title.toLowerCase().includes(needle) ||
        r.house.includes(needle) ||
        r.summary.some((s) => s.toLowerCase().includes(needle))
      )
    }).sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [q, tag])

  return (
    <div className="container" style={{ padding: 'var(--sp-12) 0 var(--sp-24)' }}>
      <div className="page-head">
        <h1 className="page-title">리포트 서재</h1>
        <p className="page-lead">
          답변의 근거가 되는 자료들 — 수집 → 키워드 1차 필터 → 모델 태깅 → 3줄 요약을 거쳐
          남은 리포트입니다. 챗봇과 포트폴리오가 인용하는 자료는 전부 여기 있습니다.
        </p>
      </div>

      <div className="alert alert-warn keep mb-6" style={{ lineHeight: 1.85 }}>
        ⚠ 네이버 리서치에서 실제로 수집한 <b>공개 리포트</b>입니다. 제목·증권사·발행일과
        원문 링크는 실제 값이며, 3줄 요약과 상품군 태그는 자동으로 붙인 것이라 검수 전입니다.
        어떤 내용도 투자 권유가 아닙니다.
      </div>

      <div className="row wrap gap-3 mb-6">
        <div className="search" style={{ flex: '1 1 280px' }}>
          <IconSearch size={17} />
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="제목, 증권사, 요약에서 찾기"
            aria-label="리포트 검색"
          />
        </div>
        <span className="small muted num" style={{ flex: 'none' }}>
          {list.length} / {REPORTS.filter((r) => isPublished(r.id)).length}건
        </span>
      </div>

      <div className="row wrap gap-2 mb-8">
        <button
          className="chip"
          aria-pressed={tag === null}
          onClick={() => setTag(null)}
        >
          전체
        </button>
        {ALL_TAGS.map((t) => (
          <button
            key={t}
            className="chip"
            aria-pressed={tag === t}
            onClick={() => setTag(tag === t ? null : t)}
          >
            {readTag(t)}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty
          title="찾는 리포트가 없습니다"
          description="검색어를 줄이거나 태그를 풀어 보세요."
        />
      ) : (
        <div className="lib-grid">
          {list.map((r, i) => (
            <Reveal key={r.id} delay={Math.min(i, 6) * 40}>
              <button className="rep" onClick={() => nav(`/library/${r.id}`)}>
                <div className="rep-meta">
                  <span className="strong" style={{ color: 'var(--brand)' }}>
                    {r.house}
                  </span>
                  <span>·</span>
                  <span>{r.analyst}</span>
                  <span className="spacer" />
                  <span>{sinceDays(r.date, DEMO_TODAY)}</span>
                </div>

                <h3>{r.title}</h3>

                <ul className="rep-sum col gap-1">
                  {r.summary.slice(0, 2).map((s, j) => (
                    <li key={j} className="clamp-2">
                      {s}
                    </li>
                  ))}
                </ul>

                {/* 태그 개수가 리포트마다 달라 줄바꿈 여부까지 들쭉날쭉했다.
                    3개까지만 보여주고 나머지는 개수로만 알려 한 줄로 고정한다 */}
                <div className="row wrap gap-1 mt-1 rep-tags">
                  {r.tags.slice(0, 3).map((t) => (
                    <span key={t} className="tag">
                      {readTag(t)}
                    </span>
                  ))}
                  {r.tags.length > 3 && (
                    <span className="tag tag-more">+{r.tags.length - 3}</span>
                  )}
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  )
}
