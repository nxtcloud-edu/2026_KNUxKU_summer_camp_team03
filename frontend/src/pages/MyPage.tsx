/**
 * 마이페이지 — 로그인한 고객이 들어오는 자리
 *
 * 로그인은 대화 기록을 불러오는 장치가 아니라, "내 것"이 모이는 자리를 만드는 일이다.
 * 여기서 한 화면에 모은다.
 *   내 성향 점수 / 내 배분 / 저장된 대화 / 알림 / 내 데이터 통제
 *
 * 마지막 항목이 중요하다. 개인 자산 정보를 맡기는 서비스라면 "내가 준 것을 내가
 * 지울 수 있는" 자리가 반드시 보여야 한다. 찾기 어려운 곳에 숨기지 않는다.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useCopilot } from '../lib/copilot'
import {
  ALLOCATION_PARAMS,
  applyAdjustments,
  baselineWeights,
  type Adjustment,
} from '../lib/quant'
import { idsByTag, NOTIFICATIONS, reportById } from '../lib/mock'
import { loadConversations, unlockVault, vaultExists, type Conversation } from '../lib/vault'
import AllocBar from '../components/AllocBar'
import { IconArrowRight, IconBell, IconBook, IconShield } from '../components/icons'

const won = (n: number) => n.toLocaleString('ko-KR')

const HORIZON: Record<string, string> = {
  short: '1년 이내',
  mid: '1~3년',
  long: '3년 이상',
}
const TARGET: Record<string, string> = {
  deposit: '예적금 수준 (연 3~4%)',
  inflation: '물가 방어 (연 5~7%)',
  aggressive: '적극적 (연 8% 이상)',
}
const DROP20: Record<string, string> = {
  sell: '전량 매도',
  hold: '홀딩',
  buy: '추가 매수',
}

/** 오늘의 델타 제안 — 실제로는 Recommendation 에이전트가 만든다 */
const PROPOSALS: Adjustment[] = [
  {
    asset: 'etf',
    delta_pp: -6,
    evidence_report_id: idsByTag('채권-장기-국채', 1)[0],
    reason: '금리 인하 사이클 진입',
  },
  {
    asset: 'bond',
    delta_pp: 6,
    evidence_report_id: idsByTag('채권-장기-국채', 1)[0],
    reason: '듀레이션 확대 구간',
  },
]

export default function MyPage() {
  const { enabled, user, signOut } = useAuth()
  const { input, profile, effectiveRisk, reset } = useCopilot()
  const nav = useNavigate()

  /* ── 저장된 대화 ── */
  const [convos, setConvos] = useState<Conversation[] | null>(null)
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState<string | null>(null)
  const hasVault = vaultExists()

  const openVault = async () => {
    setPinErr(null)
    const key = await unlockVault(pin)
    if (!key) {
      setPinErr('확인 키가 맞지 않습니다.')
      return
    }
    setConvos(await loadConversations(key))
    setPin('')
  }

  const [wiped, setWiped] = useState(false)
  useEffect(() => {
    if (!wiped) return
    const t = window.setTimeout(() => setWiped(false), 2600)
    return () => clearTimeout(t)
  }, [wiped])

  const risk = effectiveRisk
  const baseline = risk !== null ? baselineWeights(risk) : null
  const alloc = baseline ? applyAdjustments(baseline, PROPOSALS) : null
  const unread = NOTIFICATIONS.filter((n) => !n.read)

  return (
    <div className="my-shell">
      {/* ── 머리 ─────────────────────────────────── */}
      <header className="page-head">
        <h1 className="page-title">
          {user?.email ? `${user.email.split('@')[0]}님` : '마이페이지'}
        </h1>
        <p className="page-lead">내 성향 점수·배분·저장한 대화가 여기 모여 있습니다.</p>

        {!enabled && (
          <div className="my-notice">
            <IconShield size={15} />
            <span>
              로그인이 아직 설정되지 않아 <b>이 브라우저에 저장된 내용</b>만 보여 드립니다.
              계정에 묶으려면 Supabase 키를 넣어야 합니다.
            </span>
          </div>
        )}
      </header>

      <div className="my-grid">
        {/* ── 왼쪽 ─────────────────────────────── */}
        <div className="my-col">
          {/* 내 성향 */}
          <section className="my-card">
            <div className="row-between">
              <h2 className="my-h">내 투자 성향</h2>
              <Link className="my-more" to="/onboarding">
                다시 진단
                <IconArrowRight size={13} />
              </Link>
            </div>

            {profile && input ? (
              <>
                <div className="my-scores">
                  <Score label="Capacity" sub="객관적 수용력" v={profile.capacity} />
                  <Score label="Tolerance" sub="주관적 선호도" v={profile.tolerance} />
                  <Score label="위험 점수" sub="risk_score" v={risk ?? profile.risk} strong />
                </div>

                {profile.gapWarning && (
                  <div className="my-warn">
                    감당할 수 있는 것보다 감당하고 싶은 마음이 앞서 있습니다. 이 구간에서
                    중도 이탈이 가장 많이 나옵니다.
                  </div>
                )}

                <dl className="my-facts">
                  <Fact k="시드머니" v={`${won(input.seedMoney)}원`} />
                  <Fact k="매월 투자" v={`${won(input.monthlyInvest)}원`} />
                  <Fact k="투자 기간" v={HORIZON[input.horizon]} />
                  <Fact k="목표 수익률" v={TARGET[input.targetReturn]} />
                  <Fact k="-20% 시 반응" v={DROP20[input.drop20]} />
                  <Fact k="감내 낙폭" v={`-${input.mddPct}%`} />
                </dl>
              </>
            ) : (
              <Empty
                text="아직 진단하지 않으셨습니다. 6개 질문이면 끝납니다."
                to="/onboarding"
                cta="성향 진단 시작"
              />
            )}
          </section>

          {/* 내 배분 */}
          <section className="my-card">
            <div className="row-between">
              <h2 className="my-h">내 배분</h2>
              {alloc && (
                <Link className="my-more" to="/portfolio">
                  자세히
                  <IconArrowRight size={13} />
                </Link>
              )}
            </div>

            {alloc ? (
              <>
                <AllocBar
                  baseline={alloc.baseline}
                  adjusted={alloc.adjusted}
                  rejected={alloc.rejected.length}
                />
                <p className="my-note">
                  조정 폭은 ±{ALLOCATION_PARAMS.adjust_cap_pp}%p 안으로 제한되고, 현금성은{' '}
                  {ALLOCATION_PARAMS.cash_floor}% 아래로 내려가지 않습니다. 표시된 비중은
                  예시이며 투자 권유가 아닙니다.
                </p>
              </>
            ) : (
              <Empty
                text="진단을 마치면 기준 비중이 여기 표시됩니다."
                to="/onboarding"
                cta="진단하러 가기"
              />
            )}
          </section>
        </div>

        {/* ── 오른쪽 ───────────────────────────── */}
        <div className="my-col">
          {/* 알림 */}
          <section className="my-card">
            <div className="row-between">
              <h2 className="my-h">
                알림
                {unread.length > 0 && <span className="my-count">{unread.length}</span>}
              </h2>
              <IconBell size={16} style={{ color: 'var(--ink-4)' }} />
            </div>

            <div className="my-notis">
              {NOTIFICATIONS.slice(0, 3).map((n) => {
                const r = reportById(n.evidenceReportId)
                return (
                  <div className={`my-noti${n.read ? ' read' : ''}`} key={n.id}>
                    <div className="my-noti-t">{n.title}</div>
                    {r && (
                      <Link className="my-noti-src" to={`/library/${r.id}`}>
                        {r.house} 「{r.title}」
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="my-note">모든 알림에는 근거 리포트가 붙습니다.</p>
          </section>

          {/* 저장된 대화 */}
          <section className="my-card">
            <div className="row-between">
              <h2 className="my-h">저장된 대화</h2>
              <IconBook size={16} style={{ color: 'var(--ink-4)' }} />
            </div>

            {!hasVault ? (
              <Empty
                text="확인 키를 만들지 않으셔서 대화가 저장되지 않고 있습니다. 대화 화면 왼쪽에서 만들 수 있어요."
                to="/"
                cta="대화로 가기"
              />
            ) : convos === null ? (
              <div className="my-unlock">
                <p className="small muted keep">
                  대화는 확인 키로 암호화돼 있습니다. 키를 넣으면 목록이 열립니다.
                </p>
                <div className="row gap-2 mt-3">
                  <input
                    className="vault-input"
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    placeholder="••••"
                    onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                    onKeyDown={(e) => e.key === 'Enter' && openVault()}
                    aria-label="확인 키"
                  />
                  <button className="btn btn-primary" disabled={pin.length < 4} onClick={openVault}>
                    열기
                  </button>
                </div>
                {pinErr && <p className="auth-err mt-2">{pinErr}</p>}
              </div>
            ) : convos.length === 0 ? (
              <Empty text="저장된 대화가 아직 없습니다." to="/" cta="대화 시작" />
            ) : (
              <div className="my-convos">
                {convos.map((c) => (
                  <Link className="my-convo" key={c.id} to="/">
                    <span className="truncate">{c.title}</span>
                    <span className="my-convo-d">{c.at.slice(5, 10).replace('-', '/')}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 내 데이터 — 통제권 */}
          <section className="my-card my-danger">
            <h2 className="my-h">내 데이터</h2>
            <p className="my-note" style={{ marginTop: 6 }}>
              진단 답변과 대화는 지금 이 브라우저에만 있습니다. 서버로 나가지 않습니다.
              언제든 지우실 수 있고, 지우면 되돌릴 수 없습니다.
            </p>

            <div className="row wrap gap-2 mt-4">
              <button
                className="btn btn-plain btn-sm"
                onClick={() => {
                  reset()
                  setWiped(true)
                }}
              >
                진단 결과 지우기
              </button>

              {enabled && user && (
                <button
                  className="btn btn-plain btn-sm"
                  onClick={async () => {
                    await signOut()
                    nav('/', { replace: true })
                  }}
                >
                  로그아웃
                </button>
              )}
            </div>

            {wiped && <p className="my-wiped">지웠습니다.</p>}
          </section>
        </div>
      </div>
    </div>
  )
}

/* ── 조각들 ─────────────────────────────────────────────── */

function Score({
  label,
  sub,
  v,
  strong,
}: {
  label: string
  sub: string
  v: number
  strong?: boolean
}) {
  return (
    <div className={`my-score${strong ? ' strong-row' : ''}`}>
      <div className="ob-score-v num">{v}</div>
      <div className="my-score-l">{label}</div>
      <div className="my-score-s">{sub}</div>
    </div>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  )
}

function Empty({ text, to, cta }: { text: string; to: string; cta: string }) {
  return (
    <div className="my-empty">
      <p className="small muted keep">{text}</p>
      <Link className="btn btn-soft btn-sm mt-4" to={to}>
        {cta}
        <IconArrowRight size={14} />
      </Link>
    </div>
  )
}
