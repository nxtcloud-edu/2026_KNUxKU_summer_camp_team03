import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { INGEST_DAYS, JOBS } from '../lib/adminMock'
import { useToast } from '../components/ui'
import { IconAlert, IconCheck, IconClock } from '../components/icons'

const STATUS: Record<
  string,
  { cls: string; label: string; icon: typeof IconCheck }
> = {
  ok: { cls: 'st-ok', label: '정상', icon: IconCheck },
  warn: { cls: 'st-warn', label: '지연', icon: IconClock },
  fail: { cls: 'st-fail', label: '실패', icon: IconAlert },
}

export default function AdminIngest() {
  const toast = useToast()

  const total = INGEST_DAYS.reduce(
    (s, d) => ({
      fetched: s.fetched + d.fetched,
      dropped: s.dropped + d.dropped,
      tagged: s.tagged + d.tagged,
    }),
    { fetched: 0, dropped: 0, tagged: 0 }
  )

  return (
    <div className="col gap-4">
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-k">최근 10영업일 수집</div>
          <div className="kpi-v">{total.fetched}</div>
          <div className="kpi-s">일평균 {Math.round(total.fetched / INGEST_DAYS.length)}건</div>
        </div>
        <div className="kpi">
          <div className="kpi-k">1차 필터 폐기율</div>
          <div className="kpi-v">{Math.round((total.dropped / total.fetched) * 100)}%</div>
          <div className="kpi-s">{total.dropped}건 · 지정 키워드 미포함</div>
        </div>
        <div className="kpi">
          <div className="kpi-k">태깅 완료</div>
          <div className="kpi-v">{total.tagged}</div>
          <div className="kpi-s">
            수집 대비 {Math.round((total.tagged / total.fetched) * 100)}%
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-k">잡 상태</div>
          <div className="kpi-v">
            {JOBS.filter((j) => j.status === 'ok').length}
            <span style={{ fontSize: 16, color: 'var(--ink-4)' }}> / {JOBS.length}</span>
          </div>
          <div className="kpi-s">
            지연 {JOBS.filter((j) => j.status === 'warn').length} · 실패{' '}
            {JOBS.filter((j) => j.status === 'fail').length}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>일자별 수집 실적</h3>
            <div className="sub">폐기가 대부분인 것이 정상입니다</div>
          </div>
        </div>
        <div className="panel-body">
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={INGEST_DAYS} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#f1ebde" vertical={false} />
                <XAxis
                  dataKey="d"
                  tick={{ fontSize: 11, fill: '#a99e8b' }}
                  axisLine={false}
                  tickLine={false}
                  dy={6}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#a99e8b' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(138,106,50,.05)' }}
                  contentStyle={{
                    background: '#2b241a',
                    border: 0,
                    borderRadius: 10,
                    fontSize: 12.5,
                    color: '#f7f1e5',
                  }}
                  labelStyle={{ color: '#d9be7e' }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar dataKey="dropped" name="폐기" stackId="a" fill="#e2d3ae" radius={[0, 0, 0, 0]} />
                <Bar dataKey="held" name="검수 대기" stackId="a" fill="#c6a877" />
                <Bar dataKey="tagged" name="태깅 완료" stackId="a" fill="#8a6a32" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>수집 잡</h3>
            <div className="sub">소스별 크롤러 · 매일 아침 순차 실행</div>
          </div>
          <button
            className="btn btn-sm btn-plain"
            onClick={() => toast('데모 화면이라 실제로 실행되지는 않습니다')}
          >
            전체 재실행
          </button>
        </div>
        <div className="panel-body">
          <div className="table-wrap">
            <table className="table adm-table">
              <thead>
                <tr>
                  <th>소스</th>
                  <th>주기</th>
                  <th>최근 실행</th>
                  <th className="num-cell">수집</th>
                  <th className="num-cell">폐기</th>
                  <th className="num-cell">소요</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {JOBS.map((j) => {
                  const s = STATUS[j.status]
                  const Icon = s.icon
                  return (
                    <tr key={j.id}>
                      <td>
                        <div className="strong">{j.source}</div>
                        {j.note && (
                          <div className="xs" style={{ color: 'var(--ink-4)', marginTop: 2 }}>
                            {j.note}
                          </div>
                        )}
                      </td>
                      <td className="muted">{j.schedule}</td>
                      <td className="muted mono">{j.lastRun}</td>
                      <td className="num-cell strong">{j.fetched}</td>
                      <td className="num-cell muted">{j.dropped}</td>
                      <td className="num-cell muted">{(j.ms / 1000).toFixed(1)}s</td>
                      <td>
                        <span className={`st ${s.cls}`}>
                          <Icon size={13} />
                          {s.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => toast(`${j.source} — 데모 화면입니다`)}
                        >
                          재실행
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel-foot">
          실패한 잡은 다음 주기에 자동 재시도하지 않습니다. 셀렉터가 깨진 경우가 대부분이라
          사람이 확인하는 편이 안전합니다.
        </div>
      </div>
    </div>
  )
}
