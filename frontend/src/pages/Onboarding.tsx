/**
 * 온보딩 — 설계문서 01장의 수집 항목 그대로.
 *
 * 필수 6문항 + 선택 2문항(Capacity 정밀화용). 각 항목이 어느 스코어로
 * 흘러가는지 화면에 표시한다. "왜 이걸 묻는지"를 감추면 이탈한다.
 *
 * 답을 채울 때마다 오른쪽 점수와 기준 비중이 즉시 다시 계산된다.
 * 1~2단계는 순수 연산이라 밀리초 단위로 끝나므로 기다릴 이유가 없다.
 *
 * 화면은 두 가지 모드로 돈다.
 *   wizard  처음 오는 사람 — 한 문항씩, 설문받는 느낌으로 넘겨 간다
 *   free    이미 답해 본 사람(또는 wizard를 다 지나온 직후) — 6문항이
 *           전부 펼쳐진 채로 자유롭게 토글해 고친다
 * 두 모드 다 같은 필드 컴포넌트(MoneyField/ChoiceField/MddField)를 그대로
 * 재사용한다 — 문항 자체가 다른 게 아니라 한 번에 몇 개를 보여 주느냐만 다르다.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCopilot } from '../lib/copilot'
import {
  baselineWeights,
  riskProfile,
  type Drop20,
  type Horizon,
  type OnboardingInput,
  type TargetReturn,
} from '../lib/quant'
import AllocBar from '../components/AllocBar'
import { IconArrowLeft, IconArrowRight, IconCheck } from '../components/icons'

const won = (n: number) => n.toLocaleString('ko-KR')

/** 금액 입력 — 원 단위 직접 입력이지만 자릿수를 눈으로 확인시켜 준다 */
function MoneyField({
  label,
  hint,
  maps,
  value,
  onChange,
  step,
  optional,
}: {
  label: string
  hint: string
  maps: string
  value: number
  onChange: (v: number) => void
  step: number
  optional?: boolean
}) {
  return (
    <div className={`ob-item${optional ? ' addon' : ''}`}>
      <div className="ob-q">
        {label}
        {optional && <span className="ob-optional-tag">선택</span>}
      </div>
      <div className="ob-hint">{hint}</div>
      <div className="ob-money">
        <input
          type="text"
          inputMode="numeric"
          value={won(value)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^0-9]/g, ''))
            onChange(Number.isFinite(n) ? n : 0)
          }}
          aria-label={label}
        />
        <span className="ob-won">원</span>
      </div>
      <div className="ob-quick">
        {[step, step * 2, step * 5].map((s) => (
          <button key={s} onClick={() => onChange(value + s)}>
            +{won(s)}
          </button>
        ))}
        <button onClick={() => onChange(0)}>초기화</button>
      </div>
      <span className="ob-maps">{maps}</span>
    </div>
  )
}

function ChoiceField<T extends string>({
  label,
  hint,
  maps,
  value,
  options,
  onChange,
}: {
  label: string
  hint: string
  maps: string
  value: T
  options: { v: T; t: string; sub?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="ob-item">
      <div className="ob-q">{label}</div>
      <div className="ob-hint">{hint}</div>
      <div className="ob-choices">
        {options.map((o) => (
          <button
            key={o.v}
            className={`ob-choice${value === o.v ? ' on' : ''}`}
            onClick={() => onChange(o.v)}
          >
            <span className="ob-choice-t">{o.t}</span>
            {o.sub && <span className="ob-choice-s">{o.sub}</span>}
            {/* 아이콘 컴포넌트가 className을 받지 않아 감싸서 위치를 잡는다 */}
            {value === o.v && (
              <span className="ob-choice-c">
                <IconCheck size={14} />
              </span>
            )}
          </button>
        ))}
      </div>
      <span className="ob-maps">{maps}</span>
    </div>
  )
}

/** 감내 낙폭 — 슬라이더. 손을 움직이는 즉시 오른쪽 숫자가 따라 움직인다 */
function MddField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="ob-item">
      <div className="ob-q">감내 가능한 최대 낙폭</div>
      <div className="ob-hint">여기까지 빠져도 팔지 않을 수 있는 선</div>
      <div className="ob-mdd">
        <span className="ob-mdd-v num">-{value}%</span>
        <input
          type="range"
          min={5}
          max={40}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="감내 가능한 최대 낙폭"
        />
      </div>
      <div className="ob-mdd-scale">
        <span>-5%</span>
        <span>-40%</span>
      </div>
      <span className="ob-maps">Tolerance</span>
    </div>
  )
}

export default function Onboarding() {
  const nav = useNavigate()
  const { input, save } = useCopilot()

  const [v, setV] = useState<OnboardingInput>(
    input ?? {
      seedMoney: 10_000_000,
      monthlyInvest: 500_000,
      horizon: 'mid',
      targetReturn: 'inflation',
      drop20: 'hold',
      mddPct: 20,
    },
  )

  /* ── 모드 ──────────────────────────────────────────────
     이미 답해 본 적 있는 사람(input 있음)은 처음부터 자유 모드.
     처음 오는 사람만 한 문항씩 받는 설문 모드로 시작한다. */
  const [mode, setMode] = useState<'wizard' | 'free'>(input ? 'free' : 'wizard')
  const [step, setStep] = useState(0)

  const set = <K extends keyof OnboardingInput>(k: K, val: OnboardingInput[K]) =>
    setV((s) => ({ ...s, [k]: val }))

  // 순수 연산이라 입력할 때마다 다시 돌려도 부담이 없다
  const profile = useMemo(() => riskProfile(v), [v])
  const weights = useMemo(() => baselineWeights(profile.risk), [profile.risk])

  const submit = () => {
    save(v)
    nav('/portfolio')
  }

  /* 필수 6문항 — wizard는 이 중 하나만, free는 전부 펼쳐서 보여 준다 */
  const steps = [
    <MoneyField
      key="seed"
      label="현재 보유 시드머니"
      hint="지금 굴릴 수 있는 목돈"
      maps="2단계 배분 기준액"
      value={v.seedMoney}
      step={1_000_000}
      onChange={(n) => set('seedMoney', n)}
    />,
    <MoneyField
      key="monthly"
      label="매월 투자 가능 금액"
      hint="매달 새로 넣을 수 있는 돈"
      maps="Capacity · 저축 여력"
      value={v.monthlyInvest}
      step={100_000}
      onChange={(n) => set('monthlyInvest', n)}
    />,
    <ChoiceField<Horizon>
      key="horizon"
      label="투자 기간"
      hint="이 돈을 언제 쓸 계획인가요"
      maps="Capacity · 운용 기간"
      value={v.horizon}
      onChange={(x) => set('horizon', x)}
      options={[
        { v: 'short', t: '1년 이내' },
        { v: 'mid', t: '1~3년' },
        { v: 'long', t: '3년 이상' },
      ]}
    />,
    <ChoiceField<TargetReturn>
      key="target"
      label="목표 수익률"
      hint="어느 정도면 만족하시겠어요"
      maps="Tolerance"
      value={v.targetReturn}
      onChange={(x) => set('targetReturn', x)}
      options={[
        { v: 'deposit', t: '예적금 수준', sub: '연 3~4%' },
        { v: 'inflation', t: '물가 방어', sub: '연 5~7%' },
        { v: 'aggressive', t: '적극적', sub: '연 8% 이상' },
      ]}
    />,
    <ChoiceField<Drop20>
      key="drop20"
      label="원금이 20% 줄었다면"
      hint="1,000만 원이 800만 원이 된 상황입니다"
      maps="Tolerance"
      value={v.drop20}
      onChange={(x) => set('drop20', x)}
      options={[
        { v: 'sell', t: '전량 매도', sub: '더는 못 견딘다' },
        { v: 'hold', t: '홀딩', sub: '기다려 본다' },
        { v: 'buy', t: '추가 매수', sub: '싸졌으니 더 산다' },
      ]}
    />,
    <MddField key="mdd" value={v.mddPct} onChange={(n) => set('mddPct', n)} />,
  ]

  {/* 선택 항목 2개 — 눌러야만 보이던 걸 없앴다. 굳이 숨길 이유가 없고,
      숨기니까 있는 줄도 모르고 지나쳤다. "선택" 태그만 붙여서 필수가
      아니라는 것만 알리고, 처음부터 같이 펼쳐 둔다. */}
  const optionalFields = [
    <div className="ob-item addon" key="age">
      <div className="ob-q">
        나이대
        <span className="ob-optional-tag">선택</span>
      </div>
      <div className="ob-hint">Capacity 정밀화용</div>
      <div className="ob-choices">
        {/* 계산에는 각 구간 대표값(25/35/45/55)을 그대로 쓴다 — 라벨만
            통상적인 "20대·30대·40대·50대+" 표기로 바로잡는다.
            저장되는 값은 그대로라 계산식·서버 연동에 영향 없다. */}
        {(
          [
            [25, '20대'],
            [35, '30대'],
            [45, '40대'],
            [55, '50대+'],
          ] as const
        ).map(([a, label]) => (
          <button
            key={a}
            className={`ob-choice${v.age === a ? ' on' : ''}`}
            onClick={() => set('age', v.age === a ? undefined : a)}
          >
            <span className="ob-choice-t">{label}</span>
          </button>
        ))}
      </div>
      <span className="ob-maps">Capacity</span>
    </div>,

    <MoneyField
      key="income"
      label="월 소득"
      hint="저축률 계산용 · 미입력 시 월투자액÷시드머니로 대체합니다"
      maps="Capacity"
      value={v.monthlyIncome ?? 0}
      step={500_000}
      onChange={(n) => set('monthlyIncome', n || undefined)}
      optional
    />,
  ]

  return (
    <div className="ob-shell">
      <div className="ob-form">
        {mode === 'wizard' ? (
          <>
            <span className="eyebrow">
              <span className="rule-gold" />
              온보딩 · 6문항
            </span>
            <h1 className="ob-title">
              숫자를 먼저 여쭙니다.
              <br />
              <span className="muted">기분이 아니라 사정에 맞춰야 하니까요.</span>
            </h1>
            <p className="ob-lead">
              여기서 받은 답은 전부 코드가 계산합니다. 에이전트는 이 숫자를 바꾸지
              못하고, 근거를 들고 조정을 제안할 수만 있어요.
            </p>

            <div className="ob-progress">
              <div className="ob-progress-bar">
                <i style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
              </div>
              <span className="ob-progress-t num">
                {step + 1} / {steps.length}
              </span>
            </div>

            <div className="ob-wizard">{steps[step]}</div>

            <div className="ob-step-nav">
              <button
                className="btn btn-ghost"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                <IconArrowLeft size={15} />
                이전
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (step < steps.length - 1) setStep((s) => s + 1)
                  else setMode('free')
                }}
              >
                {step < steps.length - 1 ? '다음' : '답 다 됐어요 — 확인하기'}
                <IconArrowRight size={15} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="page-head">
              <h1 className="page-title">내 조건 맞추기</h1>
              <p className="page-lead">
                아무 항목이나 눌러 바로 고치세요. 오른쪽 점수·비중이 즉시 다시
                계산됩니다.
              </p>
            </div>

            <div className="ob-grid">
              {steps}
              {optionalFields}
            </div>
          </>
        )}
      </div>

      {/* ── 오른쪽 · 실시간 계산 결과 ─────────────────────── */}
      <aside className="ob-live">
        <div className="ob-live-inner">
          <span className="eyebrow">
            <span className="rule-gold" />
            1~2단계 · 즉시 계산
          </span>

          <div className="ob-scores">
            <ScoreRow label="Capacity" sub="객관적 수용력" v={profile.capacity} />
            <ScoreRow label="Tolerance" sub="주관적 선호도" v={profile.tolerance} />
            <div className="ob-formula">capacity × 0.4 + tolerance × 0.6</div>
            <ScoreRow label="위험 점수" sub="risk_score" v={profile.risk} strong />
          </div>

          {profile.gapWarning && (
            <div className="ob-warn">
              감당할 수 있는 것보다 감당하고 싶은 마음이 앞서 있어요. 이 구간에서
              중도 이탈이 가장 많이 나옵니다. 비상금부터 확인해 보시길 권합니다.
            </div>
          )}

          <div className="ob-alloc">
            <AllocBar baseline={weights} compact />
            <p className="xs faint keep mt-3" style={{ lineHeight: 1.75 }}>
              비상금 명목으로 현금성 {weights.cash}%를 먼저 뗀 뒤, 남은 {100 - weights.cash}%를
              위험 점수에 비례해 나눈 값입니다.
            </p>
          </div>

          {mode === 'free' && (
            <>
              <button className="btn btn-primary btn-block mt-6" onClick={submit}>
                이 조건으로 시작하기
                <IconArrowRight size={16} />
              </button>
              <p className="xs faint keep mt-3" style={{ lineHeight: 1.7 }}>
                이 브라우저에만 저장됩니다. 로그인은 없습니다.
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function ScoreRow({
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
    <div className={`ob-score${strong ? ' strong-row' : ''}`}>
      <div className="row-between">
        <span className="ob-score-l">
          {label}
          <span className="ob-score-s">{sub}</span>
        </span>
        <span className="ob-score-v num">{v}</span>
      </div>
      <div className="ob-score-bar">
        <i style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}
