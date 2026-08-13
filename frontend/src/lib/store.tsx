/**
 * 진단 상태 보관소
 *
 * 서버가 붙기 전까지는 localStorage 한 곳에만 둔다.
 * 로그인(OAuth)은 다음 단계이므로 지금은 브라우저 하나 = 사용자 하나로 본다.
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
import { diagnose, type Answers, type Diagnosis } from './survey'

const KEY = 'quill.answers.v1'

interface Ctx {
  answers: Answers
  /** 문항 하나 응답 */
  answer: (qid: string, choice: number) => void
  reset: () => void
  /** 모든 문항에 답했을 때만 값이 있다 */
  diagnosis: Diagnosis | null
  /** 답한 문항 수 */
  answered: number
}

const ProfileCtx = createContext<Ctx>({
  answers: {},
  answer: () => {},
  reset: () => {},
  diagnosis: null,
  answered: 0,
})

export const useProfile = () => useContext(ProfileCtx)

function load(): Answers {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Answers) : {}
  } catch {
    return {}
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [answers, setAnswers] = useState<Answers>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(answers))
    } catch {
      /* 사파리 프라이빗 모드 등 — 저장 실패해도 화면은 그대로 돈다 */
    }
  }, [answers])

  const answer = useCallback((qid: string, choice: number) => {
    setAnswers((prev) => ({ ...prev, [qid]: choice }))
  }, [])

  const reset = useCallback(() => setAnswers({}), [])

  const value = useMemo<Ctx>(() => {
    const answered = Object.keys(answers).length
    return {
      answers,
      answer,
      reset,
      answered,
      diagnosis: answered >= 8 ? diagnose(answers) : null,
    }
  }, [answers, answer, reset])

  return <ProfileCtx.Provider value={value}>{children}</ProfileCtx.Provider>
}
