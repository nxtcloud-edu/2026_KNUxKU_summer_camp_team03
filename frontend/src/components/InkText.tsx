/**
 * 스트리밍 본문 — 도착한 글자는 평범하게 그대로 그리고,
 * 끝에 깜빡이는 세로 막대 커서(.caret) 하나만 둔다.
 *
 * 글자가 시간차를 두고 도착하는 타이밍은 Chat.tsx(penDelay)가 쥐고 있다.
 * 여기는 "이미 도착한 부분을 어떻게 그리는가"만 담당한다 — 글자별
 * 번짐 애니메이션과 만년필 촉 커서는 걷어냈다(시각적 단순화).
 */
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

  return (
    <>
      {text.slice(0, shown)}
      <span className="caret" aria-hidden />
    </>
  )
}
