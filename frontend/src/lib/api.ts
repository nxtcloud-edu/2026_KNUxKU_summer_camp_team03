/**
 * 챗 백엔드 클라이언트.
 *
 * 전략: 서버 우선, 실패하면 로컬 chatEngine으로 폴백.
 * 백엔드가 안 떠 있어도(데모 리허설, FE 단독 개발) 화면은 그대로 산다 —
 * "AI가 죽어도 서비스는 안 죽는다"를 FE에서도 지킨다.
 *
 * 세션: 서버가 발급한 session_id를 모듈 변수로 들고 있다가 매 요청에
 * 실어 보낸다 — 이것으로 서버 STM(이전 턴 기억)이 이어진다.
 */

import { answer as localAnswer, type ChatAnswer, type TraceStep } from './chatEngine'
import type { RiskProfile } from './quant'

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:8000'
const TIMEOUT_MS = 15000

let sessionId: string | null = null

interface ServerChatResponse {
  text: string
  evidence: string[]
  notice?: string | null
  trace: TraceStep[]
  session_id: string
  turn_type: string
  used_llm: boolean
}

export async function askChat(
  message: string,
  profile?: RiskProfile,
  mode: 'chat' | 'persona' = 'chat',
): Promise<ChatAnswer> {
  try {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS)

    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        message,
        session_id: sessionId,
        mode,
        profile: profile
          ? {
              capacity: profile.capacity,
              tolerance: profile.tolerance,
              risk: profile.risk,
              literacy_level: 'beginner', // TODO: 온보딩 literacy 축 연결
            }
          : null,
      }),
    })
    window.clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = (await res.json()) as ServerChatResponse
    sessionId = data.session_id

    return {
      text: data.text,
      evidence: data.evidence,
      notice: data.notice ?? undefined,
      trace: [
        ...data.trace,
        {
          agent: 'Supervisor',
          label: '✅ 서버 응답',
          detail: `POST /api/chat · 유형 ${data.turn_type} · LLM ${data.used_llm ? '사용' : '미사용(폴백/0회)'}`,
          ms: 1,
        },
      ],
    }
  } catch (e) {
    // 서버가 없거나 죽었으면 로컬 규칙 매칭으로 — 화면은 멈추지 않는다.
    // 단, 폴백이라는 사실을 트레이스에 크게 남긴다 — "왜 같은 답만 나오지?"의
    // 답은 십중팔구 여기다.
    console.error('[api] ⚠ 챗 서버 연결 실패 → 로컬 목업 폴백. 원인:', e)
    console.error(`[api] 점검: ① 백엔드 실행 중? (${API_BASE}/docs 열리는지) ② 백엔드 터미널에 POST /api/chat 찍히는지`)
    const local = localAnswer(message, profile)
    return {
      ...local,
      notice: local.notice ?? '⚠ 챗 서버에 연결하지 못해 목업 답변을 표시 중입니다',
      trace: [
        {
          agent: 'Supervisor',
          label: '⚠ 로컬 목업 폴백',
          detail: `서버(${API_BASE}) 연결 실패 — ${String(e).slice(0, 80)}`,
          ms: 1,
        },
        ...local.trace,
      ],
    }
  }
}
