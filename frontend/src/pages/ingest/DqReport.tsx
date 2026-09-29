import { AlertTriangle, CircleCheck, CircleX, Clock } from 'lucide-react'
import type { DatasetReport } from '@/api/ingest'
import { StatusBadge } from '@/components/ui'
import { fmtDateTime, fmtInt, fmtPct, humanize } from '@/lib/format'

/** Data-quality report for one submission: how much was accepted, and why rows were not. */
export function DqReport({ status, datasets }: { status: string; datasets: DatasetReport[] }) {
  const totals = datasets.reduce(
    (acc, d) => ({
      received: acc.received + d.rows_received,
      accepted: acc.accepted + d.rows_accepted,
      rejected: acc.rejected + d.rows_rejected,
    }),
    { received: 0, accepted: 0, rejected: 0 },
  )
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={status} />
        <p className="num text-sm text-muted">
          <span className="text-ink">{fmtInt(totals.accepted)}</span> of {fmtInt(totals.received)} rows
          accepted
          {totals.received > 0 && ` (${fmtPct(totals.accepted / totals.received)})`}
        </p>
      </div>
      {datasets.map((d) => (
        <DatasetBlock key={d.dataset} report={d} />
      ))}
    </div>
  )
}

function DatasetBlock({ report: d }: { report: DatasetReport }) {
  const acceptedPct = d.rows_received ? d.rows_accepted / d.rows_received : 0
  const errors = Object.entries(d.errors)
  const warnings = Object.entries(d.warnings)
  const sparse = Object.entries(d.null_rates)
    .filter(([, r]) => r > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  return (
    <div className="rounded-xl border border-line bg-bg/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{humanize(d.dataset)}</h3>
        <p className="num text-xs text-muted">
          {fmtInt(d.rows_accepted)} accepted · {fmtInt(d.rows_rejected)} rejected
        </p>
      </div>

      <div
        className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={`${fmtPct(acceptedPct)} accepted`}
      >
        <div className="bg-ok" style={{ width: `${acceptedPct * 100}%` }} />
        <div className="bg-sev-critical" style={{ width: `${(1 - acceptedPct) * 100}%` }} />
      </div>

      {d.fatal && (
        <p className="mt-3 flex items-start gap-2 text-sm text-sev-critical">
          <CircleX size={16} className="mt-0.5 shrink-0" /> {d.fatal}
        </p>
      )}

      {(errors.length > 0 || warnings.length > 0) && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {errors.map(([issue, n]) => (
            <IssueRow key={issue} level="error" issue={issue} count={n} samples={d.samples} />
          ))}
          {warnings.map(([issue, n]) => (
            <IssueRow key={issue} level="warning" issue={issue} count={n} samples={d.samples} />
          ))}
        </ul>
      )}
      {!d.fatal && errors.length === 0 && warnings.length === 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ok">
          <CircleCheck size={16} /> No data-quality issues
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {sparse.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted">
              Empty optional fields
            </p>
            <ul className="space-y-1.5">
              {sparse.map(([field, rate]) => (
                <li key={field} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-xs">
                  <span className="truncate font-mono text-muted">{field}</span>
                  <span className="num">{fmtPct(rate, 0)}</span>
                  <span className="col-span-2 h-1 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full bg-muted/60" style={{ width: `${rate * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {d.time_range?.min && d.time_range.max && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted">
              Time span
            </p>
            <p className="flex items-center gap-2 text-xs">
              <Clock size={13} className="text-muted" />
              {fmtDateTime(d.time_range.min)} → {fmtDateTime(d.time_range.max)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function IssueRow({
  level,
  issue,
  count,
  samples,
}: {
  level: 'error' | 'warning'
  issue: string
  count: number
  samples: DatasetReport['samples']
}) {
  const records = samples.filter((s) => s.issue === issue).map((s) => s.record)
  const Icon = level === 'error' ? CircleX : AlertTriangle
  return (
    <li className="flex items-start gap-2">
      <Icon
        size={15}
        className={level === 'error' ? 'mt-0.5 shrink-0 text-sev-critical' : 'mt-0.5 shrink-0 text-sev-medium'}
      />
      <span className="min-w-0 flex-1">
        <span className="num font-medium">{fmtInt(count)}</span>{' '}
        {level === 'error' ? 'rejected' : 'flagged'}: {issue}
        {records.length > 0 && (
          <span className="num ml-2 text-xs text-muted">
            e.g. record {records.slice(0, 3).map((r) => `#${r}`).join(', ')}
          </span>
        )}
      </span>
    </li>
  )
}
