import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { GlossaryKey } from '@/lib/glossary'
import { InfoTip } from './Tooltip'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-2xl border border-line bg-surface shadow-card', className)}>
      {children}
    </section>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
  help,
  helpText,
}: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
  /** Glossary term explained by a (?) next to the title. */
  help?: GlossaryKey
  helpText?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 px-7 pt-6 pb-5">
      <div className="min-w-0 max-w-3xl">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-ink">
          {title}
          {(help || helpText) && <InfoTip term={help} text={helpText} />}
        </h2>
        {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

/** Standard inner padding for card bodies. */
export const cardBody = 'px-7 pb-7'

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  accepted: { label: 'Accepted', className: 'bg-ok/10 text-ok ring-ok/25' },
  accepted_with_warnings: {
    label: 'Accepted with warnings',
    className: 'bg-sev-medium/10 text-sev-medium ring-sev-medium/25',
  },
  rejected: { label: 'Rejected', className: 'bg-sev-critical/10 text-sev-critical ring-sev-critical/25' },
  processing: { label: 'Processing', className: 'bg-accent-soft text-accent-ink ring-accent/30' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { label: status, className: 'bg-surface-2 text-muted ring-line' }
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        s.className,
      )}
    >
      {s.label}
    </span>
  )
}

export function Button({
  children,
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'accent' }) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'primary' && 'bg-ink text-white shadow-sm hover:bg-ink-2',
        variant === 'accent' && 'bg-accent text-ink shadow-sm hover:brightness-105',
        variant === 'ghost' && 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
        className,
      )}
    >
      {children}
    </button>
  )
}

export const inputClass =
  'w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:opacity-50'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  )
}

/** Shown while a code-split page chunk loads (usually a few hundred milliseconds). */
export function PageLoading() {
  return (
    <div role="status" aria-live="polite" className="p-12 text-sm text-muted">
      Loading…
    </div>
  )
}
