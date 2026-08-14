/**
 * ReportFan — 리포트를 손에 쥔 카드처럼 부채꼴로 펼쳐 보여 주는 덱.
 *
 * 가운데 카드가 정면, 양옆으로 갈수록 작아지고 기울어진다. 좌우 화살표로
 * 덱을 한 장씩 돌리고, 카드에 마우스를 올리면 옆 카드들이 밀려난다.
 * 애니메이션은 GSAP이 전담한다 — React는 어느 카드가 어느 슬롯인지만 정한다.
 *
 * 카드가 슬롯 수(7)보다 많으면 원형 큐로 순환하고, 점 대신 "n / 전체"
 * 카운터를 쓴다(93장에 점 93개는 읽을 수 없다). 검색·필터로 목록이
 * 바뀔 때는 부모가 key를 갈아 끼워 덱을 처음부터 다시 펼친다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { DEMO_TODAY, type Report } from '../lib/mock'
import { readTag, sinceDays } from '../lib/format'
import { IconArrowLeft, IconArrowRight } from './icons'

const MAX_VISIBLE = 7
const HALF = 3

const FAN_POSITIONS = [
  { rot: -21, scale: 0.7756, x: -30, y: 7.3, zIndex: 1 },
  { rot: -14, scale: 0.8498, x: -22, y: 4.0, zIndex: 2 },
  { rot: -7, scale: 0.9346, x: -11, y: 1.3, zIndex: 3 },
  { rot: 0, scale: 1.0, x: 0, y: 0.0, zIndex: 10 },
  { rot: 7, scale: 0.9346, x: 11, y: 1.3, zIndex: 3 },
  { rot: 14, scale: 0.8498, x: 22, y: 4.0, zIndex: 2 },
  { rot: 21, scale: 0.7756, x: 30, y: 7.3, zIndex: 1 },
]

function getResponsiveMultiplier(width: number) {
  if (width < 480) return 0.28
  if (width < 640) return 0.38
  if (width < 768) return 0.5
  if (width < 1024) return 0.75
  return 1.0
}

/** 뷰포트가 낮으면 y 오프셋과 등장 거리를 그만큼 눌러 준다 */
function getHeightMultiplier(width: number) {
  let idealPx: number
  if (width < 480) idealPx = 22 * 16
  else if (width < 640) idealPx = 26 * 16
  else if (width < 768) idealPx = 28 * 16
  else if (width < 1024) idealPx = 34 * 16
  else idealPx = 38 * 16

  const available = window.innerHeight * 0.7
  if (available >= idealPx) return 1
  return available / idealPx
}

function getSlotConfig(totalCards: number, slot: number) {
  if (totalCards >= MAX_VISIBLE) return FAN_POSITIONS[slot]
  const center = totalCards >> 1
  const distance = totalCards > 1 ? (slot - center) / center : 0
  const absDistance = Math.abs(distance)
  return {
    rot: distance * 21,
    scale: 1.0 - 0.2244 * absDistance * absDistance,
    x: distance * 30,
    y: absDistance * absDistance * 7.3,
    zIndex: 10 - Math.abs(slot - center),
  }
}

export default function ReportFan({
  reports,
  onOpen,
}: {
  reports: Report[]
  onOpen: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isAnimating = useRef(false)
  const hasEntered = useRef(false)
  const directionRef = useRef<'left' | 'right' | null>(null)
  const prevVisible = useRef<Set<number>>(new Set())

  const totalCards = reports.length
  const needsPagination = totalCards > MAX_VISIBLE
  const [centerIndex, setCenterIndex] = useState(needsPagination ? HALF : totalCards >> 1)

  const getVisibleMap = useCallback(
    (center: number) => {
      const map = new Map<number, number>()
      if (!needsPagination) {
        reports.forEach((_, i) => map.set(i, i))
        return map
      }
      for (let slot = 0; slot < MAX_VISIBLE; slot++) {
        map.set((((center + slot - HALF) % totalCards) + totalCards) % totalCards, slot)
      }
      return map
    },
    [totalCards, needsPagination, reports],
  )

  const cycle = useCallback(
    (direction: 'left' | 'right') => {
      if (isAnimating.current || !needsPagination) return
      isAnimating.current = true
      directionRef.current = direction
      setCenterIndex((prev) =>
        direction === 'right' ? (prev + 1) % totalCards : (prev - 1 + totalCards) % totalCards,
      )
    },
    [totalCards, needsPagination],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container || !totalCards) return

    const cardElements = Array.from(container.querySelectorAll<HTMLElement>('.fan-card'))
    if (!cardElements.length) return

    const visibleMap = getVisibleMap(centerIndex)
    const previouslyVisible = prevVisible.current
    const direction = directionRef.current
    const isFirstMount = !hasEntered.current
    const multiplier = getResponsiveMultiplier(window.innerWidth)
    const hMult = getHeightMultiplier(window.innerWidth)
    const slotCount = needsPagination ? MAX_VISIBLE : totalCards
    const config = (slot: number) => getSlotConfig(slotCount, slot)

    if (isFirstMount) isAnimating.current = true

    /* 잠금 해제는 GSAP onComplete 계수가 아니라 타이머로 확정한다 —
       StrictMode 이중 실행·HMR에서 콜백 수가 어긋나면 영영 잠긴다 */
    const visibleCount = visibleMap.size
    const releaseAfter = isFirstMount
      ? (0.2 + (visibleCount - 1) * 0.06 + 1.2) * 1000 + 150
      : 750
    const releaseTimer = window.setTimeout(() => {
      isAnimating.current = false
      if (isFirstMount) hasEntered.current = true
    }, releaseAfter)

    cardElements.forEach((card, cardIndex) => {
      const slot = visibleMap.get(cardIndex)
      const wasVisible = previouslyVisible.has(cardIndex)

      if (slot !== undefined) {
        const { x, y, rot, scale, zIndex } = config(slot)
        const target = {
          x: `${x * multiplier}rem`,
          y: `${y * hMult}rem`,
          rotation: rot,
          scale,
          opacity: 1,
          zIndex,
        }

        if (isFirstMount) {
          gsap.set(card, { x: 0, y: `${12 * hMult}rem`, rotation: 0, scale: 0.5, opacity: 0 })
          gsap.to(card, {
            ...target,
            duration: 1.2,
            ease: 'elastic.out(1.05,.78)',
            delay: 0.2 + slot * 0.06,
          })
        } else if (!wasVisible) {
          const enterX = direction === 'right' ? 40 : -40
          gsap.set(card, {
            x: `${enterX}rem`,
            y: `${y * hMult}rem`,
            rotation: direction === 'right' ? 30 : -30,
            scale: 0.5,
            opacity: 0,
          })
          gsap.to(card, { ...target, duration: 0.6, ease: 'power2.out' })
        } else {
          gsap.to(card, { ...target, duration: 0.5, ease: 'power2.out' })
        }
      } else if (wasVisible) {
        const exitX = direction === 'right' ? -40 : 40
        gsap.to(card, {
          x: `${exitX}rem`,
          opacity: 0,
          scale: 0.5,
          rotation: direction === 'right' ? -30 : 30,
          duration: 0.4,
          ease: 'power2.in',
          zIndex: 0,
        })
      } else if (isFirstMount) {
        gsap.set(card, { opacity: 0, scale: 0.3, x: 0, y: 0, zIndex: 0 })
      }
    })

    prevVisible.current = new Set(visibleMap.keys())

    /* ── 호버 — 올린 카드가 떠오르고 옆 카드가 밀려난다 ── */
    const visibleEntries: { el: HTMLElement; slot: number }[] = []
    cardElements.forEach((el, i) => {
      const slot = visibleMap.get(i)
      if (slot !== undefined) visibleEntries.push({ el, slot })
    })
    visibleEntries.sort((a, b) => a.slot - b.slot)

    let activeSlot: number | null = null
    let leaveTimer: number | null = null
    const centerSlot = visibleEntries.length >> 1

    const updateHoverLayout = (hoveredSlot: number | null) => {
      const mult = getResponsiveMultiplier(window.innerWidth)
      const hM = getHeightMultiplier(window.innerWidth)

      visibleEntries.forEach(({ el, slot }) => {
        const base = config(slot)
        let targetX = base.x * mult
        let targetY = base.y * hM
        let targetRot = base.rot
        let targetScale = base.scale
        let delay = 0

        if (hoveredSlot !== null) {
          const distance = Math.abs(slot - hoveredSlot)
          delay = distance * 0.02

          if (slot === hoveredSlot) {
            targetY -= 2.5 * hM
            targetScale *= 1.08
          } else {
            const normalized = centerSlot > 0 ? (slot - centerSlot) / centerSlot : 0
            const pushStrength =
              8 * (1 - Math.abs(normalized)) * (1 + 0.2 * Math.max(0, 3 - distance))

            if (slot < hoveredSlot) {
              targetX -= pushStrength * mult
              targetRot -= 3 / (distance + 1)
            } else {
              targetX += pushStrength * mult
              targetRot += 3 / (distance + 1)
            }

            if (slot === visibleEntries.length - 1 && hoveredSlot < centerSlot) targetY -= 1 * hM
            if (slot === 0 && hoveredSlot > centerSlot) targetY -= 1 * hM
          }
        } else {
          delay = Math.abs(slot - centerSlot) * 0.02
        }

        gsap.to(el, {
          x: `${targetX}rem`,
          y: `${targetY}rem`,
          rotation: targetRot,
          scale: targetScale,
          duration: 0.5,
          delay,
          ease: 'elastic.out(1,.75)',
          overwrite: 'auto',
        })
        gsap.set(el, { zIndex: base.zIndex })
      })
    }

    const enterHandlers = visibleEntries.map(({ el, slot }) => {
      const handler = () => {
        if (isAnimating.current) return
        if (leaveTimer) {
          window.clearTimeout(leaveTimer)
          leaveTimer = null
        }
        if (activeSlot !== slot) {
          activeSlot = slot
          updateHoverLayout(slot)
        }
      }
      el.addEventListener('mouseenter', handler)
      return { el, handler }
    })

    const onMouseLeave = () => {
      if (isAnimating.current) return
      if (leaveTimer) window.clearTimeout(leaveTimer)
      leaveTimer = window.setTimeout(() => {
        activeSlot = null
        updateHoverLayout(null)
      }, 50)
    }
    container.addEventListener('mouseleave', onMouseLeave)

    const onResize = () => {
      if (!isAnimating.current) updateHoverLayout(activeSlot)
    }
    window.addEventListener('resize', onResize)

    return () => {
      enterHandlers.forEach(({ el, handler }) => el.removeEventListener('mouseenter', handler))
      container.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('resize', onResize)
      if (leaveTimer) window.clearTimeout(leaveTimer)
      window.clearTimeout(releaseTimer)
    }
  }, [centerIndex, totalCards, getVisibleMap, needsPagination])

  if (!totalCards) return null

  const visibleNow = getVisibleMap(centerIndex)

  return (
    <section className="fan-section">
      <div ref={containerRef} className="fan-layout">
        {reports.map((r, index) => (
          <button
            key={r.id}
            className="fan-card"
            onClick={() => onOpen(r.id)}
            tabIndex={visibleNow.has(index) ? 0 : -1}
          >
            <div className="rep-meta">
              <span className="strong" style={{ color: 'var(--brand)' }}>
                {r.house}
              </span>
              <span>·</span>
              <span>{r.analyst}</span>
              <span className="spacer" />
              <span>{sinceDays(r.date, DEMO_TODAY)}</span>
            </div>

            <h3 className="fan-card-title">{r.title}</h3>

            <ul className="rep-sum col gap-1">
              {r.summary.slice(0, 2).map((s, j) => (
                <li key={j} className="clamp-3">
                  {s}
                </li>
              ))}
            </ul>

            <div className="fan-card-tags row wrap gap-1">
              {r.tags.map((t) => (
                <span key={t} className="tag">
                  {readTag(t)}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {needsPagination && (
        <div className="fan-nav">
          <button className="fan-arrow" onClick={() => cycle('left')} aria-label="이전 리포트">
            <IconArrowLeft size={18} />
          </button>
          <span className="fan-count num">
            {centerIndex + 1} / {totalCards}
          </span>
          <button className="fan-arrow" onClick={() => cycle('right')} aria-label="다음 리포트">
            <IconArrowRight size={18} />
          </button>
        </div>
      )}
    </section>
  )
}
