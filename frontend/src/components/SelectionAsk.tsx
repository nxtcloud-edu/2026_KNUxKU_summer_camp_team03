/**
 * SelectionAsk — 본문을 드래그로 집으면 선택 영역 위에 동그란 마커를 띄운다.
 *
 * 마커를 누르면 선택한 문구를 「"…" 무슨 뜻이에요?」로 만들어 quill:ask로
 * 흘려보낸다 — 답변은 그 이벤트를 이미 듣고 있는 챗 UI(ChatWidget)가
 * 알아서 처리한다. 여기는 질문을 만들어 던지는 것까지만 한다.
 *
 * Layout 셸에서 <Outlet/>을 한 번만 감싼다 — 플로팅 챗 위젯이 뜨는
 * 화면(서재·리포트 상세·포트폴리오·마이페이지·온보딩)과 범위가 정확히
 * 일치해야 하기 때문에, 페이지마다 따로 감싸지 않는다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconChat } from './icons'

const MAX_LEN = 200

interface Spot {
  x: number
  y: number
  text: string
}

export default function SelectionAsk({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [spot, setSpot] = useState<Spot | null>(null)

  useEffect(() => {
    const onMouseUp = () => {
      // selection은 mouseup 직후에 확정된다 — 한 틱 늦게 읽는다
      window.setTimeout(() => {
        const wrap = wrapRef.current
        const sel = window.getSelection()
        if (!wrap || !sel || sel.isCollapsed || sel.rangeCount === 0) {
          setSpot(null)
          return
        }
        // 개행·중복 공백 정리 후 200자에서 끊는다
        const text = sel.toString().replace(/\s+/g, ' ').trim().slice(0, MAX_LEN)
        if (!text) {
          setSpot(null)
          return
        }
        // 이 컨테이너 밖(사이드바·챗 위젯 등)에서 집은 선택은 무시
        const node = sel.getRangeAt(0).commonAncestorContainer
        const el = node instanceof Element ? node : node.parentElement
        if (!el || !wrap.contains(el)) {
          setSpot(null)
          return
        }
        const r = sel.getRangeAt(0).getBoundingClientRect()
        const w = wrap.getBoundingClientRect()
        setSpot({ x: r.left + r.width / 2 - w.left, y: r.top - w.top, text })
      }, 0)
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])

  const ask = () => {
    if (!spot) return
    window.dispatchEvent(
      new CustomEvent('quill:ask', { detail: `"${spot.text}" 무슨 뜻이에요?` }),
    )
    window.getSelection()?.removeAllRanges()
    setSpot(null)
  }

  return (
    <div ref={wrapRef} className="selection-ask-wrap">
      {children}
      {spot && (
        <button
          className="selection-ask-dot"
          style={{ left: spot.x, top: spot.y }}
          /* 버튼을 누르는 순간 선택이 풀리지 않게 */
          onMouseDown={(e) => e.preventDefault()}
          onClick={ask}
          aria-label="선택한 문구를 챗봇에게 묻기"
          title="이 문구, 무슨 뜻이에요?"
        >
          {/* 플로팅 챗 버튼과 같은 말풍선 — 어디로 가는 질문인지 아이콘이 말해 준다 */}
          <IconChat size={19} />
        </button>
      )}
    </div>
  )
}
