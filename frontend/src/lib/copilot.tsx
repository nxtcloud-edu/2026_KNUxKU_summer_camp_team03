/**
 * 온보딩 응답 보관소
 *
 * 서버가 없으므로 localStorage에 둔다. 설계문서의 user_profiles 테이블과
 * 필드 이름을 맞춰 놨다. DB가 붙으면 이 훅의 내부만 API 호출로 바꾼다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { riskProfile, type OnboardingInput, type RiskProfile } from './quant'

const KEY = 'quill.onboarding.v2'

interface Ctx {
  input: OnboardingInput | null
  profile: RiskProfile | null
  save: (v: OnboardingInput) => void
  /** 슬라이더로 위험 점수만 직접 덮어쓸 때 쓴다 (Tolerance 재계산 대신 직접 지정) */
  override: number | null
  setOverride: (v: number | null) => void
  /** 실제로 화면이 쓰는 위험 점수 — 덮어쓴 값이 있으면 그쪽이 이긴다 */
  effectiveRisk: number | null
  reset: () => void
}

const CopilotCtx = createContext<Ctx | null>(null)

function load(): OnboardingInput | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as OnboardingInput) : null
  } catch {
    return null
  }
}

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [input, setInput] = useState<OnboardingInput | null>(() => load())
  const [override, setOverride] = useState<number | null>(null)

  useEffect(() => {
    if (input) localStorage.setItem(KEY, JSON.stringify(input))
  }, [input])

  const save = useCallback((v: OnboardingInput) => {
    setInput(v)
    setOverride(null)
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(KEY)
    setInput(null)
    setOverride(null)
  }, [])

  const profile = useMemo(() => (input ? riskProfile(input) : null), [input])

  const effectiveRisk = useMemo(() => {
    if (override !== null) return override
    return profile ? profile.risk : null
  }, [override, profile])

  const value = useMemo<Ctx>(
    () => ({ input, profile, save, override, setOverride, effectiveRisk, reset }),
    [input, profile, save, override, effectiveRisk, reset],
  )

  return <CopilotCtx.Provider value={value}>{children}</CopilotCtx.Provider>
}

export function useCopilot() {
  const v = useContext(CopilotCtx)
  if (!v) throw new Error('useCopilot must be used inside CopilotProvider')
  return v
}
