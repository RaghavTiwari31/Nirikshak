import clsx from 'clsx'
import { ArrowRight, ChevronDown, ClipboardCheck, FileText } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { ScoreOut } from '@/api/supervise'
import { SECTOR_LABEL } from '@/lib/labels'
import { BAND_LABEL, saiBand, severityColor, type SeverityLevel } from '@/lib/severity'
import { CAPABILITY_LABEL } from '@/lib/taxonomy'
import { healthTone, HEALTH_LEGEND } from '@/lib/tones'
import { usePage } from '@/lib/usePage'
import { Pagination } from './Pagination'
import { Legend, Meter, SaiPill, Tabs, ToneValue } from './supervise'
import { table } from './table'
import { InfoTip, Tooltip } from './Tooltip'

type BandFilter = 'all' | '4' | '3' | '2' | '1'

/**
 * The ranked entity table shared by the Overview (Priority Queue) and Entities pages:
 * attention-band tabs with counts, colour-coded weakest area, ten rows a page, and a quick
 * look that opens in place under any row.
 */
export function EntityTable({ items, noun = 'entities' }: { items: ScoreOut[]; noun?: string }) {
  const navigate = useNavigate()
  const [band, setBand] = useState<BandFilter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const counts = useMemo(() => {
    const c: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const i of items) c[saiBand(i.sai)] = (c[saiBand(i.sai)] ?? 0) + 1
    return c
  }, [items])
  const rows = useMemo(() => (band === 'all' ? items : items.filter((i) => String(saiBand(i.sai)) === band)), [items, band])
  const pg = usePage(rows, 10, band)

  return (
    <div>
      <div className="px-7">
        <Tabs
          label="Filter by attention"
          value={band}
          onChange={setBand}
          options={[
            { key: 'all', label: 'All', count: items.length },
            ...([4, 3, 2, 1] as const).map((b) => ({
              key: String(b) as BandFilter,
              label: BAND_LABEL[b],
              count: counts[b] ?? 0,
              tone: severityColor(b),
            })),
          ]}
        />
      </div>
      <div className={table.wrap}>
        <table className={clsx(table.table, 'min-w-[900px]')}>
          <thead className={table.head}>
            <tr>
              <th className={clsx(table.th, 'w-14')}>Rank</th>
              <th className={table.th}>Entity</th>
              <th className={table.th}>
                <span className="inline-flex items-center gap-1.5">
                  Attention <InfoTip term="attention" />
                </span>
              </th>
              <th className={clsx(table.th, 'text-right')}>Findings</th>
              <th className={table.th}>
                <span className="inline-flex items-center gap-1.5">
                  Weakest area <InfoTip term="capability" />
                </span>
              </th>
              <th className={table.th}>Main reason</th>
              <th className={clsx(table.th, 'w-32')}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pg.slice.map((e) => {
              const [weakKey, weakVal] = Object.entries(e.capabilities).sort((a, b) => a[1] - b[1])[0] ?? ['', 100]
              const tone = healthTone(weakVal)
              const isOpen = open === e.entity_code
              const band = saiBand(e.sai) as SeverityLevel
              return (
                <Fragment key={e.entity_code}>
                  <tr
                    className={clsx(
                      table.row,
                      isOpen && 'border-b-0 bg-surface-2/40',
                      band === 4 && !isOpen && 'bg-[color-mix(in_srgb,var(--sev-critical)_3.5%,transparent)]',
                    )}
                  >
                    <td className={clsx(table.td, 'num py-4 font-semibold text-muted')}>{e.rank}</td>
                    <td className={clsx(table.td, 'min-w-[16rem] py-4')}>
                      <Link to={`/entities/${e.entity_code}`} className="font-semibold text-ink hover:text-accent-ink">
                        {e.entity_name}
                      </Link>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {e.entity_code} · {SECTOR_LABEL[e.sector]}
                      </p>
                    </td>
                    <td className={clsx(table.td, 'py-4')}>
                      <SaiPill sai={e.sai} />
                    </td>
                    <td className={clsx(table.td, 'num py-4 text-right font-semibold')}>
                      {e.findings ? (
                        <span style={{ color: severityColor(band === 1 ? 2 : band) }}>{e.findings}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={clsx(table.td, 'w-52 py-4')}>
                      {weakVal < 100 ? (
                        <div className="space-y-2">
                          <p className="flex justify-between gap-3 text-[13px]">
                            <span className="text-ink-2">{CAPABILITY_LABEL[weakKey]}</span>
                            <ToneValue value={weakVal.toFixed(0)} tone={tone} />
                          </p>
                          <Meter value={weakVal} color={tone.mark} />
                        </div>
                      ) : (
                        <span className="text-[13px] text-health-good-ink">No concerns found</span>
                      )}
                    </td>
                    <td className={clsx(table.td, 'w-56 py-4 text-[13px] text-ink-2')}>
                      <span className="line-clamp-2">{e.drivers[0]?.title ?? '—'}</span>
                    </td>
                    <td className={clsx(table.td, 'py-4')}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => navigate(`/entities/${e.entity_code}`)}
                          className="rounded-lg bg-ink px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ink-2"
                        >
                          Open
                        </button>
                        <Tooltip content={isOpen ? 'Hide quick look' : 'Quick look without leaving this page'}>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={`Quick look at ${e.entity_name}`}
                            onClick={() => setOpen(isOpen ? null : e.entity_code)}
                            className="rounded-lg border border-line-strong p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                          >
                            <ChevronDown size={16} className={clsx('transition-transform', isOpen && 'rotate-180')} />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line/70 bg-surface-2/40">
                      <td />
                      <td colSpan={6} className="px-6 pt-1 pb-7">
                        <QuickLook e={e} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {pg.total === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-muted">
                  No entities in this group.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onChange={pg.setPage} noun={noun} />
    </div>
  )
}

function QuickLook({ e }: { e: ScoreOut }) {
  const caps = Object.entries(e.capabilities).sort((a, b) => a[1] - b[1])
  return (
    <div className="grid gap-8 rounded-2xl border border-line bg-surface p-6 lg:grid-cols-2">
      <div>
        <p className="text-sm leading-relaxed text-ink-2">{e.summary}</p>
        {e.drivers.length > 0 && (
          <>
            <p className="mt-5 mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted">What drives the score</p>
            <ul className="space-y-2">
              {e.drivers.map((d) => (
                <li key={d.finding_id} className="flex items-start justify-between gap-4 text-sm">
                  <span className="text-ink">{d.title}</span>
                  <Tooltip content="This finding’s weight in the score: severity (1–4) × how sure the tool is (0–1).">
                    <span tabIndex={0} className="num shrink-0 cursor-help text-xs text-muted">
                      weight {d.weight.toFixed(1)}
                    </span>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            to={`/entities/${e.entity_code}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-2"
          >
            Open entity <ArrowRight size={14} />
          </Link>
          <Link
            to={`/review?entity=${e.entity_code}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line-strong px-4 py-2 text-[13px] font-medium text-ink hover:bg-surface-2"
          >
            <ClipboardCheck size={14} /> Records to check
          </Link>
          <Link
            to={`/briefing/${e.entity_code}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line-strong px-4 py-2 text-[13px] font-medium text-ink hover:bg-surface-2"
          >
            <FileText size={14} /> Printable summary
          </Link>
        </div>
      </div>
      <div>
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          All eight areas <InfoTip term="capability" />
        </p>
        <ul className="space-y-3">
          {caps.map(([cap, v]) => {
            const t = healthTone(v)
            return (
              <li key={cap} className="grid grid-cols-[11rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-[13px]">
                <span className="text-ink-2">{CAPABILITY_LABEL[cap] ?? cap}</span>
                <Meter value={v} color={t.mark} />
                <ToneValue value={v.toFixed(0)} tone={t} className="text-right" />
              </li>
            )
          })}
        </ul>
        <Legend items={HEALTH_LEGEND} className="mt-5 text-xs" />
      </div>
    </div>
  )
}
