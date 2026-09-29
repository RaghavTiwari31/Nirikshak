/**
 * Accessible tooltips. The bubble renders in a portal with fixed positioning, so it is never
 * clipped by a card, table or scroll area. It opens on hover and on keyboard focus, closes
 * on Escape, and is linked to its trigger with aria-describedby.
 */
import clsx from 'clsx'
import { CircleHelp } from 'lucide-react'
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { GLOSSARY, type GlossaryKey } from '@/lib/glossary'

const GAP = 8
const MAX_W = 300

interface Pos {
  top: number
  left: number
  placement: 'top' | 'bottom'
}

function Bubble({ id, anchor, children }: { id: string; anchor: HTMLElement; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Pos | null>(null)

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect()
      const b = ref.current?.getBoundingClientRect()
      const h = b?.height ?? 40
      const w = b?.width ?? MAX_W
      const placement = a.top - h - GAP < 8 ? 'bottom' : 'top'
      const top = placement === 'top' ? a.top - h - GAP : a.bottom + GAP
      const left = Math.min(Math.max(8, a.left + a.width / 2 - w / 2), window.innerWidth - w - 8)
      setPos({ top, left, placement })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [anchor])

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className="pointer-events-none fixed z-[100] rounded-xl bg-ink px-3.5 py-2.5 text-[13px] leading-relaxed font-normal text-white shadow-pop"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxWidth: MAX_W, opacity: pos ? 1 : 0 }}
    >
      {children}
    </div>,
    document.body,
  )
}

/** Wrap any focusable element (or plain text) to give it a tooltip. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactElement | string }) {
  const id = useId()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((e: { currentTarget: EventTarget }) => {
    window.clearTimeout(timer.current)
    const el = e.currentTarget as HTMLElement
    timer.current = window.setTimeout(() => setAnchor(el), 120)
  }, [])
  const hide = useCallback(() => {
    window.clearTimeout(timer.current)
    setAnchor(null)
  }, [])

  useEffect(() => {
    if (!anchor) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anchor, hide])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const handlers = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    'aria-describedby': anchor ? id : undefined,
  }
  const trigger = isValidElement<Record<string, unknown>>(children) ? (
    cloneElement(children, handlers)
  ) : (
    <span tabIndex={0} className="cursor-help underline decoration-dotted decoration-muted/60 underline-offset-4" {...handlers}>
      {children}
    </span>
  )
  return (
    <>
      {trigger}
      {anchor && (
        <Bubble id={id} anchor={anchor}>
          {content}
        </Bubble>
      )}
    </>
  )
}

/** A small (?) icon that explains the thing next to it. */
export function InfoTip({
  term,
  text,
  label = 'What does this mean?',
  className,
}: {
  term?: GlossaryKey
  text?: ReactNode
  label?: string
  className?: string
}) {
  return (
    <Tooltip content={text ?? (term ? GLOSSARY[term] : '')}>
      <button
        type="button"
        aria-label={label}
        className={clsx(
          'inline-flex shrink-0 items-center justify-center rounded-full align-middle text-muted/80 transition-colors hover:text-accent-ink',
          className,
        )}
      >
        <CircleHelp size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </Tooltip>
  )
}

/** Inline jargon with a dotted underline and a plain-language explanation on hover. */
export function Term({ term, children }: { term: GlossaryKey; children: string }) {
  return <Tooltip content={GLOSSARY[term]}>{children}</Tooltip>
}
