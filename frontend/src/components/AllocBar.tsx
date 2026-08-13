/**
 * 배분 막대 — 기준 비중과 조정 비중을 위아래로 겹쳐 보여 준다.
 *
 * 도넛 대신 가로 막대를 쓴 이유: 이 서비스의 핵심은 "구성"이 아니라
 * "기준에서 얼마나, 왜 움직였는가"다. 두 값을 나란히 놓고 비교하려면
 * 같은 축을 공유하는 막대가 도넛보다 낫다.
 */
import { ASSET_COLOR, ASSET_LABEL, type Weights } from '../lib/quant'

const ORDER: (keyof Weights)[] = ['cash', 'etf', 'bond']

function Bar({ w, dim }: { w: Weights; dim?: boolean }) {
  return (
    <div className={`wbar${dim ? ' dim' : ''}`}>
      {ORDER.map((k) =>
        w[k] > 0 ? (
          <div
            key={k}
            className="wseg"
            style={{ width: `${w[k]}%`, background: ASSET_COLOR[k] }}
            title={`${ASSET_LABEL[k]} ${w[k]}%`}
          >
            {w[k] >= 12 ? `${ASSET_LABEL[k]} ${w[k]}` : w[k] >= 6 ? w[k] : ''}
          </div>
        ) : null,
      )}
    </div>
  )
}

export default function AllocBar({
  baseline,
  adjusted,
  rejected,
  compact,
}: {
  baseline: Weights
  adjusted?: Weights
  rejected?: number
  compact?: boolean
}) {
  const changed =
    adjusted && ORDER.some((k) => adjusted[k] !== baseline[k]) ? adjusted : undefined

  return (
    <div className="allocbar">
      {!compact && <div className="wlabel">기준 비중 · 1~2단계 순수 연산</div>}
      <Bar w={baseline} dim={!!changed} />

      {changed && (
        <>
          <div className="wmid">
            <span className="wmid-line" />
            <span className="wmid-tag">3단계 조정 · ±10%p 이내 · 근거 필수</span>
            <span className="wmid-line" />
          </div>
          <div className="wlabel">조정 예시 · 에이전트 제안을 코드가 검증한 값</div>
          <Bar w={changed} />

          <div className="wdelta">
            {ORDER.map((k) => {
              const d = changed[k] - baseline[k]
              if (d === 0) return null
              return (
                <span key={k} className={`dchip ${d > 0 ? 'up' : 'down'}`}>
                  {ASSET_LABEL[k]} {d > 0 ? '+' : ''}
                  {d}%p
                </span>
              )
            })}
            {!!rejected && <span className="dchip off">근거 없는 제안 {rejected}건 폐기</span>}
          </div>
        </>
      )}

      {compact && (
        <div className="wlegend">
          {ORDER.map((k) => (
            <span key={k}>
              <i style={{ background: ASSET_COLOR[k] }} />
              {ASSET_LABEL[k]} {baseline[k]}%
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
