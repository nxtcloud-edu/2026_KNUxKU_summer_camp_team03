/** 공용 UI 조각 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { IconCheck, IconInfo } from './icons'

/* ── 토스트 ─────────────────────────────────────────────── */
interface Toast {
  id: number
  text: string
}
const ToastCtx = createContext<(t: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const seq = useRef(0)

  const push = useCallback((text: string) => {
    const id = ++seq.current
    setItems((prev) => [...prev.slice(-2), { id, text }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <IconCheck size={15} style={{ flex: 'none', opacity: 0.8 }} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ── 표시 조각 ──────────────────────────────────────────── */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info' | 'outline'
  children: ReactNode
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" style={{ gap: 8, color: 'var(--ink-3)' }}>
      <span className="spinner" />
      {label && <span className="small">{label}</span>}
    </span>
  )
}

export function Empty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty">
      <IconInfo size={24} />
      <div className="strong" style={{ color: 'var(--ink-2)' }}>
        {title}
      </div>
      {description && (
        <div className="small keep" style={{ maxWidth: 380 }}>
          {description}
        </div>
      )}
    </div>
  )
}

/** 스크롤로 들어올 때 한 번만 떠오른다 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={`reveal${seen ? ' in' : ''}${className ? ' ' + className : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/** 화면에 들어오면 0에서 목표까지 센다 */
export function CountUp({
  to,
  duration = 1200,
  decimals = 0,
  suffix = '',
}: {
  to: number
  duration?: number
  decimals?: number
  suffix?: string
}) {
  const [v, setV] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setV(to)
      return
    }
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration)
        setV(to * (1 - Math.pow(1 - p, 3)))
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [to, duration])
  return (
    <span ref={ref} className="num">
      {decimals > 0
        ? v.toFixed(decimals)
        : Math.round(v).toLocaleString('ko-KR')}
      {suffix}
    </span>
  )
}

/** 오른쪽에서 밀려 나오는 서랍 */
export function Drawer({
  children,
  onClose,
}: {
  children: ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <>
      <div className="drawer-backdrop" onMouseDown={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        {children}
      </aside>
    </>
  )
}

/** 값이 바뀔 때 스크롤을 맨 위로 — 페이지 전환용 */
export function useScrollTop(dep: unknown) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [dep])
}
