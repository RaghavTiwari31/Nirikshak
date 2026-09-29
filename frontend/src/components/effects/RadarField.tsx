/**
 * Supervisory radar: a quiet constellation of entities, loosely grouped by sector, with a slow
 * sweep passing over them. Each entity warms to amber as the beam inspects it; a few carry a
 * severity ring when revealed, the way findings surface in Nirikshak. The pointer inspects too:
 * nearby entities brighten and link to it.
 *
 * Built to stay light:
 *   - one <canvas>, lines batched into a few paths per frame, ~40 fps cap;
 *   - pauses when scrolled off screen or when the tab is hidden;
 *   - pixel ratio capped at 1.5;
 *   - "reduce motion" gets a single still frame with no sweep.
 */
import { useEffect, useRef } from 'react'
import clsx from 'clsx'

interface RadarFieldProps {
  /** 'light' for off-white sections, 'dark' for charcoal ones. */
  tone?: 'light' | 'dark'
  /** Where the sweep turns around, as fractions of the canvas size. */
  origin?: { x: number; y: number }
  /** Average distance between entities, in CSS pixels. */
  spacing?: number
  /** Seconds per full turn of the sweep. */
  period?: number
  /** Brighten and link entities around the pointer. */
  interactive?: boolean
  className?: string
}

const AMBER_LIGHT = '217, 138, 6' // --accent
const AMBER_DARK = '240, 168, 60' // brighter amber that reads on charcoal
const FLAGS = ['149, 26, 50', '210, 82, 28'] // --sev-critical, --sev-high
const FRAME_MS = 1000 / 40
const TRAIL = 1.1 // radians of afterglow behind the beam
const TAU = Math.PI * 2

type Node = { x: number; y: number; phase: number; size: number; flag: number | null }

/** Small seeded generator, so the layout is stable for a given size. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function RadarField({
  tone = 'light',
  origin = { x: 0.5, y: 0.4 },
  spacing = 64,
  period = 11,
  interactive = true,
  className,
}: RadarFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dark = tone === 'dark'
    const base = dark ? '255, 255, 255' : '31, 35, 40'
    const amber = dark ? AMBER_DARK : AMBER_LIGHT
    const nodeAlpha = dark ? 0.22 : 0.2
    const linkAlpha = dark ? 0.07 : 0.06
    const pointerRadius = 170

    let width = 0
    let height = 0
    let nodes: Node[] = []
    let links: [number, number][] = []
    let visible = true
    let raf = 0
    let last = 0
    const pointer = { x: -9999, y: -9999, on: false }

    const build = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const rand = mulberry32(Math.round(width) * 31 + Math.round(height))
      const count = Math.max(24, Math.round((width * height) / (spacing * spacing)))
      // A few sector clusters, plus a sprinkle of loners so the field never looks empty.
      const clusters = Array.from({ length: 6 }, () => ({ x: rand() * width, y: rand() * height }))
      nodes = Array.from({ length: count }, () => {
        const loner = rand() < 0.35
        const c = clusters[Math.floor(rand() * clusters.length)]!
        const spread = spacing * 2.4
        const x = loner ? rand() * width : c.x + (rand() + rand() + rand() - 1.5) * spread
        const y = loner ? rand() * height : c.y + (rand() + rand() + rand() - 1.5) * spread
        const r = rand()
        return {
          x: Math.min(width, Math.max(0, x)),
          y: Math.min(height, Math.max(0, y)),
          phase: rand() * TAU,
          size: 1.3 + rand() * 1.3,
          flag: r < 0.035 ? 0 : r < 0.075 ? 1 : null,
        }
      })

      // Link each entity to its two nearest neighbours (computed once per size).
      const seen = new Set<string>()
      links = []
      nodes.forEach((n, i) => {
        const nearest = nodes
          .map((m, j) => ({ j, d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
          .filter((o) => o.j !== i && o.d < (spacing * 1.9) ** 2)
          .sort((a, b) => a.d - b.d)
          .slice(0, 2)
        for (const { j } of nearest) {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`
          if (!seen.has(key)) {
            seen.add(key)
            links.push([i, j])
          }
        }
      })
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height)
      const cx = width * origin.x
      const cy = height * origin.y
      const beam = reduced ? -1 : ((t / 1000 / period) * TAU) % TAU
      const reach = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy))

      // Positions, gently drifting.
      const pos = nodes.map((n) => ({
        x: n.x + (reduced ? 0 : 3 * Math.sin(t * 0.0004 + n.phase)),
        y: n.y + (reduced ? 0 : 3 * Math.cos(t * 0.00033 + n.phase * 1.3)),
      }))

      // How recently the beam passed each entity: 1 right behind it, fading to 0.
      const glowOf = (x: number, y: number) => {
        if (beam < 0) return 0
        let behind = beam - Math.atan2(y - cy, x - cx)
        behind = ((behind % TAU) + TAU) % TAU
        return behind < TRAIL ? 1 - behind / TRAIL : 0
      }

      // 1. Sweep: a soft wedge trailing the beam, and the beam's leading edge.
      if (beam >= 0) {
        const withConic = ctx as CanvasRenderingContext2D & {
          createConicGradient?: (a: number, x: number, y: number) => CanvasGradient
        }
        if (withConic.createConicGradient) {
          const g = withConic.createConicGradient(beam - TRAIL, cx, cy)
          const f = TRAIL / TAU
          g.addColorStop(0, `rgba(${amber}, 0)`)
          g.addColorStop(f, `rgba(${amber}, ${dark ? 0.1 : 0.08})`)
          g.addColorStop(Math.min(1, f + 0.0005), `rgba(${amber}, 0)`)
          g.addColorStop(1, `rgba(${amber}, 0)`)
          ctx.fillStyle = g
          ctx.fillRect(0, 0, width, height)
        }
        const edge = ctx.createLinearGradient(cx, cy, cx + Math.cos(beam) * reach, cy + Math.sin(beam) * reach)
        edge.addColorStop(0, `rgba(${amber}, ${dark ? 0.55 : 0.45})`)
        edge.addColorStop(1, `rgba(${amber}, 0)`)
        ctx.strokeStyle = edge
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(beam) * reach, cy + Math.sin(beam) * reach)
        ctx.stroke()
      }

      // 2. Range rings around the sweep's centre.
      ctx.strokeStyle = `rgba(${base}, ${dark ? 0.06 : 0.05})`
      ctx.lineWidth = 1
      for (let r = spacing * 3; r < reach; r += spacing * 3) {
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, TAU)
        ctx.stroke()
      }

      // 3. Links, faint and in one path.
      ctx.strokeStyle = `rgba(${base}, ${linkAlpha})`
      ctx.beginPath()
      for (const [i, j] of links) {
        ctx.moveTo(pos[i]!.x, pos[i]!.y)
        ctx.lineTo(pos[j]!.x, pos[j]!.y)
      }
      ctx.stroke()

      // 4. Entities: resting dots in one path, then the ones the beam or pointer is lighting.
      ctx.fillStyle = `rgba(${base}, ${nodeAlpha})`
      ctx.beginPath()
      pos.forEach((p, i) => {
        ctx.moveTo(p.x + nodes[i]!.size, p.y)
        ctx.arc(p.x, p.y, nodes[i]!.size, 0, TAU)
      })
      ctx.fill()

      pos.forEach((p, i) => {
        const n = nodes[i]!
        let glow = glowOf(p.x, p.y)
        if (pointer.on) {
          const d = Math.hypot(p.x - pointer.x, p.y - pointer.y)
          if (d < pointerRadius) {
            const k = 1 - d / pointerRadius
            glow = Math.max(glow, k)
            ctx.strokeStyle = `rgba(${amber}, ${0.45 * k * k})`
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(pointer.x, pointer.y)
            ctx.stroke()
          }
        }
        if (glow <= 0.02) return
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10)
        halo.addColorStop(0, `rgba(${amber}, ${0.55 * glow})`)
        halo.addColorStop(1, `rgba(${amber}, 0)`)
        ctx.fillStyle = halo
        ctx.beginPath()
        ctx.arc(p.x, p.y, 10, 0, TAU)
        ctx.fill()
        ctx.fillStyle = `rgba(${amber}, ${0.4 + 0.6 * glow})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, n.size + 0.8 * glow, 0, TAU)
        ctx.fill()

        // Flagged entities show a severity ring while revealed, pulsing outward.
        if (n.flag !== null) {
          const pulse = reduced ? 0.5 : (t / 1400 + n.phase) % 1
          ctx.strokeStyle = `rgba(${FLAGS[n.flag]}, ${0.75 * glow * (1 - pulse)})`
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.arc(p.x, p.y, 4 + 12 * pulse, 0, TAU)
          ctx.stroke()
          ctx.lineWidth = 1
        }
      })
    }

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (!visible || document.hidden || t - last < FRAME_MS) return
      last = t
      draw(t)
    }

    build()
    // Reduced motion: one still frame of the constellation, no sweep.
    draw(reduced ? 0 : performance.now())

    const ro = new ResizeObserver(() => {
      build()
      draw(performance.now())
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting
    })
    io.observe(canvas)

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      pointer.x = e.clientX - r.left
      pointer.y = e.clientY - r.top
      pointer.on = pointer.x >= -40 && pointer.y >= -40 && pointer.x <= r.width + 40 && pointer.y <= r.height + 40
    }
    const onLeave = () => {
      pointer.on = false
    }
    if (interactive && !reduced) {
      window.addEventListener('pointermove', onMove, { passive: true })
      document.addEventListener('pointerleave', onLeave)
    }
    if (!reduced) raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [tone, origin.x, origin.y, spacing, period, interactive])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={clsx('pointer-events-none absolute inset-0 h-full w-full', className)}
    />
  )
}
