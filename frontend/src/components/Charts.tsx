/**
 * 차트
 *
 * 자산 배분처럼 부분-전체를 보여 줄 때는 색상환을 돌리지 않고
 * 브라스 명도 사다리 하나로만 그린다. 명도만으로 순서가 읽히므로
 * 색각 이상에서도 구성이 무너지지 않고, 화면 전체 톤도 흐트러지지 않는다.
 * 다른 색상(청)은 벤치마크 한 계열에만 허용한다.
 */
import {
  Area,
  AreaChart,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ASSET_META, ASSET_ORDER, RATE_TREND, type AssetKey } from '../lib/mock'

const axisStyle = {
  fontSize: 11,
  fill: '#a99e8b',
  fontFamily: 'inherit',
}

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#2b241a',
        color: '#f7f1e5',
        padding: '9px 13px',
        borderRadius: 10,
        fontSize: 12.5,
        lineHeight: 1.6,
        boxShadow: '0 6px 20px rgba(40,32,20,.24)',
      }}
    >
      {children}
    </div>
  )
}

/* ── 자산 배분 도넛 ──────────────────────────────────────── */
export function AllocDonut({
  alloc,
  size = 210,
}: {
  alloc: Record<AssetKey, number>
  size?: number
}) {
  const data = ASSET_ORDER.filter((k) => alloc[k] > 0).map((k) => ({
    key: k,
    name: ASSET_META[k].label,
    value: alloc[k],
    color: ASSET_META[k].color,
  }))
  const safe = data.length ? data : [{ key: 'cash', name: '현금성', value: 100, color: '#e2d3ae' }]

  return (
    <div style={{ width: size, height: size, position: 'relative', flex: 'none' }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={safe}
            dataKey="value"
            innerRadius="63%"
            outerRadius="100%"
            paddingAngle={1.5}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive
            animationDuration={800}
          >
            {safe.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TipBox>
                  <b>{payload[0].name}</b> {payload[0].value}%
                </TipBox>
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div className="xs faint">안전자산</div>
          <div
            className="num"
            style={{
              fontSize: 26,
              fontWeight: 680,
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
            }}
          >
            {alloc.cash + alloc.govShort + alloc.govLong + alloc.corp}%
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 국고채 10년 금리 추이 ───────────────────────────────── */
export function RateChart({ height = 190 }: { height?: number }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={RATE_TREND} margin={{ top: 8, right: 6, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id="gradGov" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8a6a32" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#8a6a32" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="m"
            tick={axisStyle}
            axisLine={false}
            tickLine={false}
            dy={6}
          />
          <YAxis
            tick={axisStyle}
            axisLine={false}
            tickLine={false}
            domain={[2, 3.6]}
            ticks={[2, 2.5, 3, 3.5]}
            tickFormatter={(v) => `${v}%`}
            width={46}
          />
          <Tooltip
            cursor={{ stroke: '#ded2bd', strokeWidth: 1 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TipBox>
                  <div style={{ opacity: 0.7, marginBottom: 3 }}>{label}</div>
                  <div>국고채 10년 {payload[0].value}%</div>
                  <div style={{ color: '#9ec9de' }}>기준금리 {payload[1]?.value}%</div>
                </TipBox>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="gov10"
            stroke="#8a6a32"
            strokeWidth={2.2}
            fill="url(#gradGov)"
            dot={false}
            activeDot={{ r: 4, fill: '#8a6a32', stroke: '#fff', strokeWidth: 2 }}
            animationDuration={900}
          />
          <Line
            type="stepAfter"
            dataKey="base"
            stroke="#2c6e8f"
            strokeWidth={1.6}
            strokeDasharray="4 4"
            dot={false}
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ── 5축 진단 막대 ───────────────────────────────────────── */
export function AxisBars({
  axes,
}: {
  axes: { key: string; label: string; value: number }[]
}) {
  return (
    <div className="col gap-4">
      {axes.map((a, i) => (
        <div key={a.key}>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <span className="small strong">{a.label}</span>
            <span className="num small muted">{a.value}</span>
          </div>
          <div className="bar">
            <i
              style={{
                width: `${a.value}%`,
                transitionDelay: `${i * 90}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
