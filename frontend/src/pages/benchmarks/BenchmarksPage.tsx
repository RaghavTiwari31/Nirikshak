import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useBenchmark, useScores } from '@/api/supervise'
import { BenchmarkBars } from '@/components/charts/BenchmarkBars'
import { Details } from '@/components/Details'
import { Legend, Page, PageHeader, Segmented, ViewToggle } from '@/components/supervise'
import { Pagination } from '@/components/Pagination'
import { table } from '@/components/table'
import { Card, CardHeader, Field, inputClass } from '@/components/ui'
import { FEATURE_BETTER, featureFormatter } from '@/lib/features'
import { SECTOR_LABEL } from '@/lib/labels'
import { BAND_LABEL, saiBand, severityColor } from '@/lib/severity'
import { usePage } from '@/lib/usePage'

type Cohort = '' | '24x7' | 'business_hours'
const COHORTS: { key: Cohort; label: string }[] = [
  { key: '', label: 'All entities' },
  { key: '24x7', label: 'Round-the-clock teams' },
  { key: 'business_hours', label: 'Office-hours teams' },
]

export function BenchmarksPage() {
  const [feature, setFeature] = useState('median_close_h_high_crit')
  const [cohort, setCohort] = useState<Cohort>('')
  const [highlight, setHighlight] = useState<string | null>(null)
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const { data, isPlaceholderData } = useBenchmark(feature)
  const scores = useScores()
  const format = useMemo(() => featureFormatter(feature, data?.percent ?? false), [feature, data?.percent])
  const filtered = useMemo(
    () => (data ? { ...data, points: data.points.filter((p) => !cohort || p.cohort === cohort) } : null),
    [data, cohort],
  )
  const focus = highlight ?? scores.data?.items[0]?.entity_code ?? null
  const focusPoint = filtered?.points.find((p) => p.entity_code === focus)
  const bandOf = useMemo(
    () => Object.fromEntries((scores.data?.items ?? []).map((s) => [s.entity_code, saiBand(s.sai)])),
    [scores.data],
  )
  const tablePage = usePage(filtered?.points ?? [], 10, `${feature}-${cohort}`)

  return (
    <Page>
      <PageHeader eyebrow="Analyse" title="Compare Entities">
        Pick a measure and see every entity side by side over the whole period. Compare like with like: teams that
        only work office hours naturally take longer to respond at night.
      </PageHeader>

      <div className="grid gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card md:grid-cols-[minmax(0,2fr)_auto_minmax(0,1.2fr)] md:items-end">
        <Field label="Measure">
          <select aria-label="Measure" className={inputClass} value={feature} onChange={(e) => setFeature(e.target.value)}>
            {data?.features.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="space-y-2">
          <span className="block text-[13px] font-medium text-ink-2">Compare within</span>
          <Segmented value={cohort} options={COHORTS} onChange={setCohort} label="Compare within" />
        </div>
        <Field label="Highlight an entity">
          <select
            aria-label="Highlight an entity"
            className={inputClass}
            value={focus ?? ''}
            onChange={(e) => setHighlight(e.target.value || null)}
          >
            {(scores.data?.items ?? []).map((s) => (
              <option key={s.entity_code} value={s.entity_code}>
                {s.entity_name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {filtered && focusPoint && (
        <FocusSummary
          name={focusPoint.entity_name}
          code={focusPoint.entity_code}
          value={focusPoint.value}
          values={filtered.points.map((p) => p.value)}
          median={filtered.median}
          feature={feature}
          label={filtered.label}
          format={format}
        />
      )}

      {filtered && (
        <Card className={clsx('transition-opacity', isPlaceholderData && 'opacity-60')}>
          <CardHeader
            title={filtered.label}
            subtitle={`${filtered.points.length} entities, highest at the top, coloured by attention level. The dashed line marks the typical value (${filtered.median !== null ? format(filtered.median) : '—'}). Select a bar to open that entity.`}
            action={<ViewToggle view={view} onChange={setView} />}
          />
          {view === 'chart' ? (
            <div className="px-5 pb-6">
              <Legend
                className="px-2 pb-2 text-xs"
                items={[
                  ...([4, 3, 2, 1] as const).map((b) => ({ mark: severityColor(b), label: BAND_LABEL[b] })),
                  { mark: 'var(--ink)', label: 'Outlined: the highlighted entity' },
                ]}
              />
              <BenchmarkBars data={filtered} highlight={focus} format={format} bandOf={bandOf} />
            </div>
          ) : (
            <div className={clsx(table.wrap, 'border-t border-line')}>
              <table className={clsx(table.table, 'min-w-[620px]')}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Entity</th>
                    <th className={table.th}>Sector</th>
                    <th className={table.th}>Team hours</th>
                    <th className={clsx(table.th, 'text-right')}>Value</th>
                    <th className={clsx(table.th, 'text-right')}>Attention rank</th>
                  </tr>
                </thead>
                <tbody>
                  {tablePage.slice.map((p) => (
                    <tr key={p.entity_code} className={clsx(table.row, p.entity_code === focus && 'bg-accent-soft')}>
                      <td className={clsx(table.td, 'py-3')}>
                        <Link className="font-medium hover:text-accent-ink" to={`/entities/${p.entity_code}`}>
                          {p.entity_name}
                        </Link>
                      </td>
                      <td className={clsx(table.td, 'py-3 text-ink-2')}>{SECTOR_LABEL[p.sector]}</td>
                      <td className={clsx(table.td, 'py-3 text-ink-2')}>
                        {p.cohort === '24x7' ? 'Round the clock' : 'Office hours'}
                      </td>
                      <td className={clsx(table.td, 'num py-3 text-right font-medium')}>{format(p.value)}</td>
                      <td className={clsx(table.td, 'num py-3 text-right text-muted')}>{p.rank ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={tablePage.page}
                pages={tablePage.pages}
                total={tablePage.total}
                size={tablePage.size}
                onChange={tablePage.setPage}
                noun="entities"
              />
            </div>
          )}
        </Card>
      )}
    </Page>
  )
}

/** Layer 1: where the highlighted entity stands. Layer 2: how to read it. */
function FocusSummary({
  name,
  code,
  value,
  values,
  median,
  feature,
  label,
  format,
}: {
  name: string
  code: string
  value: number
  values: number[]
  median: number | null
  feature: string
  label: string
  format: (v: number) => string
}) {
  const higher = values.filter((v) => v > value).length
  const position = higher + 1
  const better = FEATURE_BETTER[feature] ?? 'neither'
  const diff = median !== null && median !== 0 ? value / median : null
  return (
    <section className="rounded-2xl border border-line bg-surface p-7 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Where {name} stands</p>
          <p className="mt-3 text-[17px] leading-relaxed text-ink">
            <strong className="font-semibold">{format(value)}</strong>, compared with a typical{' '}
            <strong className="font-semibold">{median !== null ? format(median) : '—'}</strong>. That puts it{' '}
            <strong className="font-semibold">
              #{position} of {values.length}
            </strong>{' '}
            from the top on this measure.
          </p>
        </div>
        <Link
          to={`/entities/${code}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line-strong px-4 py-2 text-[13px] font-medium text-ink hover:bg-surface-2"
        >
          Open entity <ArrowRight size={14} />
        </Link>
      </div>
      <Details className="mt-3" label="How to read this">
        <ul className="max-w-3xl space-y-2 text-sm leading-relaxed text-ink-2">
          <li>
            <strong className="font-semibold text-ink">{label}</strong> is measured over the whole assessment period.
          </li>
          <li>
            {better === 'lower' && 'Lower is generally better for this measure.'}
            {better === 'higher' && 'Higher is generally better for this measure.'}
            {better === 'neither' &&
              'Neither high nor low is automatically good here: very unusual values in either direction are worth a question.'}
          </li>
          {diff !== null && (
            <li>
              {name} is at {diff.toFixed(1)}× the typical value. Findings are only raised when an entity is far outside
              the usual spread, not merely above or below the middle.
            </li>
          )}
        </ul>
      </Details>
    </section>
  )
}
