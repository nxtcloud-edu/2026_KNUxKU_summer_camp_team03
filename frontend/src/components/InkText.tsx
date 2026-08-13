/**
 * 손글씨처럼 흐르는 본문
 *
 * 글자를 한 번에 튀어나오게 하면 "출력"으로 보이고, 잉크가 앉는 과정을 보여 주면
 * "쓰는 중"으로 읽힌다. 차이는 마지막 몇 글자에서 난다.
 *
 *   이미 앉은 글자  한 덩어리 문자열로 그린다 (span을 남발하면 느려진다)
 *   막 쓰인 글자    글자마다 span. 번짐→선명으로 한 번만 애니메이션
 *   맨 끝           만년필 촉이 머무른다
 *
 * span은 절대 인덱스를 key로 쓴다. 그래야 각 글자가 처음 등장할 때 딱 한 번
 * 애니메이션이 돌고, 뒤 글자가 늘어나도 앞 글자가 다시 번쩍이지 않는다.
 */

/** 잉크가 마르는 중인 글자 수. 늘리면 번지는 꼬리가 길어진다 */
const WET = 6

export default function InkText({
  text,
  shown,
  done,
}: {
  text: string
  shown: number
  done: boolean
}) {
  if (done) return <>{text}</>

  const settledEnd = Math.max(0, shown - WET)
  const settled = text.slice(0, settledEnd)
  const wet = text.slice(settledEnd, shown)

  return (
    <>
      {settled}
      {wet.split('').map((ch, i) => {
        const at = settledEnd + i
        // 줄바꿈은 span으로 감싸면 레이아웃이 깨진다. 그대로 흘린다
        if (ch === '\n') return '\n'
        return (
          <span className="ink-char" key={at}>
            {ch}
          </span>
        )
      })}
      <span className="nib" aria-hidden>
        <svg viewBox="0 0 12 20" width="9" height="15">
          {/* 만년필 촉 — 가운데 슬릿과 브리더 홀 */}
          <path d="M6 20 L1.2 7.5 Q6 2.4 10.8 7.5 Z" fill="currentColor" />
          <path d="M6 20 L6 10.4" stroke="var(--surface)" strokeWidth="0.9" />
          <circle cx="6" cy="9.4" r="1.1" fill="var(--surface)" />
        </svg>
      </span>
    </>
  )
}
