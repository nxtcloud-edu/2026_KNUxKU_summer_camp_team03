/**
 * 드래그해서 바로 물어보기 — 리포트를 읽다가 모르는 구간을 선택하면
 * 그 자리에 작은 점이 뜨고, 누르면 그 글이 그대로 챗봇 입력으로 들어간다.
 *
 * 백엔드도, 챗봇 로직도 새로 안 만든다. 이미 있는 `quill:ask` 이벤트에
 * 선택한 글자를 실어 보내는 것뿐이다 — 이 이벤트는 대화 화면(Chat.tsx)과
 * 우하단 플로팅 챗봇(ChatWidget.tsx) 둘 다 이미 듣고 있어서, 어느 페이지에서
 * 셀렉트하든(대화 화면이면 본 대화로, 그 외 페이지면 플로팅 챗봇으로)
 * 알아서 맞는 곳으로 간다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconChat } from './icons'

const MAX_LEN = 200

export default function SelectionAsk({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [mark, setMark] = useState<{ top: number; left: number; text: string } | null>(null)

  useEffect(() => {
    const onMouseUp = () => {
      const box = ref.current
      const sel = window.getSelection()
      const raw = sel?.toString().replace(/\s+/g, ' ').trim()

      if (!box || !sel || !raw || sel.isCollapsed) {
        setMark(null)
        return
      }
      // 이 컨테이너 밖에서 선택한 글은 무시한다 (사이드바 텍스트 등)
      if (!sel.anchorNode || !box.contains(sel.anchorNode)) {
        setMark(null)
        return
      }

      const rangeRect = sel.getRangeAt(0).getBoundingClientRect()
      const boxRect = box.getBoundingClientRect()
      setMark({
        top: rangeRect.top - boxRect.top - 34,
        left: rangeRect.left - boxRect.left + rangeRect.width / 2,
        text: raw.slice(0, MAX_LEN),
      })
    }

    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])

  const ask = () => {
    if (!mark) return
    window.dispatchEvent(new CustomEvent('quill:ask', { detail: `"${mark.text}" 무슨 뜻이에요?` }))
    window.getSelection()?.removeAllRanges()
    setMark(null)
  }

  return (
    <div className="select-ask" ref={ref}>
      {children}
      {mark && (
        <button
          className="select-ask-dot"
          style={{ top: mark.top, left: mark.left }}
          onClick={ask}
          aria-label={`"${mark.text}" 챗봇에게 물어보기`}
        >
          <IconChat size={13} />
        </button>
      )}
    </div>
  )
}
