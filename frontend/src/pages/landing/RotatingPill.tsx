/**
 * The hero's rotating phrase in a dark pill. Based on React Bits' RotatingText
 * (https://reactbits.dev, MIT + Commons Clause), reworked so the pill resizes smoothly.
 *
 * Every phrase is measured up front in an invisible copy with the same markup, so the pill knows
 * its next size before the text changes and springs its real width and height to it. The old
 * phrase leaves and the new one arrives at the same time, each laid out at its own final size, so
 * nothing reflows mid-animation and the text never stretches.
 */
import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

type Size = { w: number; h: number }

/** Shared by the measuring copy and the visible text, so both wrap identically. */
const PAD = 'px-4 pt-1 pb-2 sm:px-6'

export function RotatingPill({ texts, interval = 2800 }: { texts: string[]; interval?: number }) {
  const [index, setIndex] = useState(0)
  const [sizes, setSizes] = useState<Size[] | null>(null)
  const wrap = useRef<HTMLSpanElement>(null)
  const probes = useRef<(HTMLSpanElement | null)[]>([])

  const measure = useCallback(() => {
    setSizes(
      probes.current.map((el) => {
        const r = el?.getBoundingClientRect()
        return { w: Math.ceil(r?.width ?? 0), h: Math.ceil(r?.height ?? 0) }
      }),
    )
  }, [])

  // Measure before first paint, again when the available width changes and once web fonts land.
  useLayoutEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (wrap.current) ro.observe(wrap.current)
    document.fonts?.ready.then(measure).catch(() => undefined)
    return () => ro.disconnect()
  }, [measure])

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % texts.length), interval)
    return () => clearInterval(id)
  }, [texts.length, interval])

  const size = sizes?.[index]

  return (
    <span ref={wrap} className="relative flex w-full justify-center">
      {/* A stable reading for screen readers; the rotation is decoration. */}
      <span className="sr-only">{texts[0]}</span>

      <span aria-hidden="true" className="pointer-events-none invisible absolute inset-x-0 top-0">
        {texts.map((t, k) => (
          <span
            key={t}
            ref={(el) => {
              probes.current[k] = el
            }}
            className={clsx(PAD, 'absolute top-0 left-0 block w-fit max-w-full text-center')}
          >
            <Phrase text={t} />
          </span>
        ))}
      </span>

      {/* The size eases with a CSS transition: cheap, and it never waits on a JS animation to start.
          The curve overshoots a touch, like a soft spring. */}
      <span
        aria-hidden="true"
        className="relative block overflow-hidden rounded-2xl bg-ink text-accent shadow-[0_18px_40px_-18px_rgb(31_35_40/0.55)] transition-[width,height] duration-700 ease-[cubic-bezier(0.34,1.25,0.64,1)] motion-reduce:transition-none"
        style={size ? { width: size.w, height: size.h } : { visibility: 'hidden' }}
      >
        {/* A faint sheen that sweeps across the pill on each change. */}
        <motion.span
          key={`sheen-${index}`}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          initial={{ x: '-120%' }}
          animate={{ x: '420%' }}
          transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1] }}
        />
        <AnimatePresence initial={false}>
          {size && (
            <motion.span
              key={index}
              className={clsx(PAD, 'absolute top-0 left-1/2 block -translate-x-1/2 text-center')}
              style={{ width: size.w }}
              exit={{ opacity: 0, transition: { duration: 0.25, delay: 0.2 } }}
            >
              <Phrase text={texts[index] ?? ''} animated />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </span>
  )
}

/** Words that never break mid-word; with `animated`, letters rise in and lift out in a wave. */
function Phrase({ text, animated = false }: { text: string; animated?: boolean }) {
  const words = text.split(' ')
  const starts = words.map((_, i) => words.slice(0, i).reduce((n, w) => n + w.length, 0))
  return words.map((word, wi) => (
    <span key={wi}>
      <span className="inline-block overflow-hidden pb-[0.12em] align-top whitespace-nowrap">
        {Array.from(word).map((ch, ci) => {
          const n = (starts[wi] ?? 0) + ci
          return animated ? (
            <motion.span
              key={ci}
              className="inline-block will-change-transform"
              initial={{ y: '110%', opacity: 0, filter: 'blur(8px)' }}
              animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
              exit={{
                y: '-110%',
                opacity: 0,
                filter: 'blur(6px)',
                transition: { duration: 0.32, delay: n * 0.01, ease: [0.4, 0, 1, 1] },
              }}
              transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.08 + n * 0.022 }}
            >
              {ch}
            </motion.span>
          ) : (
            <span key={ci} className="inline-block">
              {ch}
            </span>
          )
        })}
      </span>
      {wi < words.length - 1 && ' '}
    </span>
  ))
}
