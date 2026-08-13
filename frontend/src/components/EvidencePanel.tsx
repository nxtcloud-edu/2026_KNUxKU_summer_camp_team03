/**
 * 근거 패널 — 대화 오른쪽에 상주한다.
 *
 * 답변에 인용된 리포트가 위로 쌓이고, 누르면 3줄 요약과 인용 원문이
 * 그 자리에서 펼쳐진다. 사용자가 대화를 떠나지 않고 근거를 확인할 수
 * 있어야 해서 모달이 아니라 인라인 아코디언으로 뒀다.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { reportById } from '../lib/mock'
import { IconArrowRight, IconBook } from './icons'

export default function EvidencePanel({ cited }: { cited: string[] }) {
  const [open, setOpen] = useState<string | null>(null)

  // 대화 쪽에서 인용 칩을 누르면 해당 리포트를 펼친다
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      setOpen((cur) => (cur === id ? null : id))
    }
    window.addEventListener('quill:open-report', onOpen)
    return () => window.removeEventListener('quill:open-report', onOpen)
  }, [])

  return (
    <aside className="evi-panel">
      <div className="evi-head">
        <span className="eyebrow">
          <span className="rule-gold" />
          근거 자료
        </span>
        <span className="xs faint num">{cited.length}건</span>
      </div>

      {cited.length === 0 ? (
        <div className="evi-empty">
          <IconBook size={22} style={{ color: 'var(--ink-4)' }} />
          <p className="small muted keep mt-3">
            답변에 쓰인 리포트가 여기 쌓입니다. 누르면 인용한 원문이 그대로 열려요.
          </p>
          <p className="xs faint keep mt-3">
            근거가 없으면 답을 만들지 않습니다. 그럴 땐 이 자리가 비어 있는 게
            정상입니다.
          </p>
        </div>
      ) : (
        <div className="evi-list">
          {cited.map((id, n) => {
            const r = reportById(id)
            if (!r) return null
            const isOpen = open === id
            return (
              <div className={`evi-item${isOpen ? ' open' : ''}`} key={id}>
                <button className="evi-top" onClick={() => setOpen(isOpen ? null : id)}>
                  {/* 대화의 각주 번호와 같은 번호. 눈으로 이어 따라갈 수 있게 */}
                  <span className="evi-num">{n + 1}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="evi-house">
                      {r.house} · {r.date}
                    </span>
                    <span className="evi-title">{r.title}</span>
                  </span>
                </button>

                {isOpen && (
                  <div className="evi-body">
                    <div className="evi-sec">3줄 요약</div>
                    <ul className="evi-sum">
                      {r.summary.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>

                    <div className="evi-sec mt-4">인용한 원문</div>
                    <blockquote className="evi-quote">{r.excerpt}</blockquote>

                    <div className="row-between mt-4">
                      <span className="xs faint">
                        태깅 신뢰도 {Math.round(r.confidence * 100)}%
                      </span>
                      <Link className="evi-more" to={`/library/${r.id}`}>
                        리포트 전체
                        <IconArrowRight size={13} />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="evi-foot">
        네이버 리서치에서 수집한 실제 공개 리포트입니다. 요약과 태그는 자동 생성분입니다.
      </p>
    </aside>
  )
}
