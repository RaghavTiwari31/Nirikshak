/**
 * The four steps as a scroll story. On wide screens the steps scroll past a pinned panel that
 * acts out the current step; on phones each step shows its own panel inline.
 */
import clsx from 'clsx'
import { Check, FileSpreadsheet, Gauge, ListOrdered, Lock, ShieldCheck, Upload, X } from 'lucide-react'
import { AnimatePresence, motion, useInView } from 'motion/react'
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from 'react'

const STEPS: [ComponentType<{ size?: number; className?: string }>, string, string][] = [
  [
    Upload,
    'Upload',
    'Entities send their monthly files. Columns are matched automatically and every file gets a quality report.',
  ],
  [
    Gauge,
    'Analyse',
    '22 checks run over every entity in under a minute, comparing each one with its peers and its own history.',
  ],
  [
    ListOrdered,
    'Prioritise',
    'Entities are ranked by attention score, with the reasons behind each score one click away.',
  ],
  [
    ShieldCheck,
    'Decide',
    'Supervisors check the records the tool picked, plus a random few, and record their decision.',
  ],
]

const PANELS = [UploadPanel, AnalysePanel, PrioritisePanel, DecidePanel]
const ease = [0.2, 0, 0, 1] as const

export function HowItWorks() {
  const [active, setActive] = useState(0)
  const Panel = PANELS[active] ?? UploadPanel
  return (
    <div className="mt-16 grid gap-10 text-left lg:grid-cols-[1fr_1.1fr] lg:gap-16">
      <ol className="relative min-w-0">
        {/* Progress rail, from the first step's icon to the last one's */}
        <span aria-hidden="true" className="absolute inset-y-[18vh] left-6 hidden w-px bg-line lg:block" />
        <motion.span
          aria-hidden="true"
          className="absolute inset-y-[18vh] left-6 hidden w-px origin-top bg-accent lg:block"
          initial={false}
          animate={{ scaleY: active / (STEPS.length - 1) }}
          transition={{ duration: 0.5, ease }}
        />
        {STEPS.map(([Icon, title, body], i) => (
          <Step key={title} index={i} active={active === i} onEnter={setActive} Icon={Icon} title={title} body={body} />
        ))}
      </ol>
      <div className="hidden lg:block">
        <div className="sticky top-28">
          <PanelFrame step={active}>
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
                transition={{ duration: 0.35, ease }}
              >
                <Panel />
              </motion.div>
            </AnimatePresence>
          </PanelFrame>
        </div>
      </div>
    </div>
  )
}

function Step({
  index,
  active,
  onEnter,
  Icon,
  title,
  body,
}: {
  index: number
  active: boolean
  onEnter: (i: number) => void
  Icon: ComponentType<{ size?: number; className?: string }>
  title: string
  body: string
}) {
  const ref = useRef<HTMLLIElement>(null)
  // "Current" means the step crosses the middle band of the screen.
  const inBand = useInView(ref, { margin: '-45% 0px -45% 0px' })
  useEffect(() => {
    if (inBand) onEnter(index)
  }, [inBand, index, onEnter])
  const Panel = PANELS[index] ?? UploadPanel

  return (
    <li
      ref={ref}
      className="relative grid grid-cols-[3rem_minmax(0,1fr)] gap-x-5 pb-12 lg:flex lg:min-h-[36vh] lg:items-center lg:pb-0"
    >
      <span
        className={clsx(
          'relative z-10 flex size-12 shrink-0 items-center justify-center rounded-2xl border shadow-card transition-colors duration-300',
          active ? 'border-ink bg-ink text-accent' : 'border-line bg-surface text-accent-ink',
        )}
      >
        <Icon size={20} />
        <span className="num absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-ink">
          {index + 1}
        </span>
      </span>
      <div className={clsx('min-w-0 flex-1 transition-opacity duration-300', !active && 'lg:opacity-40')}>
        <p className="mt-2.5 text-xl font-semibold">{title}</p>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-2">{body}</p>
      </div>
      {/* Phones and tablets: each step carries its own panel, full width. */}
      <div className="col-span-2 mt-6 min-w-0 lg:hidden">
        <PanelFrame step={index}>
          <Panel />
        </PanelFrame>
      </div>
    </li>
  )
}

function PanelFrame({ step, children }: { step: number; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-[0_30px_80px_-40px_rgb(31_35_40/0.4)] sm:p-8">
      <div className="bg-dot-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      <div className="relative mb-6 flex items-center justify-between text-[12px] font-medium text-muted">
        <span>Step {step + 1} of 4</span>
        <span className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={clsx(
                'h-1.5 rounded-full transition-all duration-300',
                i === step ? 'w-6 bg-accent' : 'w-1.5 bg-line-strong',
              )}
            />
          ))}
        </span>
      </div>
      <div className="relative min-h-[300px]">{children}</div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────── panels */

function UploadPanel() {
  const files = [
    ['alerts.csv', '48,210 rows', 'Quality 100%'],
    ['cases.csv', '3,904 rows', 'Quality 100%'],
    ['assets.csv', '612 rows', '2 notes'],
    ['log_volume.csv', '11,160 rows', 'Quality 100%'],
  ] as const
  return (
    <ul className="space-y-3">
      {files.map(([name, rows, q], i) => (
        <motion.li
          key={name}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: i * 0.15, ease }}
          className="rounded-2xl border border-line bg-bg/70 p-4"
        >
          <div className="flex items-center gap-3 text-sm">
            <FileSpreadsheet size={18} className="text-accent-ink" />
            <span className="font-medium">{name}</span>
            <span className="num hidden text-muted sm:inline">{rows}</span>
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.9 + i * 0.15 }}
              className={clsx(
                'ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                q === '2 notes' ? 'bg-accent-soft text-accent-ink' : 'bg-ok/10 text-ok',
              )}
            >
              {q}
            </motion.span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
            <motion.div
              className="h-full origin-left rounded-full bg-ink"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.7, delay: 0.2 + i * 0.15, ease }}
            />
          </div>
        </motion.li>
      ))}
    </ul>
  )
}

function AnalysePanel() {
  const [done, setDone] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setDone((d) => (d >= 22 ? d : d + 1)), 70)
    return () => clearInterval(id)
  }, [])
  const families = ['Claims vs records', 'Missing evidence', 'Peer comparison', 'Trends', 'Anomalies']
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="num text-5xl font-semibold tracking-tight">
            {done}
            <span className="text-muted">/22</span>
          </p>
          <p className="mt-1 text-sm text-ink-2">checks run across 40 entities</p>
        </div>
        <p className="num rounded-full bg-ink px-3 py-1 text-[12px] font-medium text-white">
          {((done / 22) * 39).toFixed(0)} s
        </p>
      </div>
      <div className="mt-6 grid grid-cols-11 gap-1.5">
        {Array.from({ length: 22 }, (_, i) => (
          <span
            key={i}
            className={clsx(
              'aspect-square rounded-md transition-all duration-300',
              i < done ? 'scale-100 bg-accent' : 'scale-90 bg-line',
            )}
          />
        ))}
      </div>
      <ul className="mt-6 flex flex-wrap gap-2">
        {families.map((f, i) => (
          <motion.li
            key={f}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.25 }}
            className="flex items-center gap-1.5 rounded-full border border-line bg-bg px-3 py-1 text-[12px] font-medium text-ink-2"
          >
            <Check size={12} className="text-ok" /> {f}
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

function PrioritisePanel() {
  const entities = [
    ['Port operations', 34],
    ['Power generation', 89],
    ['Rail signalling', 41],
    ['State data centre', 73],
    ['Regional bank', 18],
  ] as const
  const [sorted, setSorted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSorted(true), 700)
    return () => clearTimeout(t)
  }, [])
  const rows = sorted ? [...entities].sort((a, b) => b[1] - a[1]) : entities
  return (
    <ul className="space-y-2.5">
      {rows.map(([name, score], i) => {
        const tone =
          score >= 75
            ? 'var(--sev-critical)'
            : score >= 50
              ? 'var(--sev-high)'
              : score >= 25
                ? 'var(--sev-medium)'
                : 'var(--sev-low)'
        return (
          <motion.li
            key={name}
            layout
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="flex items-center gap-3 rounded-2xl border border-line bg-bg/70 px-4 py-3 text-sm"
          >
            <span className="num w-4 text-muted">{sorted ? i + 1 : '·'}</span>
            <span className="flex-1 font-medium">{name}</span>
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
              <motion.span
                className="block h-full origin-left rounded-full"
                style={{ background: tone }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: sorted ? score / 100 : 0 }}
                transition={{ duration: 0.8, ease }}
              />
            </span>
            <span className="num w-7 text-right font-semibold">{sorted ? score : '–'}</span>
          </motion.li>
        )
      })}
    </ul>
  )
}

function DecidePanel() {
  const [decided, setDecided] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDecided(true), 1300)
    return () => clearTimeout(t)
  }, [])
  return (
    <div>
      <div className="rounded-2xl border border-line bg-bg/70 p-5">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-sev-critical uppercase">
          Critical · 92% confidence
        </p>
        <p className="mt-2 font-semibold">Closures bunch up just before the fix-time deadline</p>
        <p className="mt-1 text-sm text-ink-2">
          264 critical alerts closed in the last minutes before the 4-hour limit.
        </p>
        <div className="mt-4 flex gap-2">
          <span
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-300',
              decided ? 'scale-105 bg-ok text-white shadow-pop' : 'border border-line-strong bg-surface text-ink',
            )}
          >
            <Check size={15} /> {decided ? 'Accepted' : 'Accept'}
          </span>
          <span
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-opacity duration-300',
              decided && 'opacity-40',
            )}
          >
            <X size={15} /> Reject
          </span>
        </div>
      </div>
      <AnimatePresence>
        {decided && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            transition={{ duration: 0.45, ease }}
            className="overflow-hidden"
          >
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-[13px] text-white">
              <Lock size={15} className="text-accent" />
              <span className="flex-1">Decision sealed into the audit log</span>
              <span className="font-mono text-[11px] text-white/60">#a07e…d3</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
