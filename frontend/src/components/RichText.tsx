/**
 * 대화 본문에 용어 풀이를 자동으로 붙인다.
 *
 * 범용 챗봇과 갈라지는 지점. "듀레이션"이 나왔을 때 사용자가 검색하러
 * 떠나면 그대로 이탈이다. 그 자리에서 풀어 주면 대화가 이어진다.
 *
 * 스트리밍 중에는 쓰지 않는다. 글자가 잘린 상태로 용어를 잡으면
 * "듀레이"까지만 매칭되어 밑줄이 깜빡거린다. 다 흐른 뒤에 한 번 입힌다.
 */
import { Fragment, type ReactNode } from 'react'
import { GLOSSARY } from '../lib/mock'
import { Term } from './Term'

/** 긴 단어부터 찾아야 한다. '국채'가 '회사채'보다 먼저 걸리면 안 된다 */
const KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length)
const PATTERN = new RegExp(`(${KEYS.map(escape).join('|')})`, 'g')

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default function RichText({ text }: { text: string }) {
  const out: ReactNode[] = []
  // 한 용어당 한 번만 풀어 준다. 같은 단어에 밑줄이 계속 그이면 지저분하다
  const used = new Set<string>()

  text.split('\n').forEach((line, li) => {
    if (li > 0) out.push(<br key={`br${li}`} />)

    let last = 0
    for (const m of line.matchAll(PATTERN)) {
      const key = m[0]
      const at = m.index ?? 0
      if (used.has(key)) continue

      if (at > last) out.push(line.slice(last, at))
      out.push(
        <Term k={key} key={`${li}-${at}`}>
          {key}
        </Term>,
      )
      used.add(key)
      last = at + key.length
    }
    if (last < line.length) out.push(line.slice(last))
  })

  return (
    <>
      {out.map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </>
  )
}
