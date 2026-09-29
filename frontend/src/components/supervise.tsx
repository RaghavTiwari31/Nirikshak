/** Small presentational pieces shared by the supervisory screens. */
import clsx from 'clsx'
import { AlertOctagon, AlertTriangle, ChevronRight, CircleDot, Info } from 'lucide-react'
import { Link } from 'react-router'
import type { ReactNode } from 'react'
import { GLOSSARY, type GlossaryKey } from '@/lib/glossary'
import { BAND_LABEL, saiBand, SEVERITY_LABEL, severityColor, severityInk, type SeverityLevel } from '@/lib/severity'
import { InfoTip, Tooltip } from './Tooltip'

const SEV_ICON = { 1: Info, 2: CircleDot, 3: AlertTriangle, 4: AlertOctagon } as const

/** Severity: icon + word in the severity's text colour, never colour alone. */
export function SeverityTag({ level, className }: { level: number; className?: string }) {
  const lv = Math.min(4, Math.max(1, level)) as SeverityLevel
  const Icon = SEV_ICON[lv]
  return (
    <Tooltip content={`${SEVERITY_LABEL[lv]} severity. ${GLOSSARY.severity}`}>
      <span
        tabIndex={0}
        className={clsx('inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap', className)}
        style={{ color: severityInk(lv) }}
      >
        <Icon size={13} aria-hidden="true" /> {SEVERITY_LABEL[lv]}
      </span>
    </Tooltip>
  )
}

/** Attention score with its band word, e.g. "73 · Attention". Hover explains the scale. */
export function SaiPill({ sai, size = 'sm' }: { sai: number; size?: 'sm' | 'lg' }) {
  const band = saiBand(sai)
  const mark = severityColor(band)
  return (
    <Tooltip content={GLOSSARY.attention}>
      <span
        tabIndex={0}
        className={clsx(
          'inline-flex cursor-help items-center gap-2 rounded-full font-medium whitespace-nowrap ring-1 ring-inset',
          size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-1 text-xs',
        )}
        style={{
          color: severityInk(band),
          background: `color-mix(in srgb, ${mark} 11%, var(--surface))`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${mark} 32%, transparent)`,
        }}
      >
        <span className="size-2 rounded-full" style={{ background: mark }} aria-hidden="true" />
        <span className="num font-semibold">{sai.toFixed(0)}</span>
        <span>{BAND_LABEL[band]}</span>
      </span>
    </Tooltip>
  )
}

/** A horizontal meter (0-100) with an optional peer-median tick. */
export function Meter({
  value,
  peer,
  color = 'var(--viz-entity)',
  thick = false,
}: {
  value: number
  peer?: number
  color?: string
  thick?: boolean
}) {
  return (
    <span className={clsx('relative block w-full rounded-full bg-surface-2', thick ? 'h-2.5' : 'h-2')}>
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${Math.max(2, value)}%`, background: color }}
      />
      {peer !== undefined && (
        <span
          className="absolute -top-1.5 -bottom-1.5 w-[3px] rounded-full ring-2 ring-surface"
          style={{ left: `calc(${peer}% - 1.5px)`, background: 'var(--viz-median)' }}
          aria-hidden="true"
        />
      )}
    </span>
  )
}

export function PageHeader({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-ink">{eyebrow}</p>
        <h1 className="mt-2 text-[30px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {children && <div className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">{children}</div>}
      </div>
      {action && <div className="shrink-0 lg:pt-7">{action}</div>}
    </header>
  )
}

/** Page frame: generous, consistent gutters and vertical rhythm for every screen. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mx-auto max-w-[1360px] space-y-10 px-6 py-10 sm:px-10 lg:px-12', className)}>{children}</div>
}

/** A headline number with a plain-language label and an optional explanation. */
export function Stat({
  label,
  value,
  hint,
  help,
  helpText,
  tone,
  alert = false,
  to,
  children,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  help?: GlossaryKey
  helpText?: ReactNode
  tone?: string
  /** Tint the tile to draw the eye to a number that needs action. */
  alert?: boolean
  /** Make the tile a link to where the number comes from. */
  to?: string
  children?: ReactNode
}) {
  return (
    <div
      className={clsx(
        'relative rounded-2xl border p-6 shadow-card transition-shadow',
        alert ? 'border-sev-critical/25 bg-[color-mix(in_srgb,var(--health-bad)_6%,var(--surface))]' : 'border-line bg-surface',
        to && 'hover:shadow-pop',
      )}
    >
      {to && (
        <Link to={to} className="absolute inset-0 rounded-2xl" aria-label={`${label}: open`}>
          <ChevronRight size={16} className="absolute top-6 right-5 text-muted" aria-hidden="true" />
        </Link>
      )}
      <p className={clsx('flex items-center gap-1.5 text-sm', alert ? 'text-sev-critical' : 'text-muted')}>
        {label}
        {(help || helpText) && (
          <span className="relative z-10">
            <InfoTip term={help} text={helpText} />
          </span>
        )}
      </p>
      <p className="mt-3 text-[34px] leading-none font-semibold tracking-tight" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {hint && <p className="mt-2.5 text-[13px] leading-snug text-muted">{hint}</p>}
      {children}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/60 p-10 text-center text-sm leading-relaxed text-muted">
      {children}
    </div>
  )
}

/** Chart / table toggle so every chart has an accessible table twin. */
export function ViewToggle({ view, onChange }: { view: 'chart' | 'table'; onChange: (v: 'chart' | 'table') => void }) {
  return (
    <div className="flex rounded-xl border border-line bg-surface-2/70 p-1 text-xs" role="group" aria-label="View">
      {(['chart', 'table'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={clsx(
            'rounded-lg px-3 py-1.5 font-medium capitalize transition-colors',
            view === v ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

/** Segmented control for small filter sets. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { key: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap rounded-xl border border-line bg-surface-2/70 p-1 text-[13px]" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={clsx(
            'rounded-lg px-3.5 py-1.5 font-medium transition-colors',
            value === o.key ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A small heading that groups the cards beneath it ("Review Pipeline", "Problems"). */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="!mb-4 flex items-end justify-between gap-4 pt-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-2">{children}</h2>
      {action}
    </div>
  )
}

/** Underline tabs with counts, e.g. "All 40 · Priority 3 · Attention 11". */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { key: T; label: string; count?: number; tone?: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap gap-x-7 border-b border-line" role="tablist" aria-label={label}>
      {options.map((o) => {
        const active = value === o.key
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={clsx(
              '-mb-px flex items-center gap-2 border-b-2 pt-1 pb-3 text-sm font-medium transition-colors',
              active ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {o.tone && <span className="size-2 rounded-full" style={{ background: o.tone }} aria-hidden="true" />}
            {o.label}
            {o.count !== undefined && (
              <span
                className={clsx(
                  'num rounded-full px-2 py-0.5 text-xs',
                  active ? 'bg-ink text-white' : 'bg-surface-2 text-muted',
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Colour key for a coded chart or table. */
export function Legend({ items, className }: { items: { mark: string; label: string }[]; className?: string }) {
  return (
    <ul className={clsx('flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-2', className)} aria-label="Colour key">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span className="size-3 rounded-[4px]" style={{ background: i.mark }} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

/** A number coloured by its tone, with the tone's word available on hover. */
export function ToneValue({ value, tone, className }: { value: ReactNode; tone: { ink: string; label: string } | null; className?: string }) {
  if (!tone) return <span className={className}>{value}</span>
  return (
    <Tooltip content={tone.label}>
      <span tabIndex={0} className={clsx('num cursor-help font-semibold', className)} style={{ color: tone.ink }}>
        {value}
      </span>
    </Tooltip>
  )
}
