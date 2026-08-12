/** 표시 형식 — 숫자는 전부 여기를 거쳐서 화면에 나간다. */

export const pct = (v: number, digits = 1) =>
  `${v.toFixed(digits)}%`

export const signed = (v: number, digits = 2) =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`

export const won = (v: number) => `${v.toLocaleString('ko-KR')}원`

/** 만 단위로 끊어 읽기 — 1,200,000 → 120만 */
export const manwon = (v: number) => {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(v % 100_000_000 === 0 ? 0 : 1)}억`
  if (v >= 10_000) return `${Math.round(v / 10_000).toLocaleString('ko-KR')}만`
  return v.toLocaleString('ko-KR')
}

/** 2026-08-11 → 8월 11일 */
export const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${Number(m)}월 ${Number(d)}일`
}

/** 오늘 기준 며칠 전인지 */
export const sinceDays = (iso: string, today: string) => {
  const a = new Date(iso + 'T00:00:00Z').getTime()
  const b = new Date(today + 'T00:00:00Z').getTime()
  const days = Math.round((b - a) / 86_400_000)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  if (days < 30) return `${Math.floor(days / 7)}주 전`
  return `${Math.floor(days / 30)}개월 전`
}

/** 태그를 사람이 읽는 말로 — 채권-장기-국채 → 채권 · 장기 · 국채 */
export const readTag = (tag: string) => tag.split('-').join(' · ')

/** 위험도 1~5를 막대로 */
export const riskLabel = (r: number) =>
  ['', '매우 낮음', '낮음', '보통', '다소 높음', '높음'][r] ?? '보통'
