/**
 * 용어 풀이
 *
 * 이 서비스가 범용 챗봇과 갈라지는 지점 중 하나.
 * 전문 용어를 만나면 창을 닫는 대신 그 자리에서 눈높이 설명을 편다.
 */
import { useState, type ReactNode } from 'react'
import { GLOSSARY } from '../lib/mock'

export function Term({ k, children }: { k: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const def = GLOSSARY[k]
  if (!def) return <>{children ?? k}</>

  return (
    <span
      className="term"
      tabIndex={0}
      role="button"
      aria-expanded={open}
      aria-label={`${k} 뜻 보기`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation()
        setOpen((v) => !v)
      }}
    >
      {children ?? k}
      {open && (
        <span className="term-pop" role="tooltip">
          <b>{k}</b>
          {def}
        </span>
      )}
    </span>
  )
}
