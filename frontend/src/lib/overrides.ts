/**
 * 관리자 설정 오버레이
 *
 * 관리자 콘솔에서 바꾼 값을 고객 화면이 실제로 따라가게 하는 얇은 층이다.
 * 서버가 없으므로 브라우저 localStorage 한 곳에만 둔다.
 * 값이 없으면 코드에 박힌 기본값을 그대로 쓴다 — 관리자가 손대지 않은 항목은
 * 절대 덮어쓰지 않는다는 뜻이다.
 */

import { useSyncExternalStore } from 'react'
import type { AssetKey } from './mock'

const KEY = 'quill.admin.v1'

export interface Rules {
  /** 이 중 하나라도 제목·요약에 있어야 살아남는다 */
  include: string[]
  /** 하나라도 있으면 그 자리에서 버린다 */
  exclude: string[]
  /** 태깅 신뢰도 하한. 미만이면 사람 검수 큐로 */
  minConfidence: number
  /** 이 쪽수 미만은 단신으로 보고 버린다 */
  minPages: number
}

export const DEFAULT_RULES: Rules = {
  include: [
    '채권',
    'ETF',
    '금리',
    '국고채',
    '회사채',
    '듀레이션',
    '환헤지',
    '지수추종',
    '금통위',
  ],
  exclude: ['종목추천', '공모주', '상장폐지', '투자유의종목', '테마주'],
  minConfidence: 0.7,
  minPages: 5,
}

export interface AdminState {
  /** 검수 큐 판정 — 리포트 id → 승인/반려 */
  decided: Record<string, 'approved' | 'rejected'>
  /** 검수에서 사람이 고쳐 넣은 태그 */
  tagOverrides: Record<string, string[]>
  /** 공개 리포트의 노출 상태 */
  status: Record<string, 'published' | 'held'>
  rules: Rules
  /** 성향별 배분표 덮어쓰기 */
  alloc: Record<string, Record<AssetKey, number>>
  /** 설문 문항 가중치 덮어쓰기 */
  weights: Record<string, number>
}

const EMPTY: AdminState = {
  decided: {},
  tagOverrides: {},
  status: {},
  rules: DEFAULT_RULES,
  alloc: {},
  weights: {},
}

function read(): AdminState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<AdminState>
    return {
      ...EMPTY,
      ...parsed,
      rules: { ...DEFAULT_RULES, ...(parsed.rules ?? {}) },
    }
  } catch {
    return { ...EMPTY }
  }
}

/** 모듈 하나가 들고 있는 현재 값. 화면들은 이걸 읽는다 */
let state: AdminState = typeof localStorage === 'undefined' ? { ...EMPTY } : read()

const listeners = new Set<() => void>()

export const getAdmin = (): AdminState => state

export function setAdmin(patch: Partial<AdminState>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* 저장 실패해도 화면은 그대로 돈다 */
  }
  listeners.forEach((fn) => fn())
}

export function resetAdmin() {
  state = { ...EMPTY }
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
  listeners.forEach((fn) => fn())
}

export function subscribeAdmin(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 관리자 화면들이 현재 설정을 구독한다 */
export const useAdmin = () =>
  useSyncExternalStore(subscribeAdmin, getAdmin, getAdmin)

/* ── 고객 화면이 쓰는 조회 함수 ───────────────────────────── */

/** 관리자가 배분표를 손댔으면 그 값을, 아니면 null */
export const allocOverride = (profileKey: string) =>
  state.alloc[profileKey] ?? null

/** 관리자가 가중치를 손댔으면 그 값을, 아니면 null */
export const weightOverride = (qid: string) =>
  qid in state.weights ? state.weights[qid] : null

/** 보류 처리된 리포트는 고객 화면에 내보내지 않는다 */
export const isPublished = (id: string) => state.status[id] !== 'held'

export const tagsOf = (id: string, fallback: string[]) =>
  state.tagOverrides[id] ?? fallback
