/**
 * 상반된 관점 병렬 제시
 *
 * 리포트끼리 의견이 갈릴 때 합치지 않는다. 어느 쪽이 옳은지 고르는 순간
 * 이 서비스는 "정리해 주는 도구"에서 "판단하는 주체"가 되어 버린다.
 * 갈렸다는 사실을 그대로 보여 주고 선택은 사용자에게 남긴다.
 */
import { reportById, type DivergentView } from '../lib/mock'

export default function ParallelViews({ view }: { view: DivergentView }) {
  return (
    <div className="pv">
      <div className="pv-head">
        <span className="pv-badge">관점이 갈립니다</span>
        <span className="pv-topic">{view.topic}</span>
      </div>

      <div className="pv-grid">
        {view.sides.map((s) => {
          const r = reportById(s.reportId)
          if (!r) return null
          return (
            <div className="pv-col" key={s.reportId}>
              <div className="pv-house">{r.house}</div>
              <div className="pv-stance">{s.stance}</div>
              <p className="pv-ground">{s.ground}</p>
              <button
                className="pv-src"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('quill:open-report', { detail: s.reportId }),
                  )
                }
              >
                근거 원문 보기
              </button>
            </div>
          )
        })}
      </div>

      <p className="pv-foot">
        둘 중 어느 쪽이 맞는지는 저희가 정하지 않습니다. 두 관점을 그대로 옮겼으니
        회원님의 사정에 맞는 쪽을 고르시면 됩니다.
      </p>
    </div>
  )
}
