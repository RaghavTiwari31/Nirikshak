import { useMutation } from '@tanstack/react-query'
import { Check, Copy, FileSearch, KeyRound, ScanSearch, ShieldCheck } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Navigate } from 'react-router'
import { api } from '@/api/client'
import { BrandMark } from '@/components/BrandMark'
import { Button, Field, inputClass } from '@/components/ui'
import { type AuthUser, useAuth } from '@/store/auth'

interface TokenResponse {
  access_token: string
  user: AuthUser
}

interface Credentials {
  username: string
  password: string
}

/** Demo account for the hackathon build; unset (and hidden) in any real deployment. */
const DEMO: Credentials | null =
  import.meta.env.VITE_DEMO_USERNAME && import.meta.env.VITE_DEMO_PASSWORD
    ? { username: import.meta.env.VITE_DEMO_USERNAME, password: import.meta.env.VITE_DEMO_PASSWORD }
    : null

const POINTS = [
  {
    icon: FileSearch,
    title: 'Claims tested against records',
    body: 'Promised response times and round-the-clock cover, checked against what the alerts show.',
  },
  {
    icon: ScanSearch,
    title: 'Missing evidence found',
    body: 'Machines that should raise alerts but never do, compared with similar entities.',
  },
  {
    icon: ShieldCheck,
    title: 'Every finding traceable',
    body: 'Each score leads to its records, and every action is kept in a tamper-evident log.',
  },
] as const

export function LoginPage() {
  const token = useAuth((s) => s.token)
  const signIn = useAuth((s) => s.signIn)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: (creds: Credentials) =>
      api<TokenResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(creds),
      }),
    onSuccess: (res) => signIn(res.access_token, res.user),
  })

  if (token) return <Navigate to="/overview" replace />

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate({ username, password })
  }

  const useDemo = () => {
    if (!DEMO) return
    setUsername(DEMO.username)
    setPassword(DEMO.password)
    login.mutate(DEMO)
  }

  return (
    // The page scrolls itself and centres with auto margins, so nothing is ever clipped on a
    // short window (flex centring alone pushes overflowing content off the top).
    <div className="h-full overflow-y-auto bg-bg">
      <div className="grid min-h-full lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Brand panel */}
        <aside className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col">
          <Rings />
          <div className="relative flex min-h-full flex-col px-14 py-12">
            <div className="flex items-center gap-3">
              <BrandMark size={40} onDark />
              <div>
                <p className="text-lg leading-tight font-semibold tracking-tight">Nirikshak</p>
                <p className="text-[13px] text-white/60">SOC supervision</p>
              </div>
            </div>

            <div className="my-auto max-w-md py-14">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                Supervisory Analytics for SOC Assessment
              </p>
              <h1 className="mt-4 text-[34px] leading-[1.15] font-semibold tracking-tight">
                See which security teams need a closer look, and why.
              </h1>
              <ul className="mt-10 space-y-6">
                {POINTS.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] ring-1 ring-white/10">
                      <Icon size={19} className="text-accent" strokeWidth={1.9} />
                    </span>
                    <span>
                      <p className="text-[15px] font-semibold">{title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-white/65">{body}</p>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-white/45">SIH 2026 · NCIIPC problem statement · Runs fully offline</p>
          </div>
        </aside>

        {/* Sign-in panel */}
        <main className="flex min-h-full flex-col px-6 py-10 sm:px-12">
          <div className="mx-auto my-auto w-full max-w-[420px] py-6">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <BrandMark size={40} />
              <div>
                <p className="text-lg leading-tight font-semibold tracking-tight">Nirikshak</p>
                <p className="text-[13px] text-muted">SOC supervision</p>
              </div>
            </div>

            <h2 className="text-[28px] leading-tight font-semibold tracking-tight">Sign in</h2>
            <p className="mt-2 text-[15px] text-muted">Use the account your administrator gave you.</p>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              <Field label="Username">
                <input
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </Field>
              {login.isError && (
                <p role="alert" className="rounded-xl bg-sev-critical/8 px-4 py-3 text-sm text-sev-critical">
                  {login.error.message}
                </p>
              )}
              <Button type="submit" className="w-full py-3" disabled={login.isPending || !username || !password}>
                {login.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            {DEMO && (
              <>
                <div className="my-8 flex items-center gap-4 text-xs font-medium tracking-wide text-muted uppercase">
                  <span className="h-px flex-1 bg-line" /> or try the demo <span className="h-px flex-1 bg-line" />
                </div>
                <section aria-label="Demo account" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
                      <KeyRound size={17} className="text-accent-ink" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">Demo account · full admin access</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                        Explore with synthetic data. Nothing here is real.
                      </p>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DemoValue label="Username" value={DEMO.username} />
                    <DemoValue label="Password" value={DEMO.password} />
                  </dl>
                  <Button variant="accent" className="mt-4 w-full py-2.5" disabled={login.isPending} onClick={useDemo}>
                    Sign in with the demo account
                  </Button>
                </section>
              </>
            )}

            <p className="mt-10 text-xs leading-relaxed text-muted">
              For authorised supervisory staff only. Every sign-in and action is recorded in a tamper-evident log.
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}

function DemoValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-xl bg-surface-2/70 px-3.5 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-ink select-all">{value}</span>
        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            })
          }}
          className="rounded-md p-1 text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
        </button>
      </dd>
    </div>
  )
}

/** Faint concentric rings, echoing the entity map, anchored off the panel's corner. */
function Rings() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute -right-48 -bottom-48 size-[640px] text-accent"
      viewBox="0 0 640 640"
      fill="none"
    >
      {[110, 180, 250, 320].map((r, i) => (
        <circle
          key={r}
          cx="320"
          cy="320"
          r={r}
          stroke="currentColor"
          strokeOpacity={0.16 - i * 0.03}
          strokeDasharray={i % 2 ? '4 7' : undefined}
        />
      ))}
      <circle cx="320" cy="320" r="7" fill="currentColor" fillOpacity="0.35" />
      <circle cx="455" cy="178" r="6" fill="currentColor" fillOpacity="0.3" />
      <circle cx="170" cy="250" r="4" fill="currentColor" fillOpacity="0.25" />
    </svg>
  )
}
