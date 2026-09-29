/**
 * "What the dashboard says" against "what the records show", as a before/after slider. Both
 * layers share one layout, so dragging the divider swaps each row's answer in place. It nudges
 * itself once when it first comes into view, to show that it moves.
 */
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, ChevronsLeftRight } from 'lucide-react'
import { animate, motion, useInView, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react'
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react'

const ROWS = [
  ['Critical alerts fixed within 4 hours', '98% on time', '264 closed in the last minutes before the deadline'],
  ['Round-the-clock monitoring', '24×7 cover', 'Night-time alerts wait until the morning shift'],
  ['Every critical machine monitored', '100% onboarded', '25 critical machines never raised an alert'],
  ['Serious incidents escalated', 'Policy in place', 'Escalations far below what peers make'],
] as const

// Phones are too narrow to read a split row, so there the slider starts on the dashboard, wipes
// across to the records once, and a two-way toggle replaces the drag handle.
const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches

export function CompareSlider() {
  const box = useRef<HTMLDivElement>(null)
  const [start] = useState(() => (narrow() ? 100 : 52))
  const pos = useMotionValue(start)
  const [now, setNow] = useState(start)
  useMotionValueEvent(pos, 'change', (v) => setNow(Math.round(v)))
  const clip = useTransform(pos, (v) => `inset(0 0 0 ${v}%)`)
  const left = useTransform(pos, (v) => `${v}%`)

  const inView = useInView(box, { once: true, margin: '-120px' })
  const touched = useRef(false)
  useEffect(() => {
    if (!inView || touched.current) return
    const controls = narrow()
      ? animate(pos, 0, { duration: 1.1, delay: 0.9, ease: [0.6, 0, 0.2, 1] })
      : animate(pos, [52, 30, 74, 52], { duration: 2.4, delay: 0.4, ease: 'easeInOut' })
    return () => controls.stop()
  }, [inView, pos])

  const setFromPointer = (e: PointerEvent) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    pos.set(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)))
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    touched.current = true
    pos.stop()
    e.currentTarget.setPointerCapture(e.pointerId)
    setFromPointer(e)
  }
  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowLeft: -5, ArrowRight: 5, Home: -100, End: 100 }[e.key]
    if (step === undefined) return
    e.preventDefault()
    touched.current = true
    animate(pos, Math.min(100, Math.max(0, pos.get() + step)), { type: 'spring', stiffness: 400, damping: 40 })
  }

  const show = (to: number) => {
    touched.current = true
    animate(pos, to, { duration: 0.8, ease: [0.6, 0, 0.2, 1] })
  }

  return (
    <div className="mx-auto mt-14 max-w-5xl text-left">
      <div className="mb-4 flex justify-center sm:hidden">
        <div className="relative flex rounded-full border border-line bg-surface-2/70 p-1 text-[13px] font-semibold">
          {(
            [
              ['Dashboard', 100],
              ['Records', 0],
            ] as const
          ).map(([label, to]) => {
            const on = to === 100 ? now > 50 : now <= 50
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => show(to)}
                className={clsx(
                  'relative rounded-full px-4 py-1.5 transition-colors',
                  on ? 'text-white' : 'text-ink-2',
                )}
              >
                {on && (
                  <motion.span
                    layoutId="compare-toggle"
                    className="absolute inset-0 rounded-full bg-ink"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="relative">{label}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div
        ref={box}
        className="relative cursor-ew-resize touch-pan-y overflow-hidden rounded-3xl border border-line-strong shadow-[0_30px_80px_-30px_rgb(31_35_40/0.35)] select-none"
        onPointerDown={onPointerDown}
        onPointerMove={(e) => e.buttons === 1 && setFromPointer(e)}
      >
        <Layer kind="claim" />
        <motion.div className="absolute inset-0" style={{ clipPath: clip }} aria-hidden="true">
          <Layer kind="record" />
        </motion.div>

        {/* Divider and handle */}
        <motion.div className="absolute inset-y-0 w-0" style={{ left }}>
          <span className="absolute inset-y-0 -left-px w-0.5 bg-accent" />
          <button
            type="button"
            role="slider"
            aria-label="Compare what the dashboard says with what the records show"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={now}
            onKeyDown={onKey}
            className="absolute top-1/2 left-0 hidden size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-accent sm:flex bg-surface text-accent-ink shadow-pop transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ChevronsLeftRight size={18} />
          </button>
        </motion.div>
      </div>
      <p className="mt-4 text-center text-[13px] text-muted">
        <span className="hidden sm:inline">Drag to compare. </span>An illustrative case built from the synthetic demo
        data.
      </p>
    </div>
  )
}

function Layer({ kind }: { kind: 'claim' | 'record' }) {
  const record = kind === 'record'
  return (
    <div className={clsx('p-5 sm:p-8', record ? 'bg-ink text-white' : 'bg-surface text-ink')}>
      <div className={clsx('flex', record ? 'sm:justify-end' : 'justify-start')}>
        <span
          className={clsx(
            'rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase',
            record ? 'bg-accent/15 text-accent' : 'bg-ok/10 text-ok',
          )}
        >
          {record ? 'What the records show' : 'What the dashboard says'}
        </span>
      </div>
      <ul className="mt-5 space-y-3">
        {ROWS.map(([claim, kpi, evidence]) => (
          <li
            key={claim}
            className={clsx(
              'grid items-center gap-1.5 rounded-2xl border px-4 py-4 sm:grid-cols-[1fr_1.25fr] sm:gap-4 sm:px-5',
              record ? 'border-white/10 bg-white/[0.04]' : 'border-line bg-bg/60',
            )}
          >
            <span className={clsx('text-[13px] font-medium sm:text-[15px]', record ? 'text-white/60' : 'text-ink-2')}>
              {claim}
            </span>
            {/* Both answers sit in the same cell so every row has the same height in both layers. */}
            <span className="grid items-center text-[15px] font-semibold sm:text-right">
              <span
                className={clsx(
                  'col-start-1 row-start-1 flex items-center gap-2 sm:justify-end',
                  !record && 'invisible',
                )}
              >
                {evidence}
                <AlertTriangle size={17} className="shrink-0 text-accent" />
              </span>
              <span
                className={clsx(
                  'col-start-1 row-start-1 flex items-center gap-2 sm:justify-end',
                  record && 'invisible',
                )}
              >
                {kpi}
                <CheckCircle2 size={17} className="shrink-0 text-ok" />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
