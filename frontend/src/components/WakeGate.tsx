import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'
import { getHealth } from '@/api/client'
import { BrandMark } from './BrandMark'

const RETRY_MS = 3000
const ATTEMPT_TIMEOUT_MS = 10000

/**
 * Holds the app behind a branded "waking" screen until the API answers /health.
 * Render's free tier sleeps after 15 minutes idle; the first request can take up to a minute.
 */
export function WakeGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [degraded, setDegraded] = useState(false)

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | undefined
    const started = Date.now()
    const ticker = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)

    const attempt = async () => {
      const ctrl = new AbortController()
      const timeout = window.setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS)
      try {
        const health = await getHealth(ctrl.signal)
        if (cancelled) return
        if (health.status === 'ok') {
          setReady(true)
          return
        }
        setDegraded(true)
      } catch {
        /* still waking up */
      } finally {
        window.clearTimeout(timeout)
      }
      if (!cancelled) retryTimer = window.setTimeout(attempt, RETRY_MS)
    }
    void attempt()

    return () => {
      cancelled = true
      window.clearInterval(ticker)
      window.clearTimeout(retryTimer)
    }
  }, [])

  return (
    <AnimatePresence mode="wait">
      {ready ? (
        <motion.div key="app" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {children}
        </motion.div>
      ) : (
        <motion.div
          key="wake"
          className="flex h-full flex-col items-center justify-center gap-8 px-4 text-center"
          exit={{ opacity: 0 }}
        >
          <div className="relative flex h-40 w-40 items-center justify-center">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute inset-0 rounded-full border border-accent/60"
                initial={{ scale: 0.4, opacity: 0.8 }}
                animate={{ scale: 1.2, opacity: 0 }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
              />
            ))}
            <BrandMark size={56} />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold tracking-tight">Starting up…</p>
            <p className="text-sm text-muted">
              {degraded
                ? 'Almost there: waiting for the database to respond.'
                : 'The service starts on demand. This can take up to a minute.'}
            </p>
            <p className="num font-mono text-xs text-muted">{elapsed}s</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
