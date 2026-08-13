/**
 * 근거 패널 — 대화 오른쪽에 상주한다.
 *
 * 답변에 인용된 리포트가 위로 쌓이고, 누르면 3줄 요약과 인용 원문이
 * 그 자리에서 펼쳐진다. 사용자가 대화를 떠나지 않고 근거를 확인할 수
 * 있어야 해서 모달이 아니라 인라인 아코디언으로 뒀다.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { reportById } from '../lib/mock'
import { IconArrowLeft, IconArrowRight, IconBook } from './icons'

export default function EvidencePanel({ cited }: { cited: string[] }) {
  const [open, setOpen] = useState<string | null>(null)
  /* 접기·펼치기 — 이 패널 안에서만 도는 화면 상태. 새 대화창은 접힌 채로
     시작한다 — 아직 근거가 없는데 빈 칸을 넓게 차지할 이유가 없다. */
  const [collapsed, setCollapsed] = useState(true)
  /* 근거가 처음 쌓이는 순간 딱 한 번만 자동으로 펼친다. 그다음부터는
     사용자가 접고 펴는 걸 그대로 둔다 — 매번 답이 올 때마다 튀어나오면
     오히려 방해가 된다. 대화가 새로 시작되어 근거가 다시 0으로 돌아가면
     다음 대화방을 위해 다시 무장된다. */
  const wasEmpty = useRef(true)
  useEffect(() => {
    if (wasEmpty.current && cited.length > 0) {
      setCollapsed(false)
    }
    wasEmpty.current = cited.length === 0
  }, [cited.length])

  // 대화 쪽에서 인용 칩을 누르면 해당 리포트를 펼친다 — 패널이 접혀 있었다면
  // 같이 펼친다. 근거를 보겠다고 누른 것이니 이때는 자동으로 열어도 된다.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      setOpen((cur) => (cur === id ? null : id))
      setCollapsed(false)
    }
    window.addEventListener('quill:open-report', onOpen)
    return () => window.removeEventListener('quill:open-report', onOpen)
  }, [])

  return (
    <aside className={`evi-panel${collapsed ? ' collapsed' : ''}`}>
      <div className="evi-head">
        {!collapsed && (
          <span className="eyebrow">
            <span className="rule-gold" />
            근거 자료
            <span className="xs faint num" style={{ marginLeft: 6 }}>
              {cited.length}건
            </span>
          </span>
        )}
        <button
          className="evi-collapse"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? '근거 자료 펼치기' : '근거 자료 접기'}
        >
          {collapsed ? <IconArrowLeft size={14} /> : <IconArrowRight size={14} />}
        </button>
      </div>

      {collapsed ? null : cited.length === 0 ? (
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
