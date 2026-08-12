/**
 * 세션 관리
 *
 * 인증이 꺼져 있으면(키 없음) 항상 "로그인 불필요" 상태를 돌려준다.
 * 화면 쪽에서 authEnabled를 매번 확인하지 않아도 되도록 여기서 흡수한다.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { authEnabled, supabase } from './supabase'

interface Ctx {
  /** 인증 기능 자체가 켜져 있는가 */
  enabled: boolean
  /** 첫 세션 조회가 끝났는가. 이게 false인 동안은 화면을 막아 둔다 */
  ready: boolean
  session: Session | null
  user: User | null
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<string | null>
}

const AuthCtx = createContext<Ctx | null>(null)

/** Supabase가 돌려주는 영어 오류를 화면에 쓸 말로 바꾼다 */
function toKorean(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return '이메일이나 비밀번호가 맞지 않습니다.'
  if (m.includes('email not confirmed'))
    return '아직 이메일 확인이 끝나지 않았습니다. 받은 편지함을 확인해 주세요.'
  if (m.includes('user already registered')) return '이미 가입된 이메일입니다.'
  if (m.includes('password should be at least'))
    return '비밀번호가 너무 짧습니다. 8자 이상으로 정해 주세요.'
  if (m.includes('rate limit') || m.includes('too many'))
    return '시도가 너무 잦습니다. 잠시 뒤에 다시 해 주세요.'
  if (m.includes('unable to validate email')) return '이메일 형식이 올바르지 않습니다.'
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!authEnabled)

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })

    // 다른 탭에서 로그아웃해도 따라온다
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return '인증이 설정되지 않았습니다.'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? toKorean(error.message) : null
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return '인증이 설정되지 않았습니다.'
    const { error } = await supabase.auth.signUp({ email, password })
    return error ? toKorean(error.message) : null
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return '인증이 설정되지 않았습니다.'
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    return error ? toKorean(error.message) : null
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      enabled: authEnabled,
      ready,
      session,
      user: session?.user ?? null,
      signIn,
      signUp,
      signOut,
      resetPassword,
    }),
    [ready, session, signIn, signUp, signOut, resetPassword],
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const v = useContext(AuthCtx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}

/** 비밀번호 강도 — 화면과 가입 처리가 같은 규칙을 쓰도록 여기서만 정의한다 */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return '8자 이상이어야 합니다.'
  if (!/[a-zA-Z]/.test(pw)) return '영문자를 최소 하나 넣어 주세요.'
  if (!/[0-9]/.test(pw)) return '숫자를 최소 하나 넣어 주세요.'
  // 흔한 비밀번호는 길이 규칙을 통과해도 막는다
  if (/^(password|12345678|qwerty|11111111)/i.test(pw)) return '너무 흔한 비밀번호입니다.'
  return null
}
