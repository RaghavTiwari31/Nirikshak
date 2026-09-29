import clsx from 'clsx'
import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useBenchmark, useScores, useSignalFindings, useTrends } from '@/api/supervise'
import { type TrendLine, TrendChart } from '@/components/charts/TrendChart'
import { EmptyState, Page, PageHeader, ViewToggle } from '@/components/supervise'
import { Pagination } from '@/components/Pagination'
import { table } from '@/components/table'
import { Tooltip } from '@/components/Tooltip'
import { Card, CardHeader, Field, inputClass } from '@/components/ui'
import { featureFormatter } from '@/lib/features'
import { usePage } from '@/lib/usePage'
import { EvidenceTrail } from '@/pages/findings/EvidenceTrail'
import { FindingCard } from '@/pages/findings/FindingCard'

const MAX_FOCUS = 3 // the three focus colours are validated for all-pairs use
const FOCUS_ROLES = ['focus-1', 'focus-2', 'focus-3'] as const
const FOCUS_COLORS = ['var(--viz-entity)', 'var(--viz-series-2)', 'var(--viz-series-3)']

export function TrendsPage() {
  const [feature, setFeature] = useState('median_close_h')
  const [picked, setPicked] = useState<string[] | null>(null)
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [openFinding, setOpenFinding] = useState<number | null>(null)
  const { data, isPlaceholderData } = useTrends(feature)
  const scores = useScores()
  const deteriorating = useSignalFindings('TR-01')
  const features = useBenchmark(feature).data?.features ?? []
  const format = useMemo(() => featureFormatter(feature, data?.percent ?? false), [feature, data?.percent])
  const nameOf = useMemo(
    () => Object.fromEntries((scores.data?.items ?? []).map((s) => [s.entity_code, s.entity_name])),
    [scores.data],
  )

  // Default focus: entities flagged as getting worse (TR-01), topped up with the
  // highest-attention entities, so the view opens on the story trends exist to tell.
  const focus =
    picked ??
    [
      ...new Set([
        ...(deteriorating.data?.items ?? []).map((f) => f.entity_code),
        ...(scores.data?.items ?? []).map((s) => s.entity_code),
      ]),
    ].slice(0, MAX_FOCUS)

  const lines: TrendLine[] = useMemo(() => {
    if (!data) return []
    const context = data.series
      .filter((s) => !focus.includes(s.entity_code))
      .map((s) => ({ name: s.entity_code, values: s.values, role: 'context' as const }))
    const focused = focus.flatMap((code, i) => {
      const s = data.series.find((x) => x.entity_code === code)
      return s ? [{ name: code, values: s.values, role: FOCUS_ROLES[i] ?? 'focus-3' }] : []
    })
    return [...context, { name: 'Typical', values: data.median, role: 'median' as const }, ...focused]
  }, [data, focus])

  const monthIdx = useMemo(() => (data?.periods ?? []).map((_, i) => i), [data])
  const monthPage = usePage(monthIdx, 10, feature)

  const toggle = (code: string) => {
    const next = focus.includes(code) ? focus.filter((c) => c !== code) : [...focus, code].slice(-MAX_FOCUS)
    setPicked(next)
  }

  return (
    <Page>
      <PageHeader eyebrow="Analyse" title="Trends">
        How any measure changed month by month. Up to three entities are highlighted against the typical value; the
        rest stay faint in the background. It opens on the entities whose teams are getting steadily worse.
      </PageHeader>

      <div className="grid gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,2fr)] md:items-end">
        <Field label="Measure">
          <select aria-label="Measure" className={inputClass} value={feature} onChange={(e) => setFeature(e.target.value)}>
            {features.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Highlight up to ${MAX_FOCUS} entities`}>
          <select
            aria-label="Add an entity"
            className={inputClass}
            value=""
            onChange={(e) => e.target.value && toggle(e.target.value)}
          >
            <option value="">Add an entity…</option>
            {(scores.data?.items ?? []).map((s) => (
              <option key={s.entity_code} value={s.entity_code}>
                {s.entity_name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-2 pb-1">
          {focus.map((code, i) => (
            <Tooltip key={code} content="Remove from the chart">
              <button
                type="button"
                onClick={() => toggle(code)}
                className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium hover:bg-surface-2"
                aria-label={`Remove ${code}`}
              >
                <span className="size-2.5 rounded-full" style={{ background: FOCUS_COLORS[i] }} />
                {code}
                <X size={13} className="text-muted" />
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {data && (
        <Card className={clsx('transition-opacity', isPlaceholderData && 'opacity-60')}>
          <CardHeader
            title={data.label}
            subtitle={
              <span className="flex flex-wrap items-center gap-5">
                <span className="inline-flex items-center gap-2">
                  <span className="w-5" style={{ borderTop: '2px dashed var(--viz-median)' }} /> Typical for all entities
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-5" style={{ borderTop: '2px solid var(--viz-context)' }} /> Other entities
                </span>
                <span>Hover the chart to read exact values.</span>
              </span>
            }
            action={<ViewToggle view={view} onChange={setView} />}
          />
          {view === 'chart' ? (
            <div className="px-5 pb-6">
              <TrendChart periods={data.periods} lines={lines} format={format} height={420} />
            </div>
          ) : (
            <div className={clsx(table.wrap, 'border-t border-line')}>
              <table className={clsx(table.table, 'min-w-[640px]')}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Month</th>
                    <th className={clsx(table.th, 'text-right')}>Typical</th>
                    {focus.map((c) => (
                      <th key={c} className={clsx(table.th, 'text-right')}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthPage.slice.map((i) => ({ p: data.periods[i] as string, i })).map(({ p, i }) => (
                    <tr key={p} className={table.row}>
                      <td className={clsx(table.td, 'py-3')}>
                        {new Date(p).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      </td>
                      <td className={clsx(table.td, 'num py-3 text-right')}>
                        {data.median[i] != null ? format(data.median[i] as number) : '—'}
                      </td>
                      {focus.map((c) => {
                        const v = data.series.find((s) => s.entity_code === c)?.values[i]
                        return (
                          <td key={c} className={clsx(table.td, 'num py-3 text-right')}>
                            {v != null ? format(v) : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={monthPage.page}
                pages={monthPage.pages}
                total={monthPage.total}
                size={monthPage.size}
                onChange={monthPage.setPage}
                noun="months"
              />
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader
          title="Declining Teams"
          subtitle="Entities whose recent months are clearly worse than their own earlier months, with when the decline began."
          help="trend"
        />
        <div className="grid gap-5 px-7 pb-7 xl:grid-cols-2">
          {deteriorating.data?.items.length ? (
            deteriorating.data.items.map((f) => (
              <FindingCard key={f.id} f={{ ...f, entity_name: nameOf[f.entity_code] ?? f.entity_name }} showEntity onOpen={() => setOpenFinding(f.id)} />
            ))
          ) : (
            <EmptyState>No entity is getting steadily worse in this period.</EmptyState>
          )}
        </div>
      </Card>

      {openFinding !== null && <EvidenceTrail findingId={openFinding} onClose={() => setOpenFinding(null)} />}
    </Page>
  )
}
