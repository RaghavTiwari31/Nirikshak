import clsx from 'clsx'
import { ArrowLeft, ClipboardCheck, FileText, ScanSearch } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { type EntityProfile, useProfile, useScores } from '@/api/supervise'
import { TrendChart } from '@/components/charts/TrendChart'
import { Details } from '@/components/Details'
import { EmptyState, Legend, Meter, Page, SaiPill, ToneValue, ViewToggle } from '@/components/supervise'
import { Pagination } from '@/components/Pagination'
import { InfoTip, Tooltip } from '@/components/Tooltip'
import { table } from '@/components/table'
import { Card, CardHeader, cardBody } from '@/components/ui'
import { GLOSSARY } from '@/lib/glossary'
import { SECTOR_LABEL } from '@/lib/labels'
import { SEVERITY_LABEL } from '@/lib/severity'
import { CAPABILITY_LABEL } from '@/lib/taxonomy'
import { HEALTH_LEGEND, healthTone } from '@/lib/tones'
import { usePage } from '@/lib/usePage'
import { EvidenceTrail } from '@/pages/findings/EvidenceTrail'
import { FindingCard } from '@/pages/findings/FindingCard'

const TREND_METRICS: { key: string; label: string; help: string; format: (v: number) => string }[] = [
  {
    key: 'median_close_h_high_crit',
    label: 'Time to close serious alerts',
    help: 'Typical hours from a high or critical alert being raised to being closed. Lower is faster.',
    format: (v) => `${v.toFixed(1)} h`,
  },
  {
    key: 'median_ack_min',
    label: 'Time until someone responds',
    help: 'Typical minutes before an analyst first picks up an alert. Lower is faster.',
    format: (v) => `${v.toFixed(0)} min`,
  },
  {
    key: 'escalation_rate',
    label: 'Serious cases passed upward',
    help: 'Share of confirmed serious cases escalated to senior staff, management or CERT-In. Higher is better.',
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'median_note_chars',
    label: 'Length of closing notes',
    help: 'Typical length, in characters, of the note written when a case is closed. Very short notes suggest little investigation.',
    format: (v) => v.toFixed(0),
  },
]

const SOC_MODEL: Record<string, string> = {
  mssp: 'Outsourced security team',
  in_house: 'In-house security team',
  hybrid: 'Mixed in-house and outsourced team',
}

export function EntityProfilePage() {
  const { code } = useParams()
  const { data: p, isError } = useProfile(code)
  const total = useScores().data?.items.length
  const [openFinding, setOpenFinding] = useState<number | null>(null)
  const [trendView, setTrendView] = useState<'chart' | 'table'>('chart')

  const months = useMemo(() => (p?.monthly ?? []).map((m) => m.period), [p])
  const peerByMonth = useMemo(() => new Map((p?.peer_monthly ?? []).map((m) => [m.period, m.features])), [p])
  const monthPage = usePage(p?.monthly ?? [], 10)

  if (isError) {
    return (
      <Page>
        <EmptyState>No entity with the code {code} was found.</EmptyState>
      </Page>
    )
  }
  if (!p) return <div className="p-12 text-sm text-muted">Loading entity…</div>

  const score = p.score
  const caps = Object.entries(score?.capabilities ?? {}).sort((a, b) => a[1] - b[1])

  return (
    <Page>
      <Link
        to="/entities"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} /> All entities
      </Link>

      <header className="-mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-ink">
            {SECTOR_LABEL[p.sector]} · {p.size_tier} size
          </p>
          <h1 className="mt-2 text-[30px] leading-tight font-semibold tracking-tight">{p.entity_name}</h1>
          <p className="mt-1 text-sm text-muted">
            {p.entity_code} · {SOC_MODEL[p.soc_model] ?? p.soc_model}
          </p>
          {score && <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-ink-2">{score.summary}</p>}
          <nav className="mt-6 flex flex-wrap gap-3" aria-label="Entity actions">
            <ActionLink
              to={`/negative-space?entity=${p.entity_code}`}
              icon={ScanSearch}
              label="Missing evidence"
              help="See which alerts other entities would expect here but this entity never reported."
            />
            <ActionLink
              to={`/review?entity=${p.entity_code}`}
              icon={ClipboardCheck}
              label="Records to check"
              help={GLOSSARY.reviewPack}
            />
            <ActionLink
              to={`/briefing/${p.entity_code}`}
              icon={FileText}
              label="Printable summary"
              help="A one-page A4 summary of this entity, ready to print or save as PDF."
            />
          </nav>
        </div>
        {score && (
          <div className="flex min-w-60 flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-7 shadow-card lg:items-end">
            <p className="flex items-center gap-1.5 text-sm text-muted">
              Attention score <InfoTip term="attention" />
            </p>
            <p className="text-6xl leading-none font-semibold tracking-tight">{score.sai.toFixed(0)}</p>
            <div className="flex items-center gap-3">
              <SaiPill sai={score.sai} />
              <span className="text-[13px] text-muted">
                #{score.rank} of {total ?? '—'}
              </span>
            </div>
          </div>
        )}
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-8">
          <Card>
            <CardHeader
              title="Health by Area"
              subtitle="100 means no concerns. The grey tick is the typical score of other entities. Open an area to see what lowered it."
              help="capability"
            />
            <ul className={clsx(cardBody, 'space-y-5')}>
              {caps.map(([k, v]) => (
                <CapabilityRow key={k} capability={k} value={v} peer={p.peer_capability_median[k]} profile={p} />
              ))}
            </ul>
            <Legend items={HEALTH_LEGEND} className="border-t border-line px-7 py-4 text-xs" />
          </Card>

          <Card>
            <CardHeader
              title="Entity Claims"
              subtitle="The entity’s own claims. The tool checks them against its records."
              help="declared"
            />
            <dl className={clsx(cardBody, 'divide-y divide-line/70')}>
              <Declared
                label="Round-the-clock monitoring"
                value={p.declared_24x7 ? 'Yes, claimed' : 'Not claimed'}
                help="Whether the entity says its security team watches alerts 24 hours a day, 7 days a week."
              />
              <Declared
                label="Promised fix time"
                value={p.declared_mttr_hours !== null ? `${p.declared_mttr_hours.toFixed(1)} hours` : '—'}
                help="The average time the entity says it takes to resolve an alert (its declared mean time to resolve)."
              />
              <Declared
                label="Machines monitored"
                value={p.declared_coverage_pct !== null ? `${p.declared_coverage_pct.toFixed(0)}%` : '—'}
                help="The share of its machines the entity says are connected to monitoring."
              />
            </dl>
          </Card>
        </div>

        <Card>
          <CardHeader
            title={`Findings (${p.findings.length})`}
            subtitle="Most serious first. Use “View details” for the numbers, or “See the evidence” for the records and your decision."
            help="finding"
          />
          <div className={clsx(cardBody, 'space-y-5')}>
            {p.findings.length === 0 ? (
              <EmptyState>Nothing needing a supervisor’s attention was found for this entity in the latest analysis.</EmptyState>
            ) : (
              p.findings.map((f) => <FindingCard key={f.id} f={f} onOpen={() => setOpenFinding(f.id)} />)
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Monthly Trends"
          subtitle={
            <span className="flex flex-wrap items-center gap-5">
              <LegendLine color="var(--viz-entity)" label={p.entity_name} />
              <LegendLine color="var(--viz-median)" label="Typical for other entities" dashed />
            </span>
          }
          action={<ViewToggle view={trendView} onChange={setTrendView} />}
        />
        {trendView === 'chart' ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 px-7 pb-7 md:grid-cols-2">
            {TREND_METRICS.map((m) => (
              <div key={m.key} className="rounded-xl border border-line/70 p-5">
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  {m.label} <InfoTip text={m.help} />
                </p>
                <TrendChart
                  compact
                  height={200}
                  periods={months}
                  format={m.format}
                  lines={[
                    {
                      name: 'Typical for others',
                      role: 'median',
                      values: months.map((mo) => peerByMonth.get(mo)?.[m.key] ?? null),
                    },
                    {
                      name: p.entity_code,
                      role: 'focus-1',
                      values: p.monthly.map((mo) => (mo.features.alerts ? (mo.features[m.key] ?? null) : null)),
                    },
                  ]}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className={clsx(table.wrap, 'pb-4')}>
            <table className={clsx(table.table, 'min-w-[720px]')}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Month</th>
                  {TREND_METRICS.map((m) => (
                    <th key={m.key} className={clsx(table.th, 'text-right')}>
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthPage.slice.map((mo) => (
                  <tr key={mo.period} className={table.row}>
                    <td className={table.td}>
                      {new Date(mo.period).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                    </td>
                    {TREND_METRICS.map((m) => (
                      <td key={m.key} className={clsx(table.td, 'num text-right')}>
                        {m.format(mo.features[m.key] ?? 0)}{' '}
                        <span className="text-muted">({m.format(peerByMonth.get(mo.period)?.[m.key] ?? 0)})</span>
                      </td>
                    ))}
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
            <p className="px-6 pt-3 text-[13px] text-muted">Typical value for other entities in brackets.</p>
          </div>
        )}
      </Card>

      {openFinding !== null && <EvidenceTrail findingId={openFinding} onClose={() => setOpenFinding(null)} />}
    </Page>
  )
}

/** One capability. Layer 1: score vs peers. Layer 2: the findings that lowered it and how. */
function CapabilityRow({
  capability,
  value,
  peer,
  profile,
}: {
  capability: string
  value: number
  peer: number | undefined
  profile: EntityProfile
}) {
  const related = profile.findings.filter((f) => f.capability === capability)
  const weak = value < 50
  const tone = healthTone(value)
  return (
    <li>
      <p className="mb-2 flex items-baseline justify-between text-sm">
        <span className={weak ? 'font-semibold text-ink' : 'text-ink-2'}>{CAPABILITY_LABEL[capability]}</span>
        <span className="num">
          <ToneValue value={value.toFixed(0)} tone={tone} />
          <span className="text-muted"> · others {(peer ?? 100).toFixed(0)}</span>
        </span>
      </p>
      <Meter value={value} peer={peer} color={tone.mark} thick />
      {related.length > 0 && (
        <Details className="mt-1.5" label={`Why ${value.toFixed(0)}?`} openLabel="Hide">
          <ul className="space-y-2.5 rounded-xl bg-surface-2/60 p-4 text-[13px]">
            {related.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-4">
                <span className="text-ink">{f.title}</span>
                <Tooltip content="Each finding lowers the score by its weight: severity × how sure the tool is.">
                  <span tabIndex={0} className="num shrink-0 cursor-help text-muted">
                    {SEVERITY_LABEL[Math.min(4, Math.max(1, f.severity)) as 1 | 2 | 3 | 4]} ·{' '}
                    {Math.round(f.confidence * 100)}% sure
                  </span>
                </Tooltip>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-xs leading-relaxed text-muted">
            Score = 100 × e<sup>−(sum of weights) ÷ 4</sup>. One serious, near-certain finding brings an area to about 41.
          </p>
        </Details>
      )}
    </li>
  )
}

function ActionLink({ to, icon: Icon, label, help }: { to: string; icon: typeof FileText; label: string; help: string }) {
  return (
    <Tooltip content={help}>
      <Link
        to={to}
        className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 py-2 text-[13px] font-medium text-ink shadow-sm transition-colors hover:bg-surface-2"
      >
        <Icon size={16} className="text-accent-ink" /> {label}
      </Link>
    </Tooltip>
  )
}

function Declared({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <dt className="flex items-center gap-1.5 text-sm text-ink-2">
        {label} <InfoTip text={help} />
      </dt>
      <dd className="text-[15px] font-semibold">{value}</dd>
    </div>
  )
}

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
      <span
        className="h-0 w-5"
        style={{ borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}
