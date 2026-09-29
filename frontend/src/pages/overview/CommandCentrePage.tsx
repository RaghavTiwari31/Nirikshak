import { ArrowRight, Fingerprint } from 'lucide-react'
import { Link } from 'react-router'
import { useLatestRun, useSignalLibrary } from '@/api/analysis'
import { usePacks, useScores } from '@/api/supervise'
import { Constellation } from '@/components/charts/Constellation'
import { Details } from '@/components/Details'
import { EntityTable } from '@/components/EntityTable'
import { EmptyState, Page, PageHeader, SectionLabel, Stat } from '@/components/supervise'
import { InfoTip, Tooltip } from '@/components/Tooltip'
import { Card, CardHeader, cardBody } from '@/components/ui'
import { fmtDate, fmtDateTime, fmtInt } from '@/lib/format'
import { GLOSSARY } from '@/lib/glossary'
import { BAND_LABEL, saiBand, severityColor, severityInk } from '@/lib/severity'
import { FAMILY_HELP, FAMILY_LABEL } from '@/lib/taxonomy'
import { FAMILY_COLOR } from '@/lib/tones'

export function CommandCentrePage() {
  const scores = useScores()
  const run = useLatestRun()
  const packs = usePacks()
  const lib = useSignalLibrary()
  const items = scores.data?.items ?? []

  if (scores.isSuccess && items.length === 0) {
    return (
      <Page>
        <PageHeader eyebrow="Supervise" title="Overview" />
        <EmptyState>
          Nothing has been analysed yet. Upload the entities’ files, then start an analysis from the{' '}
          <Link className="font-medium text-accent-ink underline underline-offset-4" to="/audit">
            Activity Log
          </Link>
          .
        </EmptyState>
      </Page>
    )
  }

  const attention = items.filter((i) => i.sai >= 50)
  const priority = items.filter((i) => i.sai >= 75)
  const findings = items.reduce((n, i) => n + i.findings, 0)
  const samples = packs.data?.reduce((n, p) => n + p.samples, 0) ?? 0
  const reviewed = packs.data?.reduce((n, p) => n + p.reviewed, 0) ?? 0
  const familyOf = Object.fromEntries((lib.data?.signals ?? []).map((s) => [s.id, s.family]))
  const byFamily: Record<string, number> = {}
  for (const [sig, n] of Object.entries(run.data?.findings_by_signal ?? {})) {
    const fam = familyOf[sig] ?? 'other'
    byFamily[fam] = (byFamily[fam] ?? 0) + n
  }
  const famTotal = Math.max(1, Object.values(byFamily).reduce((a, b) => a + b, 0))
  const bands = ([4, 3, 2, 1] as const).map((b) => ({ band: b, n: items.filter((i) => saiBand(i.sai) === b).length }))
  const sectors = new Set(items.map((i) => i.sector)).size

  return (
    <Page>
      <PageHeader
        eyebrow="Supervise"
        title="Overview"
        action={
          run.data && (
            <Tooltip content={`${GLOSSARY.run} This page shows analysis #${run.data.id}.`}>
              <p
                tabIndex={0}
                className="flex cursor-help items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13px] text-ink-2 shadow-card"
              >
                <Fingerprint size={15} className="text-accent-ink" />
                Analysis #{run.data.id} · {fmtDate(run.data.window_start)} – {fmtDate(run.data.window_end)}
              </p>
            </Tooltip>
          )
        }
      >
        <p>
          Which entities’ security teams need a closer look, and why. Every score here can be traced to findings,
          and every finding to the entity’s own records.
        </p>
        <Details label="New here? How to use this page" openLabel="Hide the guide" className="mt-3">
          <ol className="grid gap-4 text-sm text-ink-2 sm:grid-cols-3">
            {[
              ['Spot who needs attention', 'Entities further from the centre of the map, and higher in the Priority Queue, need a look first.'],
              ['Open an entity', 'Select any entity to see what was found, the evidence behind it and how it compares with others.'],
              ['Check and decide', 'Accept or reject each finding and review the records the tool picked. You make the final call.'],
            ].map(([title, body], i) => (
              <li key={title} className="rounded-2xl border border-line bg-surface p-5">
                <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-ink">
                  {i + 1}
                </span>
                <p className="mt-3 font-semibold text-ink">{title}</p>
                <p className="mt-1 leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>
        </Details>
      </PageHeader>

      <SectionLabel>At a Glance</SectionLabel>
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key figures">
        <Stat
          label="Entities Assessed"
          value={fmtInt(items.length)}
          hint={`Across ${sectors} sectors`}
          helpText="Critical sector entities whose submissions were included in this analysis."
          to="/entities"
        />
        <Stat
          label="Need a Closer Look"
          value={fmtInt(attention.length)}
          hint={`${priority.length} at Priority · attention score 50+`}
          help="attention"
          tone={attention.length ? severityInk(3) : undefined}
          alert={priority.length > 0}
          to="/entities"
        />
        <Stat
          label="Findings Raised"
          value={fmtInt(findings)}
          hint={run.data?.finished_at ? `Analysis finished ${fmtDateTime(run.data.finished_at)}` : undefined}
          help="finding"
          to="/signals"
        />
        <Stat
          label="Records Checked"
          value={samples ? `${Math.round((reviewed / samples) * 100)}%` : '—'}
          hint={`${fmtInt(reviewed)} of ${fmtInt(samples)} picked records, across ${packs.data?.length ?? 0} entities`}
          help="reviewPack"
          to="/review"
        />
      </section>

      <SectionLabel>Where to Look</SectionLabel>
      <Card>
        <CardHeader
          title="Entity Map"
          subtitle="Each dot is an entity, grouped around its sector. The further out it sits, the higher its attention score. Hover for a summary, click to open it."
          help="attention"
        />
        <div className="px-4">{items.length > 0 && <Constellation items={items} height={660} />}</div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line px-7 py-5 text-[13px] text-ink-2" aria-label="Legend">
          {([1, 2, 3, 4] as const).map((band) => (
            <li key={band} className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: severityColor(band) }} />
              {BAND_LABEL[band]}
              <span className="text-muted">{['under 25', '25–49', '50–74', '75+'][band - 1]}</span>
            </li>
          ))}
          <li className="text-muted">Dashed rings mark scores of 25, 50 and 75 · bigger dots mean higher scores</li>
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Priority Queue"
          subtitle="Every entity, most urgent first. Filter by attention level, open an entity, or use the arrow for a quick look."
          action={
            <Link to="/entities" className="flex items-center gap-1.5 text-[13px] font-medium text-accent-ink hover:text-ink">
              All entities <ArrowRight size={14} />
            </Link>
          }
        />
        <EntityTable items={items} />
      </Card>

      <SectionLabel>What Was Found</SectionLabel>
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <Card>
          <CardHeader title="Problems Found" subtitle="Findings in this analysis, by type. Hover a type for what it means." />
          <ul className={`space-y-5 ${cardBody}`}>
            {Object.entries(byFamily)
              .sort((a, b) => b[1] - a[1])
              .map(([fam, n]) => (
                <li key={fam}>
                  <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className="size-2.5 rounded-full" style={{ background: FAMILY_COLOR[fam] }} />
                      {FAMILY_LABEL[fam] ?? fam}
                      {fam in FAMILY_HELP && <InfoTip term={FAMILY_HELP[fam as keyof typeof FAMILY_HELP]} />}
                    </span>
                    <span className="num">
                      <strong className="font-semibold">{n}</strong>
                      <span className="ml-2 text-muted">{Math.round((n / famTotal) * 100)}%</span>
                    </span>
                  </div>
                  <span className="block h-2.5 rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.max(2, (n / famTotal) * 100)}%`, background: FAMILY_COLOR[fam] }}
                    />
                  </span>
                </li>
              ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Attention Mix" subtitle="How many entities fall in each attention level." help="attention" />
          <ul className={`space-y-5 ${cardBody}`}>
            {bands.map(({ band, n }) => (
              <li key={band}>
                <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                  <span className="flex items-center gap-2 font-medium" style={{ color: severityInk(band) }}>
                    <span className="size-2.5 rounded-full" style={{ background: severityColor(band) }} />
                    {BAND_LABEL[band]}
                    <span className="font-normal text-muted">{['under 25', '25–49', '50–74', '75+'][band - 1]}</span>
                  </span>
                  <span className="num">
                    <strong className="font-semibold">{n}</strong>
                    <span className="ml-2 text-muted">{items.length ? Math.round((n / items.length) * 100) : 0}%</span>
                  </span>
                </div>
                <span className="block h-2.5 rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.max(2, items.length ? (n / items.length) * 100 : 0)}%`,
                      background: severityColor(band),
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  )
}
