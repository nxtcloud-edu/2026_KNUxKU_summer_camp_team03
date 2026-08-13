import { Link } from 'react-router-dom'
import { CHAT_LOGS, INGEST_DAYS, JOBS, OPS, PENDING } from '../lib/adminMock'
import { REPORTS } from '../lib/mock'
import { useAdmin } from '../lib/overrides'
import {
  IconAlert,
  IconArrowRight,
  IconChat,
  IconCheck,
  IconDoc,
  IconInspect,
} from '../components/icons'

const today = INGEST_DAYS[INGEST_DAYS.length - 1]

export default function AdminOverview() {
  const admin = useAdmin()

  const pending = PENDING.filter((p) => !admin.decided[p.id])
  const held = REPORTS.filter((r) => admin.status[r.id] === 'held').length
  const grounded = CHAT_LOGS.filter((c) => c.grounded).length
  const groundRate = grounded / CHAT_LOGS.length
  const failedJobs = JOBS.filter((j) => j.status === 'fail')

  const passed = today.fetched - today.dropped
  const funnel = [
    { label: '수집', v: today.fetched, color: 'var(--a2)' },
    { label: '키워드 통과', v: passed, color: 'var(--a3)' },
    { label: '태깅 완료', v: today.tagged, color: 'var(--a4)' },
    { label: '공개', v: today.tagged - today.held, color: 'var(--a5)' },
  ]

  return (
    <div className="col gap-4">
      {failedJobs.length > 0 && (
        <div className="alert alert-danger">
          <IconAlert size={16} style={{ flex: 'none', marginTop: 2 }} />
          <div>
            <b>수집 잡 {failedJobs.length}건이 실패했습니다.</b>{' '}
            {failedJobs.map((j) => `${j.source} — ${j.note ?? '원인 미상'}`).join(' · ')}
            <div style={{ marginTop: 8 }}>
              <Link className="btn btn-sm btn-plain" to="/admin/ingest">
                수집 현황 열기
                <IconArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI ─────────────────────────────────────── */}
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-k">
            <IconDoc size={13} />
            오늘 수집
          </div>
          <div className="kpi-v">{today.fetched}</div>
          <div className="kpi-s">
            키워드 미달 {today.dropped}건 폐기 ·{' '}
            {Math.round((today.dropped / today.fetched) * 100)}%
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-k">
            <IconInspect size={13} />
            검수 대기
          </div>
          <div className="kpi-v" style={{ color: pending.length ? 'var(--warn)' : undefined }}>
            {pending.length}
          </div>
          <div className="kpi-s">
            신뢰도 {Math.round(admin.rules.minConfidence * 100)}% 미만은 사람이 판단
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-k">
            <IconCheck size={13} />
            공개 리포트
          </div>
          <div className="kpi-v">{REPORTS.length - held}</div>
          <div className="kpi-s">{held > 0 ? `보류 ${held}건` : '전체 공개 중'}</div>
        </div>

        <div className="kpi">
          <div className="kpi-k">
            <IconChat size={13} />
            근거 부착률
          </div>
          <div className="kpi-v" style={{ color: groundRate < 0.8 ? 'var(--warn)' : 'var(--ok)' }}>
            {Math.round(groundRate * 100)}%
          </div>
          <div className="kpi-s">
            최근 {CHAT_LOGS.length}건 중 {CHAT_LOGS.length - grounded}건은 근거 없음
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-k">진단 완료</div>
          <div className="kpi-v">{OPS.diagnosed.toLocaleString('ko-KR')}</div>
          <div className="kpi-s">
            완주율 {Math.round(OPS.completion * 100)}% · 평균 {OPS.avgSeconds}초
          </div>
        </div>
      </div>

      <div className="grid g2">
        {/* ── 파이프라인 퍼널 ──────────────────────── */}
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>오늘의 파이프라인</h3>
              <div className="sub">{today.d} 기준 · 단계마다 얼마가 걸러졌는지</div>
            </div>
          </div>
          <div className="panel-body">
            <div className="funnel">
              {funnel.map((f, i) => (
                <div key={f.label}>
                  <div className="funnel-row">
                    <span className="funnel-label">{f.label}</span>
                    <div className="funnel-track">
                      <div
                        className="funnel-fill"
                        style={{
                          width: `${(f.v / funnel[0].v) * 100}%`,
                          background: f.color,
                        }}
                      />
                    </div>
                    <span className="funnel-num">{f.v}건</span>
                  </div>
                  {i < funnel.length - 1 && (
                    <div className="funnel-drop">
                      ↓ {funnel[i].v - funnel[i + 1].v}건 제외 ·{' '}
                      {i === 0
                        ? '제목·요약에 지정 키워드 없음'
                        : i === 1
                          ? '모델 태깅 신뢰도 미달'
                          : '사람 검수 대기'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="panel-foot">
            수집 100건 중 실제 근거로 쓰이는 건 평균 26건입니다. 버리는 비율이 높은 것이
            정상이며, 이 비율이 갑자기 낮아지면 필터가 헐거워졌다는 신호입니다.
          </div>
        </div>

        {/* ── 성향 분포 ────────────────────────────── */}
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>진단 성향 분포</h3>
              <div className="sub">누적 {OPS.diagnosed.toLocaleString('ko-KR')}건</div>
            </div>
          </div>
          <div className="panel-body">
            {OPS.profileMix.map((p, i) => {
              const max = Math.max(...OPS.profileMix.map((x) => x.v))
              const colors = ['#e2d3ae', '#c6a877', '#a9854a', '#8a6a32', '#5c4420']
              return (
                <div className="funnel-row" key={p.name} style={{ marginBottom: 8 }}>
                  <span className="funnel-label">{p.name}</span>
                  <div className="funnel-track" style={{ height: 22 }}>
                    <div
                      className="funnel-fill"
                      style={{ width: `${(p.v / max) * 100}%`, background: colors[i] }}
                    />
                  </div>
                  <span className="funnel-num">
                    {Math.round((p.v / OPS.diagnosed) * 100)}%
                  </span>
                </div>
              )
            })}
          </div>
          <div className="panel-foot">
            중간 3개 구간에 78%가 몰려 있습니다. 배분표를 손볼 때 영향 범위가 가장 큰 곳입니다.
          </div>
        </div>
      </div>

      {/* ── 문항별 이탈 ──────────────────────────────── */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>설문 이탈 지점</h3>
            <div className="sub">어느 문항에서 창을 닫는가</div>
          </div>
          <Link className="btn btn-sm btn-plain" to="/admin/survey">
            설문 열기
            <IconArrowRight size={14} />
          </Link>
        </div>
        <div className="panel-body">
          <div className="row wrap gap-2" style={{ alignItems: 'flex-end' }}>
            {OPS.dropoff.map((d) => {
              const hot = d.rate >= 0.09
              return (
                <div key={d.q} style={{ flex: '1 1 90px', minWidth: 84 }}>
                  <div
                    style={{
                      height: 74,
                      display: 'flex',
                      alignItems: 'flex-end',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: `${(d.rate / 0.12) * 100}%`,
                        borderRadius: '6px 6px 0 0',
                        background: hot ? 'var(--danger)' : 'var(--a3)',
                        opacity: hot ? 0.85 : 1,
                      }}
                    />
                  </div>
                  <div className="xs strong" style={{ marginTop: 6 }}>
                    {(d.rate * 100).toFixed(0)}%
                  </div>
                  <div className="xs faint keep" style={{ lineHeight: 1.5 }}>
                    {d.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="panel-foot">
          이탈이 가장 큰 곳은 <b>지식 · 경험(11%)</b>과 <b>손실 시나리오(9%)</b>입니다.
          둘 다 답하기 껄끄러운 질문이라, 문구를 부드럽게 하거나 순서를 뒤로 미루는 실험을
          해 볼 자리입니다.
        </div>
      </div>
    </div>
  )
}
