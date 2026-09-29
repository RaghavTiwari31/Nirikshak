import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { type CoverageOverview, type EntityCoverage, useCoverage, useEntityCoverage } from '@/api/supervise'
import { CoverageHeatmap } from '@/components/charts/CoverageHeatmap'
import { Details } from '@/components/Details'
import { Pagination } from '@/components/Pagination'
import { EmptyState, Legend, Meter, Page, PageHeader, SaiPill, SectionLabel, Stat, Tabs, ViewToggle } from '@/components/supervise'
import { table } from '@/components/table'
import { InfoTip, Tooltip } from '@/components/Tooltip'
import { Card, CardHeader, cardBody, Field, inputClass } from '@/components/ui'
import { ASSET_LABEL, ASSET_NOUN } from '@/lib/labels'
import { COVERAGE_LEGEND, coverageTone } from '@/lib/tones'
import { usePage } from '@/lib/usePage'

// Compact column headers; the full name is in each header's tooltip.
const ASSET_ABBR: Record<string, string> = {
  dc: 'DC',
  server: 'Servers',
  db: 'DBs',
  endpoint: 'Endpoints',
  firewall: 'Firewalls',
  email_gw: 'Mail',
  cloud: 'Cloud',
  ot_scada: 'SCADA',
  ot_hmi: 'HMI',
}

type Row = CoverageOverview['rows'][number]
type MatrixFilter = 'all' | 'holes' | 'low' | 'full'

const isLow = (r: Row) => Object.values(r.by_asset_type).some((v) => v !== null && v !== undefined && v < 0.4)
const isFull = (r: Row) => r.holes === 0 && Object.values(r.by_asset_type).every((v) => v === null || v === undefined || v >= 0.8)

export function NegativeSpacePage() {
  const [params, setParams] = useSearchParams()
  const overview = useCoverage()
  const rows = useMemo(() => overview.data?.rows ?? [], [overview.data])
  const selected = params.get('entity') ?? rows[0]?.entity_code ?? null
  const detail = useEntityCoverage(selected)
  const types = useMemo(() => overview.data?.asset_types ?? [], [overview.data])

  const withHoles = rows.filter((r) => r.holes > 0)
  const totalHoles = rows.reduce((n, r) => n + r.holes, 0)
  const weakestType = useMemo(() => {
    let best: [string, number] = ['', 0]
    for (const t of types) {
      const n = rows.filter((r) => {
        const v = r.by_asset_type[t]
        return v !== null && v !== undefined && v < 0.4
      }).length
      if (n > best[1]) best = [t, n]
    }
    return best
  }, [rows, types])

  const select = (code: string) => {
    setParams({ entity: code })
    requestAnimationFrame(() => document.getElementById('entity-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <Page>
      <PageHeader eyebrow="Analyse" title="Missing Evidence">
        <p>
          Evidence that <em>should</em> exist but doesn’t. From other entities, the tool learns how many alerts each
          kind of machine normally produces. When an entity reports far fewer, or none, something is probably not being
          watched.
        </p>
        <Details label="How is “expected” worked out?" openLabel="Hide the explanation" className="mt-3">
          <ol className="max-w-3xl list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-2">
            <li>For each kind of machine (for example, domain controllers) and each kind of alert, the tool takes the typical rate per machine at the other entities.</li>
            <li>It multiplies that rate by how many such machines this entity has, and by the length of the period.</li>
            <li>
              If others would expect at least {detail.data?.min_expected ?? 20} alerts and this entity reported none, that
              cell is a <strong className="font-semibold text-ink">hole</strong>. A statistical test makes sure the gap is
              too large to be chance.
            </li>
          </ol>
        </Details>
      </PageHeader>

      {overview.isSuccess && rows.length === 0 ? (
        <EmptyState>Nothing has been analysed yet.</EmptyState>
      ) : (
        <>
          <SectionLabel>At a Glance</SectionLabel>
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Entities with Holes"
              value={withHoles.length}
              hint={`of ${rows.length} entities`}
              help="hole"
              alert={withHoles.length > 0}
            />
            <Stat label="Holes in Total" value={totalHoles} hint="Places with no alerts where others would expect some" />
            <Stat
              label="Most Often Under-Watched"
              value={weakestType[1] ? (ASSET_ABBR[weakestType[0]] ?? weakestType[0]) : '—'}
              hint={
                weakestType[1]
                  ? `${weakestType[1]} entities report under 40% of expected evidence from ${ASSET_NOUN[weakestType[0]] ?? 'them'}`
                  : 'No machine type is widely under-reported'
              }
            />
            <Stat
              label="Fully Covered"
              value={rows.filter(isFull).length}
              hint="No holes and 80%+ of expected evidence everywhere"
              tone="var(--health-good-ink)"
            />
          </section>

          <CoverageMatrix rows={rows} types={types} selected={selected} onSelect={select} />

          <div id="entity-detail" className="scroll-mt-6">
            <SectionLabel
              action={
                <div className="w-80 max-w-full">
                  <Field label="Entity">
                    <select className={inputClass} value={selected ?? ''} onChange={(e) => setParams({ entity: e.target.value })}>
                      {rows.map((r) => (
                        <option key={r.entity_code} value={r.entity_code}>
                          {r.entity_name} ({r.holes} hole{r.holes === 1 ? '' : 's'})
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              }
            >
              Entity Detail
            </SectionLabel>
          </div>
          {detail.data && selected && (
            <EntityDetail data={detail.data} row={rows.find((r) => r.entity_code === selected)} />
          )}
        </>
      )}
    </Page>
  )
}

/* ------------------------------------------------------------------ matrix */

function CoverageMatrix({
  rows,
  types,
  selected,
  onSelect,
}: {
  rows: Row[]
  types: string[]
  selected: string | null
  onSelect: (code: string) => void
}) {
  const [filter, setFilter] = useState<MatrixFilter>('all')
  const shown = useMemo(() => {
    if (filter === 'holes') return rows.filter((r) => r.holes > 0)
    if (filter === 'low') return rows.filter(isLow)
    if (filter === 'full') return rows.filter(isFull)
    return rows
  }, [rows, filter])
  const pg = usePage(shown, 10, filter)

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Coverage Matrix"
        subtitle="What each entity reported, as a share of what others would expect, for every kind of machine. Select a row for the detail."
        help="expected"
        action={<Legend items={COVERAGE_LEGEND} className="max-w-md justify-end text-xs" />}
      />
      <div className="px-7">
        <Tabs
          label="Filter entities"
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'all', label: 'All', count: rows.length },
            { key: 'holes', label: 'With holes', count: rows.filter((r) => r.holes > 0).length, tone: 'var(--health-bad)' },
            { key: 'low', label: 'Low coverage', count: rows.filter(isLow).length, tone: 'var(--health-poor)' },
            { key: 'full', label: 'Fully covered', count: rows.filter(isFull).length, tone: 'var(--health-good)' },
          ]}
        />
      </div>
      <div className={table.wrap}>
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className={table.head}>
            <tr>
              <th className={table.th}>Entity</th>
              <th className={clsx(table.th, 'text-right')}>
                <span className="inline-flex items-center gap-1">
                  Holes <InfoTip term="hole" />
                </span>
              </th>
              {types.map((t) => (
                <th key={t} className="px-1.5 py-3 text-center text-xs font-medium whitespace-nowrap">
                  <Tooltip content={ASSET_LABEL[t] ?? t}>
                    <span tabIndex={0} className="cursor-help">
                      {ASSET_ABBR[t] ?? t}
                    </span>
                  </Tooltip>
                </th>
              ))}
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {pg.slice.map((r) => (
              <tr
                key={r.entity_code}
                onClick={() => onSelect(r.entity_code)}
                className={clsx(
                  table.row,
                  'cursor-pointer',
                  selected === r.entity_code && 'bg-accent-soft hover:bg-accent-soft',
                )}
              >
                <td className="min-w-[15rem] px-6 py-2.5">
                  <p className="font-semibold text-ink">{r.entity_name}</p>
                  <p className="text-xs text-muted">{r.entity_code}</p>
                </td>
                <td className="num px-3 py-2.5 text-right">
                  {r.holes > 0 ? (
                    <span className="inline-flex min-w-7 justify-center rounded-full bg-[color-mix(in_srgb,var(--health-bad)_12%,transparent)] px-2 py-0.5 text-[13px] font-semibold text-sev-critical">
                      {r.holes}
                    </span>
                  ) : (
                    <span className="text-muted">0</span>
                  )}
                </td>
                {types.map((t) => {
                  const v = r.by_asset_type[t]
                  const tone = coverageTone(v)
                  return (
                    <td key={t} className="px-1 py-1.5">
                      {tone ? (
                        <Tooltip content={`${ASSET_LABEL[t]}: ${Math.round((v ?? 0) * 100)}% of expected · ${tone.label}`}>
                          <span
                            tabIndex={0}
                            className="num flex h-9 min-w-[3.25rem] items-center justify-center rounded-lg text-xs font-semibold"
                            style={{ background: tone.mark, color: tone.mark === 'var(--health-fair)' ? 'var(--ink)' : '#fff' }}
                          >
                            {Math.min(999, Math.round((v ?? 0) * 100))}%
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="flex h-9 items-center justify-center text-xs text-muted/60" title="No machines of this kind">
                          —
                        </span>
                      )}
                    </td>
                  )
                })}
                <td className="pr-4 text-muted">
                  <ArrowRight size={15} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onChange={pg.setPage} noun="entities" />
    </Card>
  )
}

/* ------------------------------------------------------------------ one entity */

function EntityDetail({ data, row }: { data: EntityCoverage; row?: Row }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const cells = [...data.cells]
    .filter((c) => c.expected >= 1 || c.observed > 0)
    .sort((a, b) => Number(b.missing) - Number(a.missing) || b.expected - a.expected)
  const pg = usePage(cells, 10, `${data.entity_code}-${view}`)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 2xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <Card className="overflow-hidden">
        <CardHeader
          title="Evidence Matrix"
          subtitle={`${data.entity_name}: kinds of alert (rows) on kinds of machine (columns). Each square shows the share of expected alerts that were reported; ✕ marks a hole.`}
          action={
            <div className="flex flex-wrap items-center gap-3">
              {row && <SaiPill sai={row.sai} />}
              <Link
                to={`/entities/${data.entity_code}`}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-ink hover:text-ink"
              >
                Open entity <ArrowRight size={13} />
              </Link>
              <ViewToggle view={view} onChange={setView} />
            </div>
          }
        />
        {view === 'chart' ? (
          <div className="px-5 pb-6">
            <CoverageHeatmap data={data} />
            <Legend items={COVERAGE_LEGEND} className="px-2 pt-2 text-xs" />
          </div>
        ) : (
          <>
            <div className={clsx(table.wrap, 'border-t border-line')}>
              <table className={table.table}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Kind of alert</th>
                    <th className={table.th}>Kind of machine</th>
                    <th className={clsx(table.th, 'text-right')}>Expected</th>
                    <th className={clsx(table.th, 'text-right')}>Reported</th>
                    <th className={table.th}>Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {pg.slice.map((c) => {
                    const tone = coverageTone(c.ratio ?? 1, c.missing)
                    return (
                      <tr key={`${c.asset_type}-${c.category}`} className={table.row}>
                        <td className={clsx(table.td, 'py-3')}>{c.category_label}</td>
                        <td className={clsx(table.td, 'py-3 text-ink-2')}>{ASSET_LABEL[c.asset_type] ?? c.asset_type}</td>
                        <td className={clsx(table.td, 'num py-3 text-right')}>{c.expected.toFixed(0)}</td>
                        <td className={clsx(table.td, 'num py-3 text-right')}>{c.observed}</td>
                        <td className={clsx(table.td, 'py-3')}>
                          {tone && (
                            <span className="inline-flex items-center gap-2 text-[13px] font-medium" style={{ color: tone.ink }}>
                              <span className="size-2.5 rounded-full" style={{ background: tone.mark }} />
                              {c.missing ? 'Hole' : tone.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onChange={pg.setPage} noun="cells" />
          </>
        )}
      </Card>

      <div className="space-y-8">
        {row && (
          <Card>
            <CardHeader title="Coverage by Machine Type" subtitle="Share of expected alerts reported, across all kinds of alert." />
            <ul className={clsx(cardBody, 'space-y-4')}>
              {Object.entries(row.by_asset_type)
                .filter(([, v]) => v !== null && v !== undefined)
                .sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0))
                .map(([t, v]) => {
                  const tone = coverageTone(v)!
                  return (
                    <li key={t} className="grid grid-cols-[9rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-[13px]">
                      <span className="text-ink-2">{ASSET_LABEL[t] ?? t}</span>
                      <Meter value={Math.min(100, (v ?? 0) * 100)} color={tone.mark} />
                      <span className="num text-right font-semibold" style={{ color: tone.ink }}>
                        {Math.min(999, Math.round((v ?? 0) * 100))}%
                      </span>
                    </li>
                  )
                })}
            </ul>
          </Card>
        )}
        <HoleList data={data} />
      </div>
    </div>
  )
}

/** The holes, one by one, each peelable into what it means and what to ask the entity. */
function HoleList({ data }: { data: EntityCoverage }) {
  const holes = data.cells.filter((c) => c.missing).sort((a, b) => b.expected - a.expected)
  const pg = usePage(holes, 10, data.entity_code)
  if (holes.length === 0) {
    return (
      <Card className="p-7">
        <p className="text-sm font-semibold text-health-good-ink">No holes</p>
        <p className="mt-1 text-sm text-ink-2">
          {data.entity_name} reports roughly the evidence other entities would expect for its machines.
        </p>
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={`Holes to Ask About (${holes.length})`}
        subtitle="Largest gaps first. Open one for what it usually means and what to ask the entity."
        help="hole"
      />
      <ul className="border-t border-line">
        {pg.slice.map((c) => {
          const machine = ASSET_LABEL[c.asset_type] ?? c.asset_type
          const noun = ASSET_NOUN[c.asset_type] ?? machine.toLowerCase()
          const ot = c.asset_type.startsWith('ot_')
          return (
            <li
              key={`${c.asset_type}-${c.category}`}
              className="border-b border-line/70 border-l-4 border-l-[var(--health-bad)] px-7 py-5 last:border-b-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-ink">
                  {c.category_label} <span className="font-normal text-muted">on</span> {machine}
                </p>
                <p className="num text-[13px] text-ink-2">
                  about <strong>{c.expected.toFixed(0)}</strong> expected ·{' '}
                  <strong className="text-sev-critical">0</strong> reported
                </p>
              </div>
              <Details className="mt-1.5">
                <div className="space-y-3 text-sm leading-relaxed text-ink-2">
                  <p>
                    Similar {noun} at other entities raise “{c.category_label.toLowerCase()}” alerts regularly. Given how
                    many of them this entity has, about {c.expected.toFixed(0)} would be expected over the period. It
                    reported none.
                  </p>
                  <p>
                    {ot
                      ? 'For industrial control systems this usually means no OT monitoring sensor is installed, or it is not connected to the security team.'
                      : 'This usually means the logs from these machines are not collected, or no detection rule covers this kind of activity.'}{' '}
                    Less often, the entity’s environment genuinely differs.
                  </p>
                  <p className="rounded-xl bg-surface-2/70 px-4 py-3 text-ink">
                    <strong className="font-semibold">Ask the entity:</strong> are the {noun} sending logs to the security
                    team, and is there a rule that would raise this kind of alert?
                  </p>
                </div>
              </Details>
            </li>
          )
        })}
      </ul>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onChange={pg.setPage} noun="holes" />
    </Card>
  )
}
