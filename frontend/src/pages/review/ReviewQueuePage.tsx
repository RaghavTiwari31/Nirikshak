import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Check, CircleHelp, Download, Shuffle, Target, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  downloadPackCsv,
  type Outcome,
  type PackSummary,
  type SampleOut,
  usePack,
  usePacks,
  useRecordOutcome,
} from '@/api/supervise'
import { Details, Fact } from '@/components/Details'
import { Pagination } from '@/components/Pagination'
import { EmptyState, Meter, Page, PageHeader, SaiPill, SectionLabel, Stat, Tabs } from '@/components/supervise'
import { table } from '@/components/table'
import { InfoTip, Tooltip } from '@/components/Tooltip'
import { Button, Card, CardHeader } from '@/components/ui'
import { fmtDateTime, humanize } from '@/lib/format'
import { ASSET_LABEL } from '@/lib/labels'
import { rateTone } from '@/lib/tones'
import { usePage } from '@/lib/usePage'
import { useAuth } from '@/store/auth'

const OUTCOMES: { key: Outcome; label: string; help: string; icon: typeof Check; mark: string; ink: string }[] = [
  {
    key: 'issue_confirmed',
    label: 'Problem found',
    help: 'Looking at this record, something was handled wrongly.',
    icon: Check,
    mark: 'var(--health-bad)',
    ink: 'var(--sev-critical-ink)',
  },
  {
    key: 'no_issue',
    label: 'Looks fine',
    help: 'This record was handled properly.',
    icon: X,
    mark: 'var(--health-good)',
    ink: 'var(--health-good-ink)',
  },
  {
    key: 'needs_info',
    label: 'Need more information',
    help: 'Cannot tell from the record; ask the entity.',
    icon: CircleHelp,
    mark: 'var(--health-fair)',
    ink: 'var(--sev-medium-ink)',
  },
]

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`)
const rate = (confirmed: number, reviewed: number): number | null => (reviewed ? confirmed / reviewed : null)

export function ReviewQueuePage() {
  const [params, setParams] = useSearchParams()
  const packs = usePacks()
  const selected = params.get('entity')

  return (
    <Page>
      {selected && packs.data ? (
        <PackWorkspace
          code={selected}
          packs={packs.data}
          onSelect={(code) => setParams(code ? { entity: code } : {})}
        />
      ) : (
        <>
          <PageHeader eyebrow="Supervise" title="Review Queue">
            <p>
              Records picked for you to check by hand, one entity at a time. Most are linked to a finding; about one in
              five is <strong className="font-semibold text-ink">picked at random</strong> for comparison, so you can
              see how much better than random the tool’s picks are.
            </p>
          </PageHeader>
          {packs.isSuccess && packs.data.length === 0 ? (
            <EmptyState>No records have been picked yet. Each analysis picks them automatically.</EmptyState>
          ) : (
            packs.data && <QueueView packs={packs.data} onOpen={(code) => setParams({ entity: code })} />
          )}
        </>
      )}
    </Page>
  )
}

/* ------------------------------------------------------------------ queue */

type PackFilter = 'all' | 'todo' | 'progress' | 'done'

function packState(p: PackSummary): Exclude<PackFilter, 'all'> {
  if (p.reviewed === 0) return 'todo'
  return p.reviewed >= p.samples ? 'done' : 'progress'
}

function QueueView({ packs, onOpen }: { packs: PackSummary[]; onOpen: (code: string) => void }) {
  const [filter, setFilter] = useState<PackFilter>('all')
  const rows = useMemo(() => (filter === 'all' ? packs : packs.filter((p) => packState(p) === filter)), [packs, filter])
  const pg = usePage(rows, 10, filter)
  const count = (f: PackFilter) => packs.filter((p) => packState(p) === f).length

  const samples = packs.reduce((n, p) => n + p.samples, 0)
  const reviewed = packs.reduce((n, p) => n + p.reviewed, 0)
  const directedChecked = packs.reduce((n, p) => n + Math.min(p.reviewed, p.directed), 0)
  const confirmedDirected = packs.reduce((n, p) => n + p.confirmed_directed, 0)
  const confirmedControl = packs.reduce((n, p) => n + p.confirmed_control, 0)
  const controlChecked = Math.max(0, reviewed - directedChecked)
  const next = packs.find((p) => packState(p) !== 'done')

  return (
    <>
      <SectionLabel
        action={
          next && (
            <Button onClick={() => onOpen(next.entity_code)}>
              {packState(next) === 'todo' ? 'Start with the next entity' : 'Continue where you left off'}{' '}
              <ArrowRight size={15} />
            </Button>
          )
        }
      >
        Review Progress
      </SectionLabel>
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Entities to Review" value={packs.length} hint={`${count('done')} finished · ${count('progress')} in progress`} help="reviewPack" />
        <Stat
          label="Records Checked"
          value={`${samples ? Math.round((reviewed / samples) * 100) : 0}%`}
          hint={`${reviewed} of ${samples} picked records`}
        />
        <Stat
          label="Problems · Tool’s Picks"
          value={pct(rate(confirmedDirected, directedChecked))}
          hint="Share of checked linked records with a problem"
          helpText="How often checking a record the tool picked turned up a real problem."
        />
        <Stat
          label="Problems · Random Picks"
          value={pct(rate(confirmedControl, controlChecked))}
          hint="The background rate, for comparison"
          help="control"
        />
      </section>

      <Card className="overflow-hidden">
        <CardHeader
          title="Review Packs"
          subtitle="One pack per entity, most urgent first. Open a pack to check its records."
          help="reviewPack"
        />
        <div className="px-7">
          <Tabs
            label="Filter packs"
            value={filter}
            onChange={setFilter}
            options={[
              { key: 'all', label: 'All', count: packs.length },
              { key: 'todo', label: 'Not started', count: count('todo'), tone: 'var(--sev-low)' },
              { key: 'progress', label: 'In progress', count: count('progress'), tone: 'var(--health-fair)' },
              { key: 'done', label: 'Done', count: count('done'), tone: 'var(--health-good)' },
            ]}
          />
        </div>
        <div className={table.wrap}>
          <table className={clsx(table.table, 'min-w-[860px]')}>
            <thead className={table.head}>
              <tr>
                <th className={clsx(table.th, 'w-14')}>Rank</th>
                <th className={table.th}>Entity</th>
                <th className={table.th}>Attention</th>
                <th className={clsx(table.th, 'w-64')}>Progress</th>
                <th className={clsx(table.th, 'text-right')}>Problems found</th>
                <th className={clsx(table.th, 'w-40')}>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pg.slice.map((p) => {
                const state = packState(p)
                const progress = p.reviewed / Math.max(p.samples, 1)
                const progressColor =
                  state === 'done' ? 'var(--health-good)' : state === 'progress' ? 'var(--health-fair)' : 'var(--sev-low)'
                const found = p.confirmed_directed + p.confirmed_control
                return (
                  <tr key={p.entity_code} className={table.row}>
                    <td className={clsx(table.td, 'num py-4 font-semibold text-muted')}>{p.rank}</td>
                    <td className={clsx(table.td, 'py-4')}>
                      <button
                        type="button"
                        onClick={() => onOpen(p.entity_code)}
                        className="text-left font-semibold text-ink hover:text-accent-ink"
                      >
                        {p.entity_name}
                      </button>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {p.entity_code} · {p.directed} linked, {p.control} random
                      </p>
                    </td>
                    <td className={clsx(table.td, 'py-4')}>
                      <SaiPill sai={p.sai} />
                    </td>
                    <td className={clsx(table.td, 'py-4')}>
                      <p className="mb-2 flex justify-between text-[13px]">
                        <span className="font-medium" style={{ color: state === 'done' ? 'var(--health-good-ink)' : undefined }}>
                          {state === 'done' ? 'Done' : state === 'progress' ? 'In progress' : 'Not started'}
                        </span>
                        <span className="num text-muted">
                          {p.reviewed} of {p.samples}
                        </span>
                      </p>
                      <Meter value={progress * 100} color={progressColor} />
                    </td>
                    <td className={clsx(table.td, 'num py-4 text-right font-semibold')}>
                      {p.reviewed ? (
                        <span style={{ color: found ? 'var(--sev-critical-ink)' : 'var(--health-good-ink)' }}>{found}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={clsx(table.td, 'py-4 text-right')}>
                      <button
                        type="button"
                        onClick={() => onOpen(p.entity_code)}
                        className={clsx(
                          'rounded-lg px-3.5 py-1.5 text-[13px] font-medium',
                          state === 'done'
                            ? 'border border-line-strong text-ink hover:bg-surface-2'
                            : 'bg-ink text-white hover:bg-ink-2',
                        )}
                      >
                        {state === 'todo' ? 'Start review' : state === 'progress' ? 'Continue' : 'View'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {pg.total === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-muted">
                    No packs in this group.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onChange={pg.setPage} noun="packs" />
      </Card>
    </>
  )
}

/* ------------------------------------------------------------------ one pack */

type RecordFilter = 'todo' | 'all' | 'linked' | 'random' | 'done'

function PackWorkspace({
  code,
  packs,
  onSelect,
}: {
  code: string
  packs: PackSummary[]
  onSelect: (code: string | null) => void
}) {
  const { data } = usePack(code)
  const role = useAuth((s) => s.user?.role)
  const canReview = role !== 'auditor'
  const record = useRecordOutcome(code)
  const [exportError, setExportError] = useState<string | null>(null)
  const [filter, setFilter] = useState<RecordFilter>('todo')
  const index = packs.findIndex((p) => p.entity_code === code)
  const prev = index > 0 ? packs[index - 1] : undefined
  const next = index >= 0 && index < packs.length - 1 ? packs[index + 1] : undefined
  const summary = packs[index]

  const items = useMemo(() => data?.items ?? [], [data])
  const filtered = useMemo(() => {
    switch (filter) {
      case 'todo':
        return items.filter((s) => !s.outcome)
      case 'done':
        return items.filter((s) => s.outcome)
      case 'linked':
        return items.filter((s) => s.stratum !== 'random_control')
      case 'random':
        return items.filter((s) => s.stratum === 'random_control')
      default:
        return items
    }
  }, [items, filter])
  const pg = usePage(filtered, 10, `${code}-${filter}`)

  const directed = items.filter((s) => s.stratum !== 'random_control')
  const control = items.filter((s) => s.stratum === 'random_control')
  const directedRate = rate(
    summary?.confirmed_directed ?? data?.confirmed_directed ?? 0,
    directed.filter((s) => s.outcome).length,
  )
  const controlRate = rate(summary?.confirmed_control ?? data?.confirmed_control ?? 0, control.filter((s) => s.outcome).length)
  const uplift = directedRate !== null && controlRate ? directedRate / controlRate : null
  const done = items.filter((s) => s.outcome).length

  if (index === -1) {
    return (
      <>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} /> All review packs
        </button>
        <EmptyState>
          {code} has no review pack in this analysis. Packs are made for the most urgent entities (the top 10, plus any
          with an attention score of 30 or more).
        </EmptyState>
      </>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} /> All review packs
        </button>
        <div className="flex items-center gap-2">
          <span className="num mr-2 text-[13px] text-muted">
            Pack {index + 1} of {packs.length}
          </span>
          <Button variant="ghost" disabled={!prev} onClick={() => prev && onSelect(prev.entity_code)}>
            <ArrowLeft size={15} /> Previous
          </Button>
          <Button disabled={!next} onClick={() => next && onSelect(next.entity_code)}>
            Next in queue <ArrowRight size={15} />
          </Button>
        </div>
      </div>

      <header className="-mt-4 flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-ink">Review Pack</p>
          <h1 className="mt-2 text-[30px] leading-tight font-semibold tracking-tight">{summary?.entity_name ?? code}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
            {code}
            {summary && <SaiPill sai={summary.sai} />}
            <Link to={`/entities/${code}`} className="inline-flex items-center gap-1 font-medium text-accent-ink hover:text-ink">
              Open entity <ArrowRight size={13} />
            </Link>
          </p>
        </div>
        <Tooltip content="Download these records as a spreadsheet (CSV). The download is recorded in the activity log.">
          <Button
            variant="ghost"
            onClick={() => {
              setExportError(null)
              downloadPackCsv(code).catch((e: Error) => setExportError(e.message))
            }}
          >
            <Download size={16} /> Download
          </Button>
        </Tooltip>
      </header>
      {exportError && <p className="text-sm text-sev-critical">{exportError}</p>}

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Checked" value={`${done} of ${items.length}`}>
          <div className="mt-4">
            <Meter value={items.length ? (done / items.length) * 100 : 0} color={done === items.length && done ? 'var(--health-good)' : 'var(--health-fair)'} />
          </div>
        </Stat>
        <Stat label="Linked to Findings" value={directed.length} hint={`${control.length} picked at random`} />
        <Stat
          label="Problems · Tool’s Picks"
          value={pct(directedRate)}
          hint="Of the linked records checked"
          tone={rateTone(directedRate) ? 'var(--sev-critical-ink)' : undefined}
        />
        <Stat label="Problems · Random Picks" value={pct(controlRate)} hint="Of the random records checked" help="control" />
      </section>
      {uplift !== null && (
        <p className="rounded-2xl border border-accent/30 bg-accent-soft px-6 py-4 text-sm text-ink">
          So far, records picked by the tool show a problem <strong>{uplift.toFixed(1)}×</strong> as often as records
          picked at random.
        </p>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title="Records"
          subtitle="Open a record to see all its details, then record what you found. Each choice is saved immediately; finished records move to Done."
        />
        <div className="px-7">
          <Tabs
            label="Filter records"
            value={filter}
            onChange={setFilter}
            options={[
              { key: 'todo', label: 'To check', count: items.length - done, tone: 'var(--health-fair)' },
              { key: 'done', label: 'Done', count: done, tone: 'var(--health-good)' },
              { key: 'linked', label: 'Linked to a finding', count: directed.length },
              { key: 'random', label: 'Picked at random', count: control.length },
              { key: 'all', label: 'All', count: items.length },
            ]}
          />
        </div>
        {!data ? (
          <p className="px-7 py-10 text-sm text-muted">Loading records…</p>
        ) : pg.total === 0 ? (
          <p className="px-7 py-12 text-center text-sm text-muted">
            {filter === 'todo' ? 'Every record in this pack has been checked.' : 'No records in this group.'}
          </p>
        ) : (
          <ul>
            {pg.slice.map((s) => (
              <SampleRow
                key={s.id}
                s={s}
                canReview={canReview}
                busy={record.isPending && record.variables?.id === s.id}
                onOutcome={(outcome) => record.mutate({ id: s.id, outcome })}
              />
            ))}
          </ul>
        )}
        <Pagination page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onChange={pg.setPage} noun="records" />
      </Card>
    </>
  )
}

function summarise(s: SampleOut): { title: string; sub: string } {
  const r = s.record as Record<string, string | number | boolean | null> | null
  if (!r) return { title: `${humanize(s.record_type)} #${s.record_id}`, sub: '' }
  if (s.record_type === 'alert') {
    return {
      title: `${String(r.severity)} ${String(r.category).replace(/_/g, ' ')} alert`,
      sub: `${r.source_ref} · raised ${r.created_at ? fmtDateTime(String(r.created_at)) : '—'} · closed as ${String(r.disposition).toUpperCase()}`,
    }
  }
  if (s.record_type === 'case') {
    return {
      title: `${String(r.priority)}-priority case · ${r.escalated ? 'escalated' : 'not escalated'}`,
      sub: `${r.source_ref} · closing note: “${String(r.resolution_note ?? '').slice(0, 80)}”`,
    }
  }
  return {
    title: `${ASSET_LABEL[String(r.asset_type)] ?? r.asset_type} · importance ${r.criticality} of 4`,
    sub: 'Check whether this machine is actually monitored',
  }
}

function SampleRow({
  s,
  canReview,
  busy,
  onOutcome,
}: {
  s: SampleOut
  canReview: boolean
  busy: boolean
  onOutcome: (o: Outcome) => void
}) {
  const isControl = s.stratum === 'random_control'
  const { title, sub } = summarise(s)
  const r = s.record as Record<string, unknown> | null
  const chosen = OUTCOMES.find((o) => o.key === s.outcome)
  return (
    <li
      className="border-b border-line/70 px-7 py-5 last:border-0"
      style={chosen ? { background: `color-mix(in srgb, ${chosen.mark} 5%, transparent)` } : undefined}
    >
      <p className="flex flex-wrap items-center gap-2.5 text-xs">
        <span
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium',
            isControl ? 'bg-surface-2 text-ink-2' : 'bg-accent-soft text-accent-ink',
          )}
        >
          {isControl ? <Shuffle size={12} /> : <Target size={12} />}
          {isControl ? 'Picked at random' : 'Linked to a finding'}
        </span>
        {isControl && <InfoTip term="control" />}
        {chosen && (
          <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: chosen.ink }}>
            <chosen.icon size={13} /> {chosen.label} · by {s.reviewer}
          </span>
        )}
      </p>
      <p className="mt-2 text-sm font-medium text-ink first-letter:uppercase">{title}</p>
      {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      {!isControl && s.reason && <p className="mt-1.5 text-[13px] text-accent-ink">Why it was picked: {s.reason}</p>}
      {r && (
        <Details nested label="View record" openLabel="Hide record" className="mt-1">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {Object.entries(r)
              .filter(([, v]) => v !== null && v !== '')
              .map(([k, v]) => (
                <Fact key={k} label={humanize(k)}>
                  <span className="font-normal break-words">{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}</span>
                </Fact>
              ))}
          </dl>
        </Details>
      )}
      {canReview && (
        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="What did you find?">
          <span className="mr-1 text-[13px] text-muted">What did you find?</span>
          {OUTCOMES.map(({ key, label, help, icon: Icon, mark, ink }) => {
            const active = s.outcome === key
            return (
              <Tooltip key={key} content={help}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={active}
                  onClick={() => onOutcome(key)}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50',
                    !active && 'border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink',
                  )}
                  style={
                    active
                      ? { color: ink, borderColor: mark, background: `color-mix(in srgb, ${mark} 12%, var(--surface))` }
                      : undefined
                  }
                >
                  <Icon size={14} style={{ color: active ? ink : mark }} />
                  {label}
                </button>
              </Tooltip>
            )
          })}
        </div>
      )}
    </li>
  )
}
