/**
 * 챗 엔진 — 지금은 규칙 매칭 + 스트리밍 시늉이다.
 *
 * 실제 서비스에서는 Supervisor가 Triage(검색) → Analysis(번역) →
 * Recommendation(배분)을 호출하고 토큰을 스트리밍한다. 여기서는 같은
 * 순서를 같은 이름으로 재현해, 나중에 이 파일의 answer()만
 * 서버 SSE 호출로 갈아 끼우면 화면은 손대지 않아도 되게 해 뒀다.
 *
 * 중요: 배분 숫자는 이 파일이 만들지 않는다. quant.ts가 계산한 값을
 *      받아서 문장에 끼워 넣기만 한다. 문장이 숫자를 만들면 안 된다.
 */

import { CANNED, REPORTS, reportById } from './mock'
import {
  ALLOCATION_PARAMS,
  applyAdjustments,
  baselineWeights,
  type AdjustResult,
  type Adjustment,
  type RiskProfile,
} from './quant'
import { DISCLAIMER, NO_EVIDENCE_FALLBACK, checkInput, sanitizeOutput } from './guardrails'

/** 에이전트 호출 트레이스 — 화면에 그대로 보여 준다.
 *  "왜 이 답이 나왔는가"를 시연하는 것이 이 서비스의 핵심이라 감추지 않는다. */
export interface TraceStep {
  agent: 'Guardrails' | 'Supervisor' | 'Triage' | 'Analysis' | 'Recommendation'
  label: string
  detail: string
  /** 이 단계에서 걸린 시간(ms) — 시연용 고정값 */
  ms: number
}

export interface ChatAnswer {
  /** 스트리밍으로 흘릴 본문 */
  text: string
  /** 근거 리포트 ID */
  evidence: string[]
  /** 가드레일이 개입했다면 상단에 띄울 안내 */
  notice?: string
  /** 배분 카드를 함께 띄울지 */
  alloc?: AdjustResult
  trace: TraceStep[]
}

/* ── 3단계 델타 제안 (시연용 고정 제안) ──────────────────────
   실제로는 Recommendation 에이전트가 오늘 리포트를 읽고 만든다.
   근거 리포트 ID가 반드시 붙는다는 점이 핵심이라 여기서도 붙여 둔다. */
const TODAY_PROPOSALS: Adjustment[] = [
  {
    asset: 'etf',
    delta_pp: -6,
    evidence_report_id: 'R-2608-011',
    reason: '금리 인하 사이클 진입으로 장기 국채 매력도가 올라갔습니다.',
  },
  {
    asset: 'bond',
    delta_pp: 6,
    evidence_report_id: 'R-2608-011',
    reason: '듀레이션 확대 구간이라는 관점을 반영했습니다.',
  },
  {
    // 근거가 없는 제안 — 코드가 폐기하는 모습을 보여 주려고 일부러 남겨 뒀다
    asset: 'etf',
    delta_pp: 15,
    reason: '최근 지수가 좋아 보입니다.',
  },
]

function traceBase(hit: boolean, evidenceCount: number): TraceStep[] {
  return [
    {
      agent: 'Guardrails',
      label: '입력 검사',
      detail: '금지 주제 · 매수/매도 직접 요청 여부 확인',
      ms: 12,
    },
    {
      agent: 'Supervisor',
      label: '의도 분해',
      detail: '질문을 정제하고 성향 프로필을 불러왔습니다',
      ms: 84,
    },
    {
      agent: 'Triage',
      label: '리포트 검색',
      detail: hit
        ? `태그 필터로 좁혀 근거 청크 ${evidenceCount}건을 찾았습니다`
        : '조건에 맞는 근거 청크를 찾지 못했습니다',
      ms: 310,
    },
    {
      agent: 'Analysis',
      label: '눈높이 번역',
      detail: hit ? '원문을 풀어 쓰고 용어를 붙였습니다' : '건너뜀',
      ms: hit ? 420 : 0,
    },
  ]
}

/** 질문 하나에 대한 답을 만든다 */
export function answer(question: string, profile?: RiskProfile): ChatAnswer {
  const verdict = checkInput(question)

  // 범위 밖 요청 — 검색까지 가지 않고 여기서 끝낸다
  if (verdict.mode === 'deny') {
    return {
      text: verdict.notice,
      evidence: [],
      trace: [
        {
          agent: 'Guardrails',
          label: '입력 차단',
          detail: '서비스 범위 밖 자산군이 감지되어 검색을 실행하지 않았습니다',
          ms: 11,
        },
      ],
    }
  }

  const notice = verdict.mode === 'explain' ? verdict.notice : undefined
  const q = question.toLowerCase()

  /* ── 배분 질문인가 ── */
  const wantsAlloc =
    /비중|배분|포트폴리오|얼마나 담|어떻게 나눠|자산 배분/.test(question) ||
    /내 성향|내 포트/.test(question)

  if (wantsAlloc && profile) {
    const baseline = baselineWeights(profile.risk)
    const alloc = applyAdjustments(baseline, TODAY_PROPOSALS)
    const ev = alloc.applied
      .map((a) => a.evidence_report_id!)
      .filter((v, i, arr) => arr.indexOf(v) === i)
    const rep = reportById(ev[0])

    const text = sanitizeOutput(
      `회원님의 기준 비중은 현금성 ${alloc.baseline.cash}% · ETF ${alloc.baseline.etf}% · ` +
        `채권 ${alloc.baseline.bond}%로 계산됐어요. 수용력 ${profile.capacity}점과 ` +
        `선호도 ${profile.tolerance}점을 4:6으로 섞은 위험 점수 ${profile.risk}점을 기준으로 한 값입니다.\n\n` +
        (rep
          ? `다만 ${rep.date}에 발간된 ${rep.house} 리포트는 금리 인하 가능성을 높게 전망하며 ` +
            `장기 국채 매력도를 상향했습니다. 이 관점을 반영한 조정 예시는 ` +
            `현금성 ${alloc.adjusted.cash}% · ETF ${alloc.adjusted.etf}% · 채권 ${alloc.adjusted.bond}%입니다.\n\n`
          : '') +
        `조정 폭은 ±${ALLOCATION_PARAMS.adjust_cap_pp}%p 안으로 제한되고, 현금성은 ` +
        `${ALLOCATION_PARAMS.cash_floor}% 아래로 내려가지 않습니다. ` +
        `근거 리포트가 붙지 않은 제안 ${alloc.rejected.length}건은 폐기했어요.\n\n${DISCLAIMER}`,
    )

    return {
      text,
      evidence: ev,
      notice,
      alloc,
      trace: [
        ...traceBase(true, ev.length),
        {
          agent: 'Recommendation',
          label: '1~2단계 · 순수 연산',
          detail: `위험 점수 ${profile.risk} → 기준 비중 산출 (현금 하한 ${ALLOCATION_PARAMS.cash_floor}% 선차감)`,
          ms: 3,
        },
        {
          agent: 'Recommendation',
          label: '3단계 · 델타 검증',
          detail:
            `제안 ${TODAY_PROPOSALS.length}건 중 ${alloc.applied.length}건 반영 · ` +
            `${alloc.rejected.length}건 폐기(근거 없음)${alloc.clamped ? ' · 한도 초과분 절단' : ''}`,
          ms: 46,
        },
      ],
    }
  }

  /* ── 일반 지식 질문 — 규칙 매칭 ── */
  const hit = CANNED.find((c) => c.match.some((m) => q.includes(m)))

  if (!hit) {
    return {
      text: NO_EVIDENCE_FALLBACK,
      evidence: [],
      notice,
      trace: [
        ...traceBase(false, 0),
        {
          agent: 'Supervisor',
          label: '폴백 응답',
          detail: '근거 0건이므로 고정 문구로 답했습니다 (생성 금지)',
          ms: 6,
        },
      ],
    }
  }

  const rep = reportById(hit.sources[0])
  const attributed = rep
    ? `${rep.house} 「${rep.title}」에 따르면,\n\n${hit.text}`
    : hit.text

  return {
    text: sanitizeOutput(attributed),
    evidence: hit.sources,
    notice,
    trace: traceBase(true, hit.sources.length),
  }
}

/** 오늘 들어온 리포트 — 대화 시작 화면에서 보여 준다 */
export const TODAY_REPORTS = REPORTS.slice(0, 3)
