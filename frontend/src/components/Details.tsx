/**
 * "Peeling the onion": progressive disclosure. The summary stays short; "View details"
 * reveals the next layer in place, and layers can nest (each deeper one is inset with a
 * rail, so it is always clear how far down you are).
 */
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useId, useState } from 'react'

export function Details({
  children,
  label = 'View details',
  openLabel = 'Hide details',
  defaultOpen = false,
  nested = false,
  className,
  onToggle,
}: {
  children: ReactNode
  label?: string
  openLabel?: string
  defaultOpen?: boolean
  /** Inset with a rail: use for a second or third layer inside another one. */
  nested?: boolean
  className?: string
  onToggle?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open)
          onToggle?.(!open)
        }}
        className="group inline-flex items-center gap-1.5 rounded-lg py-1 text-[13px] font-medium text-accent-ink transition-colors hover:text-ink"
      >
        {open ? openLabel : label}
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={clsx('transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <div
              className={clsx(
                'mt-3',
                nested && 'rounded-xl border-l-2 border-accent/60 bg-surface-2/60 py-4 pr-4 pl-5',
              )}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A labelled fact inside a details layer: small label above, value below. */
export function Fact({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
      {hint && <dd className="mt-0.5 text-xs text-muted">{hint}</dd>}
    </div>
  )
}
