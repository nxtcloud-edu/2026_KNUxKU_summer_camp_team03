import { Link, Navigate, useParams } from 'react-router-dom'
import { DEMO_TODAY, PRODUCTS, REPORTS, reportById } from '../lib/mock'
import { readTag, sinceDays } from '../lib/format'
import { SourceList } from '../components/Evidence'
import { IconArrowLeft, IconExternal } from '../components/icons'

export default function ReportPage() {
  const { id } = useParams()
  const r = id ? reportById(id) : undefined
  if (!r) return <Navigate to="/library" replace />

  const related = REPORTS.filter(
    (x) => x.id !== r.id && x.tags.some((t) => r.tags.includes(t))
  ).slice(0, 3)

  const used = PRODUCTS.filter((p) => p.sources.includes(r.id))

  return (
    <div className="container" style={{ padding: 'var(--sp-8) 0 var(--sp-24)' }}>
      <Link className="btn btn-ghost btn-sm" to="/library">
        <IconArrowLeft size={15} />
        리포트 서재
      </Link>

      <article className="narrow mt-6">
        <div className="row wrap gap-2 small muted">
          <span className="strong" style={{ color: 'var(--brand)' }}>
            {r.house}
          </span>
          <span>·</span>
          <span>{r.analyst}</span>
          <span>·</span>
          <span>{r.date}</span>
          <span className="faint">({sinceDays(r.date, DEMO_TODAY)})</span>
          <span>·</span>
          <span>{r.pages}쪽</span>
        </div>

        <h1 className="display mt-4" style={{ fontSize: 'clamp(28px,4vw,38px)' }}>
          {r.title}
        </h1>

        <div className="row wrap gap-1 mt-5">
          {r.tags.map((t) => (
            <span key={t} className="tag">
              {readTag(t)}
            </span>
          ))}
        </div>

        <hr className="hairline-gold mt-8" />

        <div className="mt-8">
          <div className="eyebrow mb-4">3줄 요약</div>
          <ul className="rep-sum col gap-3">
            {r.summary.map((s, i) => (
              <li key={i} style={{ fontSize: 'var(--t-base)' }}>
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10">
          <div className="eyebrow mb-4">인용 원문</div>
          <div className="excerpt" style={{ fontSize: 'var(--t-base)' }}>
            {r.excerpt}
          </div>
          <p className="xs faint mt-3">
            답변에 이 리포트가 인용될 때 그대로 노출되는 구간입니다.
          </p>
        </div>

        <div className="card card-quiet card-pad mt-10">
          <div className="row-between">
            <span className="small strong">LLM 태깅 신뢰도</span>
            <span className="num strong">{(r.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="bar mt-3">
            <i style={{ width: `${r.confidence * 100}%` }} />
          </div>
          <p className="xs faint keep mt-4" style={{ lineHeight: 1.85 }}>
            서론 일부를 모델에 넣어 상품군 태그를 자동으로 붙이고, 신뢰도가 70% 미만이면
            사람이 검수하는 큐로 넘깁니다. 검수 전 리포트는 답변 근거로 쓰이지 않습니다.
          </p>
        </div>

        <div className="row gap-3 mt-8">
          <a className="btn btn-soft" href={r.url} target="_blank" rel="noreferrer">
            원문 PDF 열기
            <IconExternal size={15} />
          </a>
          <span className="small faint">샘플 링크입니다</span>
        </div>

        {used.length > 0 && (
          <div className="mt-12">
            <div className="eyebrow mb-4">이 리포트를 근거로 쓰는 상품</div>
            <div className="col gap-2">
              {used.map((p) => (
                <div className="card card-quiet card-pad" key={p.id}>
                  <div className="strong">{p.name}</div>
                  <p className="small muted keep mt-2" style={{ lineHeight: 1.85 }}>
                    {p.why}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {related.length > 0 && (
          <div className="mt-12">
            <div className="eyebrow mb-4">같은 태그의 다른 리포트</div>
            <SourceList ids={related.map((x) => x.id)} label="" />
          </div>
        )}

        <p className="xs faint keep mt-12" style={{ lineHeight: 1.9 }}>
          ⚠ 이 리포트는 화면 검증용 샘플입니다. 실제 증권사 발간 자료가 아니며, 증권사명과
          애널리스트명, 모든 수치는 형식을 보여 주기 위한 가상의 값입니다.
        </p>
      </article>
    </div>
  )
}
