/** 아이콘 — 1.6px 선, 24 그리드. 채우기는 쓰지 않는다(선으로만 그린다). */
import type { CSSProperties } from 'react'

interface P {
  size?: number
  style?: CSSProperties
  className?: string
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  xmlns: 'http://www.w3.org/2000/svg',
})

/** 브랜드 마크 — 만년필 촉. 가운데 슬릿과 브리더 홀까지 그린다 */
export function IconQuill({ size = 26, style, className }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      className={className}
      aria-hidden
    >
      <path
        d="M12 2.6 6.4 8.9c-1.5 1.7-2.1 3.6-1.9 5.7l.6 5.4c.05.5.5.85 1 .77l5.3-.9c2-.35 3.6-1.4 4.8-3l4-5.4c.6-.8.55-1.9-.1-2.6L12 2.6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 8.4v8.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="8.4" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export const IconSearch = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <circle cx="11" cy="11" r="6.4" />
    <path d="m16 16 4 4" />
  </svg>
)
export const IconSend = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M4.5 12 20 4.6l-4.4 15.2-3.5-6.1-7.6-1.7Z" />
    <path d="m12.1 13.7 3.9-4.2" />
  </svg>
)
export const IconChat = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M20.5 11.4c0 3.9-3.8 7-8.5 7-.9 0-1.8-.1-2.6-.35L4.2 20l1.3-3.5C4.2 15.2 3.5 13.4 3.5 11.4c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7Z" />
  </svg>
)
export const IconX = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)
export const IconCheck = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="m5 12.6 4.4 4.4L19 6.6" />
  </svg>
)
export const IconArrowRight = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M4.5 12h15M13.5 6l6 6-6 6" />
  </svg>
)
export const IconArrowLeft = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M19.5 12h-15M10.5 6l-6 6 6 6" />
  </svg>
)
export const IconArrowUpRight = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M7 17 17 7M8.5 7H17v8.5" />
  </svg>
)
export const IconChevronDown = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="m6 9.5 6 6 6-6" />
  </svg>
)
export const IconDoc = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7l-4-4Z" />
    <path d="M13.8 3.2V7.2h4M9 12.5h6M9 16h4" />
  </svg>
)
export const IconBook = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M4 5.2C4 4.4 4.6 3.8 5.4 3.8H10c1.1 0 2 .9 2 2v14c0-1.1-.9-2-2-2H5.4c-.8 0-1.4-.6-1.4-1.4V5.2Z" />
    <path d="M20 5.2c0-.8-.6-1.4-1.4-1.4H14c-1.1 0-2 .9-2 2v14c0-1.1.9-2 2-2h4.6c.8 0 1.4-.6 1.4-1.4V5.2Z" />
  </svg>
)
export const IconSparkle = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8-5.8-1.7L10.3 9 12 3.2Z" />
    <path d="M19 4v3M17.5 5.5h3" />
  </svg>
)
export const IconShield = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M12 3 5 5.8v5.4c0 4 2.8 7.7 7 9.1 4.2-1.4 7-5.1 7-9.1V5.8L12 3Z" />
    <path d="m9 12 2.2 2.2L15.2 10" />
  </svg>
)
export const IconClock = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 7.4V12l3 1.8" />
  </svg>
)
export const IconPie = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M12 3.6a8.4 8.4 0 1 0 8.4 8.4H12V3.6Z" />
    <path d="M15 3.9A8.4 8.4 0 0 1 20.1 9H15V3.9Z" />
  </svg>
)
export const IconTrend = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M4 16.5 9 11l3.5 3.5L20 7" />
    <path d="M15.2 7H20v4.8" />
  </svg>
)
export const IconCoin = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <ellipse cx="12" cy="6.6" rx="7.4" ry="3.2" />
    <path d="M4.6 6.6v10.8c0 1.8 3.3 3.2 7.4 3.2s7.4-1.4 7.4-3.2V6.6" />
    <path d="M4.6 12c0 1.8 3.3 3.2 7.4 3.2s7.4-1.4 7.4-3.2" />
  </svg>
)
export const IconLayers = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="m12 3.4 8.4 4.3-8.4 4.3-8.4-4.3L12 3.4Z" />
    <path d="m3.6 12.3 8.4 4.3 8.4-4.3M3.6 16.6l8.4 4.3 8.4-4.3" />
  </svg>
)
export const IconTarget = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <circle cx="12" cy="12" r="8.4" />
    <circle cx="12" cy="12" r="4.4" />
    <circle cx="12" cy="12" r="0.9" />
  </svg>
)
export const IconInfo = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 11v5.2M12 7.9v.2" />
  </svg>
)
export const IconAlert = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M12 4.2 2.9 19.2h18.2L12 4.2Z" />
    <path d="M12 10v4M12 16.6v.2" />
  </svg>
)
export const IconFilter = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M4 6.4h16M7 12h10M10 17.6h4" />
  </svg>
)
export const IconExternal = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M13.5 4.5H19.5V10.5" />
    <path d="M19.5 4.5 11 13" />
    <path d="M18 14.5v4A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4" />
  </svg>
)
/* ── 관리자 콘솔용 ─────────────────────────────────────── */
export const IconGauge = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M4.4 17.4a8.4 8.4 0 1 1 15.2 0" />
    <path d="m12 12.6 3.6-3.4" />
    <circle cx="12" cy="13.4" r="1.3" />
  </svg>
)
export const IconInbox = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M3.6 13.2 6.2 5.4A1.6 1.6 0 0 1 7.7 4.3h8.6a1.6 1.6 0 0 1 1.5 1.1l2.6 7.8" />
    <path d="M3.6 13.2h4l1.2 2.4h6.4l1.2-2.4h4v4.9a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6v-4.9Z" />
  </svg>
)
export const IconInspect = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h5" />
    <path d="M13.8 3.2V7.2h4" />
    <circle cx="16.6" cy="15.6" r="3.2" />
    <path d="m19 18 2 2" />
  </svg>
)
export const IconSliders = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M4 7.5h4.5M12.5 7.5H20M4 16.5h7.5M15.5 16.5H20" />
    <circle cx="10.4" cy="7.5" r="2" />
    <circle cx="13.6" cy="16.5" r="2" />
  </svg>
)
export const IconClipboard = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M9 4.6H7.4A1.4 1.4 0 0 0 6 6v13.6A1.4 1.4 0 0 0 7.4 21h9.2a1.4 1.4 0 0 0 1.4-1.4V6a1.4 1.4 0 0 0-1.4-1.4H15" />
    <rect x="9" y="3" width="6" height="3.2" rx="1" />
    <path d="M9.4 11.4h5.2M9.4 15h3.4" />
  </svg>
)
export const IconBox = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M20.4 8.2v7.6a1.5 1.5 0 0 1-.8 1.3l-6.9 3.6a1.5 1.5 0 0 1-1.4 0l-6.9-3.6a1.5 1.5 0 0 1-.8-1.3V8.2" />
    <path d="m3.6 8.2 8.4-4.4 8.4 4.4-8.4 4.4-8.4-4.4Z" />
    <path d="M12 12.6V20" />
  </svg>
)

export const IconWallet = ({ size = 18, style }: P) => (
  <svg {...base(size)} style={style} aria-hidden>
    <path d="M3.6 8.2c0-1 .8-1.8 1.8-1.8h12.2c1 0 1.8.8 1.8 1.8v8.6c0 1-.8 1.8-1.8 1.8H5.4c-1 0-1.8-.8-1.8-1.8V8.2Z" />
    <path d="M3.6 10.4h4.2a2 2 0 0 1 0 4H3.6" />
    <path d="M16.4 6.4 14 3.6 6.8 6.4" />
  </svg>
)
