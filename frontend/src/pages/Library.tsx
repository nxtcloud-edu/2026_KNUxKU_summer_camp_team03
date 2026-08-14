import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ALL_TAGS, REPORTS } from '../lib/mock'
import { isPublished } from '../lib/overrides'
import { readTag } from '../lib/format'
import { Empty } from '../components/ui'
import ReportFan from '../components/ReportFan'

export default function Library() {
  const nav = useNavigate()
  const [tag, setTag] = useState<string | null>(null)

  const list = useMemo(() => {
    return REPORTS.filter((r) => {
      // 관리자 콘솔에서 보류한 리포트는 서재에 내보내지 않는다
      if (!isPublished(r.id)) return false
      if (tag && !r.tags.includes(tag)) return false
      return true
    }).sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [tag])

  return (
    <div className="container" style={{ padding: 'var(--sp-12) 0 var(--sp-24)' }}>
      <div className="page-head">
        <h1 className="page-title">리포트 서재</h1>
        <p className="page-lead">
          답변의 근거가 되는 자료들 — 수집 → 키워드 1차 필터 → 모델 태깅 → 3줄 요약을 거쳐
          남은 리포트입니다. 챗봇과 포트폴리오가 인용하는 자료는 전부 여기 있습니다.
        </p>
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
        /* 태그가 바뀌면 key가 갈리며 덱을 처음부터 다시 펼친다 */
        <ReportFan
          key={tag ?? 'all'}
          reports={list}
          onOpen={(id) => nav(`/library/${id}`)}
        />
      )}
    </div>
  )
}
