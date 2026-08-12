/**
 * 에이전트 트레이스 — 어떤 에이전트가 무엇을 했는지 그대로 편다.
 *
 * 설계문서의 AgentCore Observability 자리다. 데모에서 "왜 이 비중이
 * 나왔는가"를 보여 주는 것이 이 서비스의 설득 포인트라, 개발자 도구가
 * 아니라 사용자가 볼 수 있는 화면 요소로 뒀다.
 */
import type { TraceStep } from '../lib/chatEngine'

const TONE: Record<TraceStep['agent'], string> = {
  Guardrails: 'guard',
  Supervisor: 'sup',
  Triage: 'a1',
  Analysis: 'a2',
  Recommendation: 'a3',
}

export default function AgentTrace({ steps }: { steps: TraceStep[] }) {
  const total = steps.reduce((s, t) => s + t.ms, 0)

  return (
    <div className="trace">
      <div className="trace-head">
        <span className="xs faint">호출 {steps.length}건</span>
        <span className="xs faint num">합계 {total}ms</span>
      </div>
      {steps.map((s, i) => (
        <div className="trace-row" key={i}>
          <span className={`trace-tag ${TONE[s.agent]}`}>{s.agent}</span>
          <span className="trace-label">{s.label}</span>
          <span className="trace-detail truncate">{s.detail}</span>
          <span className="trace-ms num">{s.ms}ms</span>
        </div>
      ))}
    </div>
  )
}
