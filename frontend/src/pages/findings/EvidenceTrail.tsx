import clsx from 'clsx'
import { motion } from 'motion/react'
import { Check, ChevronLeft, ChevronRight, CircleHelp, Fingerprint, X } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useSignalLibrary } from '@/api/analysis'
import {
  type EvidenceRow,
  type FindingDetail,
  useEvidence,
  useFeedback,
  useFinding,
  useGiveFeedback,
  type Verdict,
} from '@/api/supervise'
import { PeerStrip } from '@/components/charts/PeerStrip'
import { Details, Fact } from '@/components/Details'
import { SeverityTag } from '@/components/supervise'
import { InfoTip, Tooltip } from '@/components/Tooltip'
import { Button, inputClass } from '@/components/ui'
import { fmtDateTime, humanize } from '@/lib/format'
import { GLOSSARY } from '@/lib/glossary'
import { ASSET_LABEL } from '@/lib/labels'
import { fmtMetric, METRIC_LABEL } from '@/lib/signals'
import { CAPABILITY_LABEL, FAMILY_HELP, FAMILY_LABEL, fmtParam, PARAM_LABEL } from '@/lib/taxonomy'
import { useAuth } from '@/store/auth'

const VERDICTS: { key: Verdict; label: string; help: string; icon: typeof Check; tone: string }[] = [
  { key: 'accepted', label: 'Accept', help: 'The evidence supports this finding.', icon: Check, tone: 'var(--ok)' },
  {
    key: 'rejected',
    label: 'Reject',
    help: 'The finding is wrong or has an acceptable explanation.',
    icon: X,
    tone: 'var(--sev-critical-ink)',
  },
  {
    key: 'needs_info',
    label: 'Need more information',
    help: 'Ask the entity for an explanation before deciding.',
    icon: CircleHelp,
    tone: 'var(--sev-medium-ink)',
  },
]

/** Side panel: why a finding was raised, against whom, on what evidence, and what the
 * supervisor concluded. Each section can be peeled open for more depth. */
export function EvidenceTrail({ findingId, onClose }: { findingId: number; onClose: () => void }) {
  const { data: f } = useFinding(findingId)
  const lib = useSignalLibrary()
  const signal = lib.data?.signals.find((s) => s.id === f?.signal_id)
  const format = useCallback((v: number) => fmtMetric(f?.signal_id ?? '', v), [f?.signal_id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const details = (f?.details ?? {}) as Record<string, unknown>
  const z = typeof details.z === 'number' ? details.z : null
  const support = typeof details.support === 'number' ? details.support : null

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/25 backdrop-blur-[2px]" onClick={onClose}>
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Finding details"
        initial={{ x: 48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
        className="h-full w-full max-w-[760px] overflow-y-auto border-l border-line bg-bg shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {!f ? (
          <p className="p-10 text-sm text-muted">Loading finding…</p>
        ) : (
          <div>
            <header className="sticky top-0 z-10 border-b border-line bg-surface/95 px-10 pt-8 pb-6 backdrop-blur">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.12em] text-accent-ink">
                      {FAMILY_LABEL[f.family]}
                      {f.family in FAMILY_HELP && <InfoTip term={FAMILY_HELP[f.family as keyof typeof FAMILY_HELP]} />}
                    </span>
                    <SeverityTag level={f.severity} />
                    {f.status !== 'open' && <StatusChip status={f.status} />}
                  </div>
                  <h2 className="mt-3 text-[22px] leading-snug font-semibold tracking-tight">{f.title}</h2>
                  <p className="mt-1.5 text-sm text-muted">
                    {f.entity_name} · {CAPABILITY_LABEL[f.capability]}
                  </p>
                </div>
                <Tooltip content="Close (Esc)">
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="rounded-xl p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <X size={20} />
                  </button>
                </Tooltip>
              </div>
            </header>

            <div className="space-y-6 px-10 py-8">
              <section className="rounded-2xl border border-line bg-surface p-7 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">What was found</p>
                <p className="mt-3 text-[17px] leading-relaxed text-ink">{f.narrative}</p>
                {signal && <p className="mt-4 text-sm leading-relaxed text-ink-2">{signal.rationale}</p>}
              </section>

              <Step n={1} title="How Unusual Is It?" help="unusual">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Figure label={METRIC_LABEL[f.signal_id] ?? 'This entity'} value={format(f.metric_value ?? NaN)} strong />
                  <Figure
                    label="Typical for others"
                    value={f.peer_median !== null ? format(f.peer_median) : '—'}
                    help="peerMedian"
                  />
                  <Figure
                    label="How sure the tool is"
                    value={`${Math.round(f.confidence * 100)}%`}
                    hint={peerStanding(f)}
                    help="confidence"
                  />
                </div>
                {f.peers.length > 1 && (
                  <div className="mt-6">
                    <p className="mb-1 text-[13px] text-muted">
                      Each grey dot is another entity; the dark dot is {f.entity_code}; the line is the typical value.
                    </p>
                    <PeerStrip peers={f.peers} entityCode={f.entity_code} median={f.peer_median} format={format} height={150} />
                  </div>
                )}

                {signal && (
                  <Details nested className="mt-5" label="How the tool decided" openLabel="Hide how the tool decided">
                    <p className="text-sm leading-relaxed text-ink-2">{signal.description}</p>
                    <p className="mt-4 mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      It raises this finding only when all of these hold
                    </p>
                    <ul className="space-y-2 text-sm">
                      {Object.entries(signal.params).map(([k, v]) => (
                        <li key={k} className="flex items-baseline justify-between gap-4 border-b border-line/70 pb-2">
                          <span className="text-ink-2">{PARAM_LABEL[k] ?? humanize(k)}</span>
                          <span className="num font-semibold">{fmtParam(k, v)}</span>
                        </li>
                      ))}
                      {signal.peer_z_min !== null && (
                        <li className="flex items-baseline justify-between gap-4 border-b border-line/70 pb-2">
                          <span className="flex items-center gap-1.5 text-ink-2">
                            Unusual compared with others, at least <InfoTip term="unusual" />
                          </span>
                          <span className="num font-semibold">
                            {signal.peer_z_min}
                            {z !== null && <span className="ml-2 font-normal text-muted">(this entity: {z.toFixed(1)})</span>}
                          </span>
                        </li>
                      )}
                      <li className="flex items-baseline justify-between gap-4">
                        <span className="text-ink-2">Records needed, at least</span>
                        <span className="num font-semibold">
                          {signal.min_support}
                          {support !== null && <span className="ml-2 font-normal text-muted">(this entity: {support})</span>}
                        </span>
                      </li>
                    </ul>
                    <p className="mt-4 text-xs leading-relaxed text-muted">
                      These thresholds are the same for every entity and are listed under How Checks Work.
                    </p>
                  </Details>
                )}
              </Step>

              <Step n={2} title={`Supporting Records (${f.evidence_count})`}>
                <p className="mb-4 text-sm text-ink-2">
                  These are the entity’s own records that support the finding. Open any one to see all its details.
                </p>
                <EvidenceTable findingId={f.id} total={f.evidence_count} />
              </Step>

              <Step n={3} title="Your Decision">
                <Judgement findingId={f.id} />
              </Step>

              <Details label="Technical trace" openLabel="Hide technical trace" className="px-1">
                <dl className="grid grid-cols-2 gap-5 rounded-2xl border border-line bg-surface p-6 sm:grid-cols-4">
                  <Fact label={<>Analysis <InfoTip term="run" /></>}>#{f.run_id}</Fact>
                  <Fact label="Check">
                    {f.signal_id} v{f.signal_version}
                  </Fact>
                  <Fact label="Finding">#{f.id}</Fact>
                  <Fact label={<>Log <InfoTip term="auditChain" /></>}>Recorded</Fact>
                </dl>
                <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Fingerprint size={14} className="text-accent-ink" /> Every view, decision and export is written to the
                  tamper-evident activity log.
                </p>
              </Details>
            </div>
          </div>
        )}
      </motion.aside>
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium capitalize text-ink-2">
      {status.replace('_', ' ')}
    </span>
  )
}

/** "Higher than 38 of 39 others", in the direction that is worse for this signal. */
function peerStanding(f: FindingDetail): string | undefined {
  const self = f.peers.find((p) => p.entity_code === f.entity_code)
  if (!self || f.peers.length < 2 || f.metric_value === null) return undefined
  const others = f.peers.filter((p) => p.entity_code !== f.entity_code)
  const worseIsLow = (f.details as Record<string, unknown>).direction === 'low'
  const beaten = others.filter((p) => (worseIsLow ? p.value > self.value : p.value < self.value)).length
  return `${worseIsLow ? 'Lower' : 'Higher'} than ${beaten} of ${others.length} other entities`
}

function Step({
  n,
  title,
  help,
  children,
}: {
  n: number
  title: string
  help?: keyof typeof GLOSSARY
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-7 shadow-card">
      <h3 className="mb-5 flex items-center gap-3 text-[15px] font-semibold text-ink">
        <span className="num flex size-7 items-center justify-center rounded-full bg-accent-soft text-[13px] text-accent-ink">
          {n}
        </span>
        {title}
        {help && <InfoTip term={help} />}
      </h3>
      {children}
    </section>
  )
}

function Figure({
  label,
  value,
  strong,
  hint,
  help,
}: {
  label: string
  value: string
  strong?: boolean
  hint?: string
  help?: keyof typeof GLOSSARY
}) {
  return (
    <div className={clsx('rounded-xl border p-5', strong ? 'border-ink/15 bg-surface-2/70' : 'border-line bg-bg/50')}>
      <p className="flex items-center gap-1.5 text-[13px] text-muted">
        {label}
        {help && <InfoTip term={help} />}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
    </div>
  )
}

function describe(row: EvidenceRow): { primary: string; secondary: string } {
  const r = row.record as Record<string, string | number | boolean | null> | null
  if (row.record_type === 'aggregate' || !r) return { primary: row.note ?? 'Summary evidence', secondary: '' }
  if (row.record_type === 'alert') {
    const created = r.created_at ? fmtDateTime(String(r.created_at)) : ''
    const closed = r.closed_at ? ` → closed ${fmtDateTime(String(r.closed_at))}` : ' · still open'
    return {
      primary: `${String(r.severity)} ${String(r.category).replace(/_/g, ' ')} alert`,
      secondary: `${r.source_ref} · raised ${created}${closed}`,
    }
  }
  if (row.record_type === 'case') {
    return {
      primary: `${String(r.priority)}-priority case · ${r.escalated ? `escalated to ${r.escalation_level}` : 'not escalated'}`,
      secondary: `${r.source_ref} · opened ${r.opened_at ? fmtDateTime(String(r.opened_at)) : '—'}`,
    }
  }
  return {
    primary: `${ASSET_LABEL[String(r.asset_type)] ?? r.asset_type} · importance ${r.criticality} of 4`,
    secondary: `Machine code ${String(r.asset).slice(0, 12)}… (real name hidden)`,
  }
}

const TYPE_LABEL: Record<string, string> = { alert: 'Alert', case: 'Case', asset: 'Machine', aggregate: 'Summary' }

function EvidenceTable({ findingId, total }: { findingId: number; total: number }) {
  const [offset, setOffset] = useState(0)
  const { data, isPlaceholderData } = useEvidence(findingId, offset)
  return (
    <div className={clsx('space-y-4 transition-opacity', isPlaceholderData && 'opacity-60')}>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {data?.items.map((row) => {
          const d = describe(row)
          const r = row.record as Record<string, unknown> | null
          return (
            <li key={row.id} className="bg-surface px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  {TYPE_LABEL[row.record_type] ?? row.record_type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink first-letter:uppercase">{d.primary}</p>
                  {d.secondary && <p className="mt-0.5 text-[13px] text-muted">{d.secondary}</p>}
                  {row.note && row.record_type !== 'aggregate' && (
                    <p className="mt-1.5 text-[13px] font-medium text-accent-ink">Why it counts: {row.note}</p>
                  )}
                  {r && row.record_type !== 'aggregate' && (
                    <Details nested label="View record" openLabel="Hide record" className="mt-1">
                      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                        {Object.entries(r)
                          .filter(([, v]) => v !== null && v !== '')
                          .map(([k, v]) => (
                            <Fact key={k} label={humanize(k)}>
                              <span className="font-normal break-words">{fmtValue(k, v)}</span>
                            </Fact>
                          ))}
                      </dl>
                    </Details>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {total > 10 && (
        <div className="flex items-center justify-between text-[13px] text-muted">
          <span className="num">
            Showing {offset + 1}–{Math.min(offset + 10, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous records"
              disabled={offset === 0}
              onClick={() => setOffset(offset - 10)}
              className="rounded-lg border border-line-strong bg-surface p-1.5 hover:bg-surface-2 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Next records"
              disabled={offset + 10 >= total}
              onClick={() => setOffset(offset + 10)}
              className="rounded-lg border border-line-strong bg-surface p-1.5 hover:bg-surface-2 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function fmtValue(key: string, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'string' && /_at$/.test(key) && !Number.isNaN(Date.parse(v))) return fmtDateTime(v)
  if (typeof v === 'string' && v.length > 40 && /^[0-9a-f]+$/.test(v)) return `${v.slice(0, 12)}… (hidden name)`
  return String(v)
}

function Judgement({ findingId }: { findingId: number }) {
  const role = useAuth((s) => s.user?.role)
  const canJudge = role !== 'auditor'
  const history = useFeedback(findingId)
  const give = useGiveFeedback(findingId)
  const [comment, setComment] = useState('')
  return (
    <div className="space-y-5">
      {canJudge ? (
        <>
          <p className="text-sm text-ink-2">
            Findings are leads, not verdicts. Record what you concluded after looking at the evidence.
          </p>
          <textarea
            className={clsx(inputClass, 'min-h-20 resize-y')}
            placeholder="Optional note, e.g. what you checked or what the entity said"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            {VERDICTS.map(({ key, label, help, icon: Icon, tone }) => (
              <Tooltip key={key} content={help}>
                <Button
                  variant="ghost"
                  disabled={give.isPending}
                  onClick={() =>
                    give.mutate(
                      { verdict: key, comment: comment.trim() || undefined },
                      { onSuccess: () => setComment('') },
                    )
                  }
                >
                  <Icon size={16} style={{ color: tone }} /> {label}
                </Button>
              </Tooltip>
            ))}
          </div>
          {give.isError && <p className="text-sm text-sev-critical">{give.error.message}</p>}
        </>
      ) : (
        <p className="text-sm text-muted">Auditors can see decisions but not record them.</p>
      )}
      {history.data && history.data.length > 0 ? (
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Decisions so far</p>
          <ul className="space-y-2.5">
            {history.data.map((h) => (
              <li key={h.id} className="rounded-xl bg-surface-2/70 px-4 py-3 text-sm">
                <span className="font-semibold capitalize">{h.verdict.replace('_', ' ')}</span>
                <span className="text-muted">
                  {' '}
                  by {h.user} · {fmtDateTime(h.created_at)}
                </span>
                {h.comment && <p className="mt-1 text-ink-2">{h.comment}</p>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[13px] text-muted">No decision recorded yet.</p>
      )}
    </div>
  )
}
