/**
 * 첫 진입 온보딩 스테퍼 — 필수 6문항을 한 화면에 하나씩.
 *
 * /onboarding 페이지(전체 폼 + 실시간 계산)는 그대로 두고, 처음 들어온
 * 사람에게는 이 오버레이가 먼저 뜬다. 진단(input)이 저장돼 있으면 아예
 * 그리지 않으므로 기존 사용자는 볼 일이 없다.
 *
 * 원칙은 온보딩 페이지와 같다: 각 문항이 어느 스코어로 흘러가는지 숨기지
 * 않는다("왜 이걸 묻는지"를 감추면 이탈한다). 마지막 단계에서 위험 점수와
 * 기준 비중을 보여 준 뒤에야 저장 버튼을 내민다.
 */
import { useMemo, useState } from 'react'
import { useCopilot } from '../lib/copilot'
import {
  baselineWeights,
  riskProfile,
  type Drop20,
  type Horizon,
  type OnboardingInput,
  type TargetReturn,
} from '../lib/quant'
import AllocBar from './AllocBar'
import { IconArrowRight, IconCheck, IconQuill, IconX } from './icons'

const SKIP_KEY = 'quill.obstepper.skip'
const TOTAL = 6

const won = (n: number) => n.toLocaleString('ko-KR')

export default function OnboardingStepper() {
  const { input, save } = useCopilot()
  const [dismissed, setDismissed] = useState(false)
  const [step, setStep] = useState(0)
  const [v, setV] = useState<OnboardingInput>({
    seedMoney: 10_000_000,
    monthlyInvest: 500_000,
    horizon: 'mid',
    targetReturn: 'inflation',
    drop20: 'hold',
    mddPct: 20,
  })

  const open = !input && !dismissed && sessionStorage.getItem(SKIP_KEY) !== '1'

  const set = <K extends keyof OnboardingInput>(k: K, val: OnboardingInput[K]) =>
    setV((s) => ({ ...s, [k]: val }))

  const profile = useMemo(() => riskProfile(v), [v])
  const weights = useMemo(() => baselineWeights(profile.risk), [profile.risk])

  if (!open) return null

  const skip = () => {
    sessionStorage.setItem(SKIP_KEY, '1')
    setDismissed(true)
  }

  const next = () => setStep((s) => Math.min(s + 1, TOTAL - 1))
  const prev = () => setStep((s) => Math.max(s - 1, 0))

  /** 선택형 문항 — 고르면 잠깐 체크를 보여 주고 다음 문항으로 넘어간다 */
  const pick = <K extends keyof OnboardingInput>(k: K, val: OnboardingInput[K]) => {
    set(k, val)
    if (step < TOTAL - 1) window.setTimeout(next, 220)
  }

  const money = (
    field: 'seedMoney' | 'monthlyInvest',
    step_: number,
  ) => (
    <>
      <div className="ob-money">
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          value={won(v[field])}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^0-9]/g, ''))
            set(field, Number.isFinite(n) ? n : 0)
          }}
          onKeyDown={(e) => e.key === 'Enter' && next()}
          aria-label="금액"
        />
        <span className="ob-won">원</span>
      </div>
      <div className="ob-quick">
        {[step_, step_ * 2, step_ * 5].map((s) => (
          <button key={s} onClick={() => set(field, v[field] + s)}>
            +{won(s)}
          </button>
        ))}
        <button onClick={() => set(field, 0)}>초기화</button>
      </div>
    </>
  )

  const choices = <T extends string>(
    field: 'horizon' | 'targetReturn' | 'drop20',
    options: { v: T; t: string; sub?: string }[],
  ) => (
    <div className="ob-choices">
      {options.map((o) => (
        <button
          key={o.v}
          className={`ob-choice${v[field] === o.v ? ' on' : ''}`}
          onClick={() => pick(field, o.v as OnboardingInput[typeof field])}
        >
          <span className="ob-choice-t">{o.t}</span>
          {o.sub && <span className="ob-choice-s">{o.sub}</span>}
          {v[field] === o.v && (
            <span className="ob-choice-c">
              <IconCheck size={14} />
            </span>
          )}
        </button>
      ))}
    </div>
  )

  /** [질문, 왜 묻는지, 본문] */
  const STEPS: [string, string, React.ReactNode][] = [
    [
      '현재 보유 시드머니는 얼마인가요?',
      '지금 굴릴 수 있는 목돈입니다.',
      money('seedMoney', 1_000_000),
    ],
    [
      '매월 얼마나 더 넣을 수 있나요?',
      '매달 새로 투자할 수 있는 돈입니다.',
      money('monthlyInvest', 100_000),
    ],
    [
      '이 돈, 언제쯤 쓰실 계획인가요?',
      '쓸 날짜가 정해진 돈은 수익률보다 그날 원금이 있느냐가 먼저예요.',
      choices<Horizon>('horizon', [
        { v: 'short', t: '1년 이내' },
        { v: 'mid', t: '1~3년' },
        { v: 'long', t: '3년 이상' },
      ]),
    ],
    [
      '어느 정도 수익이면 만족하시겠어요?',
      '기대가 클수록 감수해야 하는 등락도 커집니다.',
      choices<TargetReturn>('targetReturn', [
        { v: 'deposit', t: '예적금 수준', sub: '연 3~4%' },
        { v: 'inflation', t: '물가 방어', sub: '연 5~7%' },
        { v: 'aggressive', t: '적극적', sub: '연 8% 이상' },
      ]),
    ],
    [
      '원금이 20% 줄었다면 어떻게 하시겠어요?',
      '1,000만 원이 800만 원이 된 상황입니다. 머리가 아니라 손이 어떻게 움직일지요.',
      choices<Drop20>('drop20', [
        { v: 'sell', t: '전량 매도', sub: '더는 못 견딘다' },
        { v: 'hold', t: '홀딩', sub: '기다려 본다' },
        { v: 'buy', t: '추가 매수', sub: '싸졌으니 더 산다' },
      ]),
    ],
    [
      '어디까지 빠져도 팔지 않을 수 있나요?',
      '이 선을 넘는 낙폭이 오면 계획이 아니라 공포가 결정을 내립니다.',
      (
        <>
          <div className="ob-mdd">
            <span className="ob-mdd-v num">-{v.mddPct}%</span>
            <input
              type="range"
              min={5}
              max={40}
              step={1}
              value={v.mddPct}
              onChange={(e) => set('mddPct', Number(e.target.value))}
              aria-label="감내 가능한 최대 낙폭"
            />
          </div>
          <div className="ob-mdd-scale">
            <span>-5%</span>
            <span>-40%</span>
          </div>

          {/* 마지막 문항에서만 결과를 미리 보여 준다 — 저장 전에 납득이 먼저 */}
          <div className="obs-result">
            <div className="obs-score-row">
              <span>
                위험 점수 <b className="num">{profile.risk}</b>
              </span>
              <span className="obs-score-sub num">
                capacity {profile.capacity} · tolerance {profile.tolerance}
              </span>
            </div>
            <AllocBar baseline={weights} compact />
            {profile.gapWarning && (
              <p className="obs-warn">
                감당할 수 있는 것보다 감당하고 싶은 마음이 앞서 있어요. 비상금부터
                확인해 보시길 권합니다.
              </p>
            )}
          </div>
        </>
      ),
    ],
  ]

  const [title, hint, body] = STEPS[step]
  const last = step === TOTAL - 1

  return (
    <div className="welcome-overlay" role="dialog" aria-modal="true" aria-label="온보딩 6문항">
      <div className="obs-card">
        <button className="welcome-close" onClick={skip} aria-label="나중에 하기">
          <IconX size={16} />
        </button>

        <header className="obs-head">
          <IconQuill size={20} style={{ color: 'var(--gold)' }} />
          <span className="obs-count num">
            {step + 1} / {TOTAL}
          </span>
        </header>
        <div className="obs-progress" aria-hidden="true">
          <i style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
        </div>

        {step === 0 && (
          <p className="obs-lead">
            여섯 가지만 여쭙니다. 답은 전부 코드가 계산하고, 에이전트는 이 숫자를
            바꾸지 못해요.
          </p>
        )}

        {/* key=step — 문항이 바뀔 때마다 살짝 밀려 들어오는 전환 */}
        <section className="obs-body" key={step}>
          <h2 className="obs-q">{title}</h2>
          <p className="obs-hint">{hint}</p>
          {body}
        </section>

        <footer className="obs-foot">
          <button className="btn btn-ghost" onClick={skip}>
            나중에 할게요
          </button>
          <div className="obs-nav">
            <button className="btn btn-ghost" onClick={prev} disabled={step === 0}>
              이전
            </button>
            {last ? (
              <button
                className="btn btn-primary"
                onClick={() => {
                  save(v)
                  setDismissed(true)
                }}
              >
                이 조건으로 시작하기
                <IconArrowRight size={15} />
              </button>
            ) : (
              <button className="btn btn-primary" onClick={next}>
                다음
                <IconArrowRight size={15} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
