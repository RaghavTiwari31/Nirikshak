/**
 * Small illustrative graphics for the landing page. Plain HTML/SVG animated with transforms and
 * opacity only, so they stay smooth on modest hardware. Each plays once when scrolled into view.
 * Colours come from the app's validated tokens.
 */
import clsx from 'clsx'
import { motion, useInView } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

const once = { once: true, margin: '-40px' } as const
const ease = [0.2, 0, 0, 1] as const

/** Closures piling up just before the SLA deadline, then a cliff after it. */
export function DeadlineBars() {
  const bars = [14, 18, 16, 22, 19, 24, 21, 26, 30, 38, 52, 74, 96, 8, 6, 7, 5, 6]
  return (
    <motion.div aria-hidden="true" className="relative mt-6 h-36" initial="hide" whileInView="show" viewport={once}>
      <div className="absolute inset-x-0 bottom-0 flex h-full items-end gap-1.5">
        {bars.map((h, i) => {
          const hot = i >= 10 && i <= 12
          return (
            <motion.span
              key={i}
              className="flex-1 origin-bottom rounded-t-md"
              style={{ height: `${h}%`, background: hot ? 'var(--sev-critical)' : 'var(--viz-context)' }}
              variants={{ hide: { scaleY: 0 }, show: { scaleY: 1 } }}
              transition={{ duration: 0.7, delay: i * 0.035, ease }}
            />
          )
        })}
      </div>
      <motion.div
        className="absolute inset-y-0 left-[72.5%] border-l-2 border-dashed border-ink/50"
        variants={{ hide: { opacity: 0, y: -8 }, show: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.5, delay: 0.75 }}
      >
        <span className="absolute -top-1 left-2 rounded-md bg-ink px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white">
          SLA deadline
        </span>
      </motion.div>
    </motion.div>
  )
}

/** A miniature coverage matrix with two holes that pulse. */
export function MiniMatrix() {
  const cells = 'ggfgxggpgggffggxgggfgpgg'.split('')
  const color: Record<string, string> = {
    g: 'var(--health-good)',
    f: 'var(--health-fair)',
    p: 'var(--health-poor)',
    x: 'var(--health-bad)',
  }
  return (
    <motion.div
      aria-hidden="true"
      className="mt-6 grid grid-cols-6 gap-1.5"
      initial="hide"
      whileInView="show"
      viewport={once}
    >
      {cells.map((c, i) => (
        <motion.span
          key={i}
          className="relative flex aspect-[5/3] items-center justify-center rounded-md text-[13px] font-bold text-white"
          style={{ background: color[c], opacity: c === 'g' ? 0.85 : 1 }}
          variants={{ hide: { scale: 0.4, opacity: 0 }, show: { scale: 1, opacity: c === 'g' ? 0.85 : 1 } }}
          // A diagonal wave: row + column sets the delay.
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: (Math.floor(i / 6) + (i % 6)) * 0.05 }}
        >
          {c === 'x' && (
            <>
              <span className="absolute inset-0 rounded-md ring-2 ring-sev-critical motion-safe:animate-ping" />✕
            </>
          )}
        </motion.span>
      ))}
    </motion.div>
  )
}

/** A priority queue that re-sorts itself as new evidence arrives. */
export function MiniQueue() {
  const ref = useRef<HTMLUListElement>(null)
  const inView = useInView(ref, { margin: '-40px' })
  const rounds = [
    { 'Power generation': 89, 'State data centre': 73, 'Rail signalling': 41, 'Port operations': 22 },
    { 'Power generation': 84, 'State data centre': 76, 'Rail signalling': 38, 'Port operations': 81 },
    { 'Power generation': 87, 'State data centre': 58, 'Rail signalling': 64, 'Port operations': 79 },
  ]
  const [round, setRound] = useState(0)
  useEffect(() => {
    if (!inView) return
    const id = setInterval(() => setRound((r) => (r + 1) % rounds.length), 2600)
    return () => clearInterval(id)
  }, [inView, rounds.length])

  const rows = Object.entries(rounds[round] ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
  return (
    <ul ref={ref} aria-hidden="true" className="mt-6 space-y-2.5">
      {rows.map(([name, score], i) => {
        const [band, tone] =
          score >= 75
            ? ['Priority', 'var(--sev-critical)']
            : score >= 50
              ? ['Attention', 'var(--sev-high)']
              : ['Watch', 'var(--sev-medium-ink)']
        return (
          <motion.li
            key={name}
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex items-center gap-3 rounded-xl border border-line bg-bg/70 px-3.5 py-2.5 text-[13px]"
          >
            <span className="num w-4 text-muted">{i + 1}</span>
            <span className="flex-1 truncate font-medium text-ink">{name}</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors duration-500"
              style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, var(--surface))` }}
            >
              <span className="size-1.5 rounded-full" style={{ background: tone }} />
              <span className="num">{score}</span> {band}
            </span>
          </motion.li>
        )
      })}
    </ul>
  )
}

/** One entity pulling away from the spread of its peers. */
export function PeerStripMini() {
  const peers = [4, 6, 7, 9, 10, 11, 12, 13, 15, 16, 18, 20]
  return (
    <motion.div aria-hidden="true" className="relative mt-8 h-20" initial="hide" whileInView="show" viewport={once}>
      <div className="absolute inset-x-0 top-1/2 border-t border-line" />
      <div className="absolute top-1/2 left-[12%] h-8 -translate-y-1/2 border-l-2 border-dashed border-muted/60" />
      <span className="absolute top-[78%] left-[12%] -translate-x-1/2 text-[11px] text-muted">peer median</span>
      {peers.map((p, i) => (
        <motion.span
          key={p}
          className="absolute size-2.5 rounded-full"
          style={{ left: `${p}%`, top: `${38 + (i % 3) * 10}%`, background: 'var(--viz-context)' }}
          variants={{ hide: { opacity: 0, y: -14 }, show: { opacity: 1, y: 0 } }}
          transition={{ type: 'spring', stiffness: 300, damping: 18, delay: i * 0.03 }}
        />
      ))}
      <motion.span
        className="absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-ink ring-4 ring-accent/30"
        variants={{ hide: { left: '14%' }, show: { left: '84%' } }}
        transition={{ duration: 1.2, delay: 0.5, ease: [0.6, 0, 0.2, 1] }}
      />
      <motion.span
        className="absolute -top-1 left-[70%] rounded-md bg-ink px-2 py-0.5 text-[11px] font-medium text-white"
        variants={{ hide: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.4, delay: 1.55 }}
      >
        66× the typical ratio
      </motion.span>
    </motion.div>
  )
}

/** A hash chain that seals one block after another. */
export function HashChain() {
  const hashes = ['9f2c…41', 'a07e…d3', '3b91…7c']
  return (
    <motion.div
      aria-hidden="true"
      className="mt-6 flex items-center gap-2"
      initial="hide"
      whileInView="show"
      viewport={once}
    >
      {hashes.map((h, i) => (
        <div key={h} className="flex items-center gap-2">
          <motion.span
            className={clsx(
              'rounded-lg border px-2.5 py-1.5 font-mono text-[11px]',
              i === hashes.length - 1
                ? 'border-accent/50 bg-accent-soft text-accent-ink'
                : 'border-line bg-bg text-ink-2',
            )}
            variants={{ hide: { opacity: 0, scale: 0.8 }, show: { opacity: 1, scale: 1 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 20, delay: i * 0.45 }}
          >
            {h}
          </motion.span>
          {i < hashes.length - 1 && (
            <motion.span
              className="h-px w-4 origin-left bg-line-strong"
              variants={{ hide: { scaleX: 0 }, show: { scaleX: 1 } }}
              transition={{ duration: 0.3, delay: i * 0.45 + 0.25 }}
            />
          )}
        </div>
      ))}
    </motion.div>
  )
}

/** A scatter with one unexplained outlier. */
export function OutlierDots() {
  const pts = [
    [18, 60],
    [26, 48],
    [30, 66],
    [36, 54],
    [42, 62],
    [48, 50],
    [22, 74],
    [52, 70],
    [34, 40],
    [44, 76],
  ] as const
  return (
    <motion.div
      aria-hidden="true"
      className="relative mt-6 h-32 rounded-xl border border-line bg-bg/60"
      initial="hide"
      whileInView="show"
      viewport={once}
    >
      <motion.span
        className="absolute top-[36%] left-[14%] h-[52%] w-[44%] rounded-[50%] border border-dashed border-muted/40"
        variants={{ hide: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1 } }}
        transition={{ duration: 0.6, delay: 0.5, ease }}
      />
      {pts.map(([x, y], i) => (
        <motion.span
          key={`${x}-${y}`}
          className="absolute size-2.5 rounded-full"
          style={{ left: `${x}%`, top: `${y}%`, background: 'var(--viz-context)' }}
          variants={{ hide: { opacity: 0, scale: 0 }, show: { opacity: 1, scale: 1 } }}
          transition={{ type: 'spring', stiffness: 400, damping: 18, delay: i * 0.04 }}
        />
      ))}
      <motion.span
        className="absolute top-[18%] left-[80%] size-3.5"
        variants={{ hide: { opacity: 0, scale: 0 }, show: { opacity: 1, scale: 1 } }}
        transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.9 }}
      >
        <span
          className="absolute inset-0 rounded-full opacity-40 motion-safe:animate-ping"
          style={{ background: 'var(--fam-anomaly)' }}
        />
        <span className="absolute inset-0 rounded-full" style={{ background: 'var(--fam-anomaly)' }} />
      </motion.span>
      <motion.span
        className="absolute top-[34%] left-[62%] text-[11px] font-medium text-ink-2"
        variants={{ hide: { opacity: 0, x: 8 }, show: { opacity: 1, x: 0 } }}
        transition={{ duration: 0.4, delay: 1.15 }}
      >
        No rule explains this
      </motion.span>
    </motion.div>
  )
}

/* ───────────────────────────────────── results band (on the dark background) */

/** A tally of dots that light up one after another: `lit` of `total`. */
export function DotTally({ lit, total, cols = 10 }: { lit: number; total: number; cols?: number }) {
  return (
    <motion.div
      aria-hidden="true"
      className="grid w-fit gap-1.5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      initial="hide"
      whileInView="show"
      viewport={once}
    >
      {Array.from({ length: total }, (_, i) => (
        <motion.span
          key={i}
          className={clsx('rounded-full', cols > 10 ? 'size-2' : 'size-2.5')}
          variants={{
            hide: { backgroundColor: 'rgba(255,255,255,0.12)', scale: 0.6 },
            show: { backgroundColor: i < lit ? '#d98a06' : 'rgba(255,255,255,0.16)', scale: 1 },
          }}
          transition={{ duration: 0.35, delay: 0.2 + i * (1.2 / total) }}
        />
      ))}
    </motion.div>
  )
}

/** Two bars: the effort needed working at random against working down Nirikshak's list. */
export function EffortBars() {
  const rows = [
    ['Random order', 32, 'rgba(255,255,255,0.22)'],
    ['Nirikshak', 16, '#d98a06'],
  ] as const
  return (
    <motion.div aria-hidden="true" className="w-full space-y-2" initial="hide" whileInView="show" viewport={once}>
      {rows.map(([label, n, bg], i) => (
        <div key={label} className="flex items-center gap-3 text-[11px] text-white/55">
          <span className="w-20 shrink-0">{label}</span>
          <div className="h-2.5 flex-1">
            <motion.div
              className="h-full origin-left rounded-full"
              style={{ width: `${(n / 32) * 100}%`, background: bg }}
              variants={{ hide: { scaleX: 0 }, show: { scaleX: 1 } }}
              transition={{ duration: 0.9, delay: 0.2 + i * 0.25, ease }}
            />
          </div>
          <span className="num w-5 text-right text-white/80">{n}</span>
        </div>
      ))}
    </motion.div>
  )
}

/** A half-circle gauge filled to `value` (0 to 1). */
export function ArcGauge({ value }: { value: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 64" className="h-14 w-auto">
      <path
        d="M8 60 A52 52 0 0 1 112 60"
        fill="none"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <motion.path
        d="M8 60 A52 52 0 0 1 112 60"
        fill="none"
        stroke="#d98a06"
        strokeWidth="8"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: value }}
        viewport={once}
        transition={{ duration: 1.6, delay: 0.2, ease }}
      />
    </svg>
  )
}

/** A stopwatch dial sweeping to `seconds` of a minute. */
export function StopwatchDial({ seconds }: { seconds: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className="size-14 -rotate-90">
      <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="6" />
      <motion.circle
        cx="32"
        cy="32"
        r="26"
        fill="none"
        stroke="#d98a06"
        strokeWidth="6"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: seconds / 60 }}
        viewport={once}
        transition={{ duration: 1.4, delay: 0.2, ease: 'linear' }}
      />
    </svg>
  )
}
