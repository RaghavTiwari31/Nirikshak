import clsx from 'clsx'
import { motion } from 'motion/react'
import { ChevronDown, CircleCheck, CircleX, Play, ShieldCheck } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import {
  isActive,
  type RunOut,
  useAudit,
  useEvaluation,
  useRun,
  useRuns,
  useSignalLibrary,
  useStartRun,
  useVerifyAudit,
} from '@/api/analysis'
import { Details, Fact } from '@/components/Details'
import { Page, PageHeader, Stat } from '@/components/supervise'
import { Pagination } from '@/components/Pagination'
import { table } from '@/components/table'
import { InfoTip, Tooltip } from '@/components/Tooltip'
import { Button, Card, CardHeader, cardBody } from '@/components/ui'
import { fmtDateTime, fmtInt, humanize } from '@/lib/format'
import { GLOSSARY } from '@/lib/glossary'
import { FAMILY_COLOR } from '@/lib/tones'
import { usePage } from '@/lib/usePage'
import { useAuth } from '@/store/auth'

const RUN_STATUS: Record<string, { label: string; className: string }> = {
  succeeded: { label: 'Finished', className: 'bg-ok/10 text-ok ring-ok/25' },
  running: { label: 'Running', className: 'bg-accent-soft text-accent-ink ring-accent/30' },
  queued: { label: 'Waiting', className: 'bg-surface-2 text-muted ring-line' },
  failed: { label: 'Failed', className: 'bg-sev-critical/10 text-sev-critical ring-sev-critical/25' },
}

/** Audit actions in plain words. */
const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'auth.login_throttled': 'Sign-in blocked (too many attempts)',
  'entity_profile.upsert': 'Entity details updated',
  'finding.feedback': 'Decision on a finding',
  'mapping.create': 'Column mapping saved',
  'review.outcome': 'Record checked',
  'review.export': 'Records downloaded',
  'run.complete': 'Analysis finished',
  'run.create': 'Analysis started',
  'run.failed': 'Analysis failed',
  'submission.ingest': 'Data uploaded',
  'synth.generate': 'Test data generated',
  'user.create': 'User created',
}

/** Colour per kind of action, so the log can be scanned by type. */
const ACTION_KIND: { prefix: string; label: string; mark: string }[] = [
  { prefix: 'auth.', label: 'Sign-in', mark: 'var(--sev-low)' },
  { prefix: 'run.', label: 'Analysis', mark: 'var(--fam-gap)' },
  { prefix: 'finding.', label: 'Decision', mark: 'var(--fam-anomaly)' },
  { prefix: 'review.', label: 'Review', mark: 'var(--fam-trend)' },
  { prefix: 'submission.', label: 'Data', mark: 'var(--accent)' },
  { prefix: 'mapping.', label: 'Data', mark: 'var(--accent)' },
  { prefix: 'entity_profile.', label: 'Data', mark: 'var(--accent)' },
  { prefix: 'synth.', label: 'Data', mark: 'var(--accent)' },
  { prefix: 'user.', label: 'Admin', mark: 'var(--fam-missing)' },
]

function ActionPill({ action }: { action: string }) {
  const kind = ACTION_KIND.find((k) => action.startsWith(k.prefix)) ?? { label: 'Other', mark: 'var(--sev-low)' }
  const blocked = action === 'auth.login_failed' || action === 'auth.login_throttled' || action === 'run.failed'
  const mark = blocked ? 'var(--health-bad)' : kind.mark
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-ink-2"
        style={{ background: `color-mix(in srgb, ${mark} 14%, var(--surface))` }}
      >
        <span className="size-2 rounded-full" style={{ background: mark }} aria-hidden="true" />
        {blocked ? 'Warning' : kind.label}
      </span>
      <span className={clsx('text-[13px] font-medium', blocked && 'text-sev-critical')}>{ACTION_LABEL[action] ?? action}</span>
    </span>
  )
}

function RunBadge({ status }: { status: string }) {
  const s = RUN_STATUS[status] ?? RUN_STATUS.queued!
  return (
    <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', s.className)}>
      {s.label}
    </span>
  )
}

function duration(r: RunOut): string {
  if (!r.started_at || !r.finished_at) return '—'
  const s = (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000
  return s < 90 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`
}

export function AuditRunsPage() {
  const role = useAuth((s) => s.user?.role)
  const canRun = role === 'admin' || role === 'supervisor'
  const runs = useRuns()
  const start = useStartRun()
  const [selected, setSelected] = useState<number | null>(null)
  const current = selected ?? runs.data?.[0]?.id ?? null
  const active = runs.data?.find((r) => isActive(r.status))
  const runPage = usePage(runs.data ?? [], 10)

  return (
    <Page>
      <PageHeader
        eyebrow="Operate"
        title="Activity Log"
        action={
          canRun && (
            <Tooltip content="Analyse every entity again using all data received so far. Takes about a minute.">
              <Button
                disabled={!!active || start.isPending}
                onClick={() => start.mutate(undefined, { onSuccess: (r) => setSelected(r.id) })}
              >
                <Play size={16} /> {active ? 'Analysis running…' : 'Run a new analysis'}
              </Button>
            </Tooltip>
          )
        }
      >
        Every analysis is recorded so it can be repeated with the same result, and every action anyone takes is written
        to a log that cannot be edited without it showing.
      </PageHeader>
      {start.isError && <p className="text-sm text-sev-critical">{start.error.message}</p>}
      {active && <ActiveRun run={active} />}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card className="overflow-hidden">
          <CardHeader title="Analyses" subtitle="Newest first. Select one for its details." help="run" />
          <div className={clsx(table.wrap, 'border-t border-line')}>
            <table className={clsx(table.table, 'min-w-[460px]')}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Analysis</th>
                  <th className={table.th}>Status</th>
                  <th className={clsx(table.th, 'text-right')}>Findings</th>
                  <th className={table.th}>Started</th>
                </tr>
              </thead>
              <tbody>
                {runPage.slice.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    className={clsx(table.row, 'cursor-pointer', current === r.id && 'bg-accent-soft')}
                  >
                    <td className={clsx(table.td, 'py-3.5')}>
                      <p className="num font-semibold">#{r.id}</p>
                      <p className="text-xs text-muted">by {r.triggered_by ?? 'system'}</p>
                    </td>
                    <td className={clsx(table.td, 'py-3.5')}>
                      <RunBadge status={r.status} />
                    </td>
                    <td className={clsx(table.td, 'num py-3.5 text-right')}>{r.status === 'succeeded' ? r.findings : '—'}</td>
                    <td className={clsx(table.td, 'py-3.5 text-[13px] whitespace-nowrap text-ink-2')}>
                      {r.started_at ? fmtDateTime(r.started_at) : 'waiting'}
                      <p className="num text-xs text-muted">took {duration(r)}</p>
                    </td>
                  </tr>
                ))}
                {runs.data?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-muted">
                      No analysis has been run yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={runPage.page}
            pages={runPage.pages}
            total={runPage.total}
            size={runPage.size}
            onChange={runPage.setPage}
            noun="analyses"
          />
        </Card>
        {current !== null && <RunDetailPanel id={current} />}
      </div>

      <AuditLog />
    </Page>
  )
}

function ActiveRun({ run }: { run: RunOut }) {
  const done = Number(run.progress.done ?? 0)
  const total = Number(run.progress.total ?? 0)
  const pct = total ? done / total : 0
  return (
    <Card className="p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p>
          Analysis <span className="num font-semibold">#{run.id}</span> is working through the entities
          {typeof run.progress.entity === 'string' && <span className="text-muted"> · now on {run.progress.entity}</span>}
        </p>
        <p className="num text-muted">
          {done} of {total || '…'}
        </p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full bg-accent"
          initial={false}
          animate={{ width: `${Math.max(pct * 100, 3)}%` }}
          transition={{ ease: 'easeOut' }}
        />
      </div>
    </Card>
  )
}

function RunDetailPanel({ id }: { id: number }) {
  const { data: run } = useRun(id)
  const lib = useSignalLibrary()
  const evaluation = useEvaluation(run?.status === 'succeeded' ? id : null)
  if (!run) return <Card className="p-10 text-sm text-muted">Loading analysis…</Card>
  const names = Object.fromEntries((lib.data?.signals ?? []).map((s) => [s.id, s.name]))
  const familyOf = Object.fromEntries((lib.data?.signals ?? []).map((s) => [s.id, s.family]))
  const bySignal = Object.entries(run.findings_by_signal).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...bySignal.map(([, n]) => n))
  const scores = new Map((evaluation.data?.signals ?? []).map((s) => [s.signal_id, s]))
  const errors = (run.progress.errors as string[] | undefined) ?? []

  return (
    <Card>
      <CardHeader
        title={`Analysis #${run.id}`}
        subtitle={`Covers ${run.window_start} to ${run.window_end} · ${run.entities_flagged} entities with findings`}
        action={<RunBadge status={run.status} />}
      />
      <div className={clsx(cardBody, 'space-y-7')}>
        {run.error && <p className="rounded-xl bg-sev-critical/8 px-4 py-3 text-sm text-sev-critical">{run.error}</p>}
        {errors.length > 0 && (
          <p className="text-sm text-sev-medium">{errors.length} check(s) hit an error during this analysis.</p>
        )}

        {evaluation.data && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat
              label="Problem entities found"
              value={`${evaluation.data.weak_caught} of ${evaluation.data.weak_entities}`}
              helpText="On test data with planted problems: how many problem entities this analysis found."
            />
            <Stat
              label="Healthy entities wrongly flagged"
              value={`${evaluation.data.healthy_flagged.length} of ${evaluation.data.healthy_entities}`}
              helpText="On test data: healthy entities that received any finding. Zero means no false alarms."
            />
          </div>
        )}

        {bySignal.length > 0 && (
          <div>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Findings by check</p>
              {evaluation.data && (
                <p className="flex items-center gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-health-good" /> Correct
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-[var(--health-bad)]" /> Wrong
                  </span>
                </p>
              )}
            </div>
            <ul className="space-y-3">
              {bySignal.map(([sig, n]) => {
                const score = scores.get(sig)
                const fp = score?.false_pos.length ?? 0
                return (
                  <li key={sig} className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-4 text-[13px]">
                    <span className="min-w-0">
                      <span className="block truncate text-ink-2">{names[sig] ?? sig}</span>
                      <span className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-2">
                        <span
                          style={{
                            width: `${((n - fp) / max) * 100}%`,
                            background: evaluation.data ? 'var(--health-good)' : (FAMILY_COLOR[familyOf[sig] ?? ''] ?? 'var(--ink)'),
                          }}
                        />
                        {fp > 0 && <span className="bg-[var(--health-bad)]" style={{ width: `${(fp / max) * 100}%` }} />}
                      </span>
                    </span>
                    <span className="num text-right font-medium">{n}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <Details label="Technical fingerprints" openLabel="Hide technical fingerprints">
          <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
            These codes pin down exactly what produced this analysis. Running the same code, settings and data again gives
            the same findings.
          </p>
          <dl className="grid gap-5 sm:grid-cols-3">
            <FingerprintFact label="Software version" value={run.code_version} />
            <FingerprintFact label="Settings fingerprint" value={run.config_sha256} help={GLOSSARY.fingerprint} />
            <FingerprintFact label="Data fingerprint" value={run.data_sha256} help="A unique code for the exact data this analysis read." />
          </dl>
          {evaluation.data?.ndcg_at_10 != null && (
            <p className="mt-4 text-[13px] text-muted">
              Ranking vs expert order: {evaluation.data.ndcg_at_10.toFixed(3)} (1.000 = perfect)
              {evaluation.data.precision_at_10 != null &&
                ` · top 10 that are real problems: ${Math.round(evaluation.data.precision_at_10 * 100)}%`}
            </p>
          )}
        </Details>
      </div>
    </Card>
  )
}

function FingerprintFact({ label, value, help }: { label: string; value: string | null; help?: string }) {
  return (
    <Fact label={<>{label} {help && <InfoTip text={help} />}</>}>
      <Tooltip content={value ?? '—'}>
        <span tabIndex={0} className="block truncate font-mono text-[13px] font-normal">
          {value ?? '—'}
        </span>
      </Tooltip>
    </Fact>
  )
}

function AuditLog() {
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const audit = useAudit(offset)
  const verify = useVerifyAudit()
  const total = audit.data?.total ?? 0

  // A fresh verification result goes stale as soon as new entries are appended.
  const reset = verify.reset
  useEffect(() => reset(), [total, reset])

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Audit Trail"
        subtitle={`${fmtInt(total)} entries. Each one is sealed together with the one before it, so no entry can be changed or removed without it showing.`}
        help="auditChain"
        action={
          <div className="flex flex-wrap items-center gap-3">
            {verify.data && (
              <motion.span
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={clsx(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium',
                  verify.data.ok ? 'bg-ok/10 text-ok' : 'bg-sev-critical/10 text-sev-critical',
                )}
              >
                {verify.data.ok ? <CircleCheck size={16} /> : <CircleX size={16} />}
                {verify.data.ok
                  ? `Nothing altered · ${fmtInt(verify.data.checked)} entries checked`
                  : `Altered at entry #${verify.data.first_broken_id}: ${verify.data.reason}`}
              </motion.span>
            )}
            <Tooltip content="Re-check every seal in the log to confirm nothing has been edited or deleted.">
              <Button variant="ghost" disabled={verify.isPending} onClick={() => verify.mutate()}>
                <ShieldCheck size={16} /> {verify.isPending ? 'Checking…' : 'Check the log is untouched'}
              </Button>
            </Tooltip>
          </div>
        }
      />
      <div className={clsx(table.wrap, 'border-t border-line')}>
        <table className={clsx(table.table, 'min-w-[760px]')}>
          <thead className={table.head}>
            <tr>
              <th className={clsx(table.th, 'w-20')}>Entry</th>
              <th className={table.th}>When</th>
              <th className={table.th}>Who</th>
              <th className={table.th}>What happened</th>
              <th className={table.th}>About</th>
              <th className={clsx(table.th, 'w-12')}>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {audit.data?.items.map((a) => {
              const isOpen = open === a.id
              const payload = Object.entries(a.payload as Record<string, unknown>)
              return (
                <Fragment key={a.id}>
                  <tr className={clsx(table.row, isOpen && 'border-b-0 bg-surface-2/40')}>
                    <td className={clsx(table.td, 'num py-3 text-[13px] text-muted')}>#{a.id}</td>
                    <td className={clsx(table.td, 'py-3 text-[13px] whitespace-nowrap')}>{fmtDateTime(a.ts)}</td>
                    <td className={clsx(table.td, 'py-3 text-[13px]')}>{a.actor}</td>
                    <td className={clsx(table.td, 'py-3')}>
                      <ActionPill action={a.action} />
                    </td>
                    <td className={clsx(table.td, 'py-3 text-[13px] text-muted')}>{a.object_ref ?? '—'}</td>
                    <td className={clsx(table.td, 'py-3')}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={`Details of entry ${a.id}`}
                        onClick={() => setOpen(isOpen ? null : a.id)}
                        className="rounded-lg p-1 text-muted hover:bg-surface hover:text-ink"
                      >
                        <ChevronDown size={16} className={clsx('transition-transform', isOpen && 'rotate-180')} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line/70 bg-surface-2/40">
                      <td />
                      <td colSpan={5} className="px-6 pb-5">
                        <dl className="grid gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-3">
                          <Fact label="Recorded as">{a.action}</Fact>
                          {payload.map(([k, v]) => (
                            <Fact key={k} label={humanize(k)}>
                              <span className="font-normal break-words">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                            </Fact>
                          ))}
                          <div className="sm:col-span-3">
                            <Fact label={<>Seal <InfoTip term="auditChain" /></>}>
                              <span className="font-mono text-xs font-normal break-all text-muted">{a.hash}</span>
                            </Fact>
                          </div>
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={Math.floor(offset / 10) + 1}
        pages={Math.max(1, Math.ceil(total / 10))}
        total={total}
        size={10}
        onChange={(p) => setOffset((p - 1) * 10)}
        noun="entries"
      />
    </Card>
  )
}
