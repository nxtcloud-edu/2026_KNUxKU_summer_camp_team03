/**
 * 가드레일 — 설계문서 05장을 코드로 옮긴 것
 *
 * 실제 서비스에서는 Bedrock Guardrails가 앞단에서 거르지만, 화면에서도
 * 같은 규칙이 눈에 보여야 팀이 "무엇을 막고 있는지"를 확인할 수 있다.
 * 그래서 입력 검사와 출력 치환을 프런트에도 같은 규칙으로 둔다.
 *
 * 이 파일은 판단하지 않는다. 매수·매도·예측을 '막을' 뿐이다.
 */

export type InputVerdict =
  | { mode: 'ok' }
  /** 매수/매도 직접 요청 — 거부가 아니라 해설 모드로 재해석한다 */
  | { mode: 'explain'; notice: string }
  /** 서비스 범위를 벗어난 요청 */
  | { mode: 'deny'; notice: string }

/** 매수/매도 직접 지시를 요구하는 표현 */
const ASK_FOR_ORDER = [
  '사야',
  '살까',
  '사도 돼',
  '매수해',
  '매도해',
  '팔까',
  '팔아야',
  '지금 사',
  '얼마나 사',
  '몇 주',
  '종목 찍어',
  '추천해 줘',
  '추천해줘',
  '골라 줘',
  '골라줘',
]

/** 확정적 예측·수익 보장을 요구하는 표현 */
const ASK_FOR_PREDICTION = [
  '오를까',
  '내릴까',
  '얼마나 벌',
  '수익률 얼마',
  '확실',
  '보장',
  '무조건',
  '언제 오르',
  '전망 맞',
]

/** 서비스가 다루지 않는 자산군 */
const OUT_OF_SCOPE = [
  '코인',
  '비트코인',
  '가상화폐',
  '선물',
  '옵션',
  '레버리지',
  '인버스',
  '개별 종목',
  '단타',
  '테마주',
]

export function checkInput(text: string): InputVerdict {
  const q = text.replace(/\s+/g, ' ').toLowerCase()

  for (const w of OUT_OF_SCOPE) {
    if (q.includes(w)) {
      return {
        mode: 'deny',
        notice:
          `${w}은(는) 이 서비스가 다루는 범위 밖이에요. ` +
          '현금성 자산과 채권, ETF만 수집된 리포트를 근거로 해설합니다.',
      }
    }
  }

  for (const w of ASK_FOR_ORDER) {
    if (q.includes(w)) {
      return {
        mode: 'explain',
        notice:
          '무엇을 사고팔지는 정해 드릴 수 없어요. 대신 리포트가 어떤 관점을 ' +
          '제시하는지 풀어서 해설해 드릴게요. 판단은 회원님이 하십니다.',
      }
    }
  }

  for (const w of ASK_FOR_PREDICTION) {
    if (q.includes(w)) {
      return {
        mode: 'explain',
        notice:
          '앞으로 오를지 내릴지는 말씀드릴 수 없어요. 리포트에 적힌 전망과 ' +
          '그 근거를 그대로 옮겨 드립니다.',
      }
    }
  }

  return { mode: 'ok' }
}

/** 치환 규칙 — 설계문서의 표현 치환표 그대로 */
const REPLACEMENTS: [RegExp, string][] = [
  [/추천합니다/g, '해설해 드립니다'],
  [/추천해 드립니다/g, '해설해 드립니다'],
  [/추천/g, '해설'],
  [/사야 합니다/g, '이런 선택지가 있습니다'],
  [/사셔야 합니다/g, '이런 선택지가 있습니다'],
  [/확실시됩니다/g, '전망합니다'],
  [/확실합니다/g, '전망합니다'],
  [/유망합니다/g, '리포트는 이런 관점을 제시합니다'],
  [/보장됩니다/g, '전망합니다'],
]

/** 출력 치환 — 화면에 나가기 전 마지막 관문 */
export function sanitizeOutput(text: string): string {
  let out = text
  for (const [re, to] of REPLACEMENTS) out = out.replace(re, to)
  return out
}

/** 근거가 하나도 없을 때의 고정 응답. 지어내지 않는다 */
export const NO_EVIDENCE_FALLBACK =
  '수집된 리포트에서는 이 내용을 확인하지 못했어요. 근거 없이 답을 만들어 드리지는 ' +
  '않겠습니다. 대신 채권·ETF·금리와 관련해 오늘 들어온 리포트 중에서 찾아봐 드릴까요?'

/** 모든 배분 답변에 자동으로 붙는 면책 문구 */
export const DISCLAIMER =
  '표시된 비중은 예시이며 투자 권유가 아닙니다. 최종 판단과 그 결과는 회원님께 있습니다.'
