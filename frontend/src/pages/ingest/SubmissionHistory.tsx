import clsx from 'clsx'
import { X } from 'lucide-react'
import { useState } from 'react'
import { type DatasetReport, useEntities, useSubmission, useSubmissions } from '@/api/ingest'
import { Card, CardHeader, inputClass, StatusBadge } from '@/components/ui'
import { fmtDateTime, fmtInt, fmtPeriod, humanize } from '@/lib/format'
import { Pagination } from '@/components/Pagination'
import { DqReport } from './DqReport'

const PAGE = 10

export function SubmissionHistory() {
  const [entity, setEntity] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const entities = useEntities()
  const subs = useSubmissions({ entity, status, offset })
  const total = subs.data?.total ?? 0

  return (
    <Card>
      <CardHeader
        title="Upload History"
        subtitle={subs.data ? `${fmtInt(total)} uploads, newest first. Open one for its quality report.` : 'Loading…'}
        action={
          <div className="flex gap-2">
            <select
              aria-label="Filter by entity"
              className={clsx(inputClass, 'w-40 py-1.5 text-xs')}
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value)
                setOffset(0)
              }}
            >
              <option value="">All entities</option>
              {entities.data?.map((e) => (
                <option key={e.code} value={e.code}>
                  {e.code}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              className={clsx(inputClass, 'w-36 py-1.5 text-xs')}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setOffset(0)
              }}
            >
              <option value="">Any status</option>
              <option value="accepted">Accepted</option>
              <option value="accepted_with_warnings">With warnings</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-6 py-3.5 font-medium">Entity</th>
              <th className="px-4 py-3.5 font-medium">Period</th>
              <th className="px-4 py-3.5 font-medium">Datasets</th>
              <th className="px-4 py-3.5 text-right font-medium">Issues</th>
              <th className="px-4 py-3.5 font-medium">Status</th>
              <th className="px-6 py-3.5 font-medium">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {subs.data?.items.map((s) => (
              <tr
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={clsx(
                  'cursor-pointer transition-colors hover:bg-surface-2',
                  selected === s.id && 'bg-accent-soft',
                )}
              >
                <td className="px-6 py-3.5">
                  <p className="font-medium">{s.entity_code}</p>
                  <p className="max-w-[14rem] truncate text-xs text-muted">{s.entity_name}</p>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">{fmtPeriod(s.period_start, s.period_end)}</td>
                <td className="px-4 py-3.5 text-xs text-muted">
                  {Object.entries(s.row_counts)
                    .map(([k, v]) => `${humanize(k)} ${fmtInt(v)}`)
                    .join(' · ') || '—'}
                </td>
                <td className="num px-4 py-3.5 text-right text-xs whitespace-nowrap">
                  {s.errors > 0 && <span className="text-sev-critical">{fmtInt(s.errors)} err</span>}
                  {s.errors > 0 && s.warnings > 0 && ' · '}
                  {s.warnings > 0 && <span className="text-sev-medium">{fmtInt(s.warnings)} warn</span>}
                  {s.errors === 0 && s.warnings === 0 && <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-6 py-3.5 whitespace-nowrap text-xs text-muted">{fmtDateTime(s.received_at)}</td>
              </tr>
            ))}
            {subs.data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-muted">
                  No submissions match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={Math.floor(offset / PAGE) + 1}
        pages={Math.max(1, Math.ceil(total / PAGE))}
        total={total}
        size={PAGE}
        onChange={(p) => setOffset((p - 1) * PAGE)}
        noun="uploads"
      />
      {selected !== null && <SubmissionDrawer id={selected} onClose={() => setSelected(null)} />}
    </Card>
  )
}

function SubmissionDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data } = useSubmission(id)
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/25 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Upload quality report"
        className="h-full w-full max-w-xl overflow-y-auto border-l border-line bg-surface p-8 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink">Upload #{id}</p>
            <h2 className="mt-1.5 text-xl font-semibold tracking-tight">
              {data ? `${data.entity_code} · ${fmtPeriod(data.period_start, data.period_end)}` : 'Loading…'}
            </h2>
            {data && (
              <p className="mt-1 text-[13px] text-muted">
                {data.entity_name} · {data.source_format.toUpperCase()} · received {fmtDateTime(data.received_at)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>
        {data && (
          <>
            <DqReport status={data.status} datasets={(data.dq_report.datasets ?? []) as DatasetReport[]} />
            {data.file_sha256 && (
              <p className="mt-6 font-mono text-xs break-all text-muted">File fingerprint (SHA-256) {data.file_sha256}</p>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
