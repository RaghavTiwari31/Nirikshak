import clsx from 'clsx'
import { Fingerprint, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { type SignalOut, useLatestRun, useSignalLibrary } from '@/api/analysis'
import { Details, Fact } from '@/components/Details'
import { Page, PageHeader, SeverityTag, Tabs } from '@/components/supervise'
import { InfoTip, Tooltip } from '@/components/Tooltip'
import { inputClass } from '@/components/ui'
import { GLOSSARY } from '@/lib/glossary'
import { humanize } from '@/lib/format'
import { CAPABILITY_LABEL, FAMILY_HELP, FAMILY_LABEL, fmtParam, PARAM_LABEL } from '@/lib/taxonomy'
import { FAMILY_COLOR } from '@/lib/tones'

type Family = '' | 'execution_gap' | 'negative_space' | 'trend' | 'anomaly'
const FILTERS: { key: Family; label: string }[] = [
  { key: '', label: 'All checks' },
  { key: 'execution_gap', label: 'Claim vs evidence' },
  { key: 'negative_space', label: 'Missing evidence' },
  { key: 'trend', label: 'Getting worse' },
  { key: 'anomaly', label: 'Unusual pattern' },
]

export function SignalLibraryPage() {
  const { data } = useSignalLibrary()
  const latest = useLatestRun()
  const [family, setFamily] = useState<Family>('')
  const [query, setQuery] = useState('')

  const signals = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.signals ?? []).filter(
      (s) =>
        (!family || s.family === family) &&
        (!q || `${s.id} ${s.name} ${s.description} ${s.capability}`.toLowerCase().includes(q)),
    )
  }, [data, family, query])

  return (
    <Page>
      <PageHeader
        eyebrow="Operate"
        title="How Checks Work"
        action={
          data && (
            <Tooltip content={`${GLOSSARY.fingerprint} Current settings: version ${data.config_version}.`}>
              <p
                tabIndex={0}
                className="flex cursor-help items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13px] text-ink-2 shadow-card"
              >
                <Fingerprint size={15} className="text-accent-ink" />
                Settings v{data.config_version} · {data.config_sha256.slice(0, 12)}
              </p>
            </Tooltip>
          )
        }
      >
        Every check the tool runs, in plain words: what it looks at, why it matters, and exactly when it raises a
        finding. The same rules apply to every entity. Most checks need both a clear problem <em>and</em> a result that
        is unusual compared with other entities.
      </PageHeader>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Tabs
            label="Kind of check"
            value={family}
            onChange={setFamily}
            options={FILTERS.map((f) => ({
              key: f.key,
              label: f.label,
              count: (data?.signals ?? []).filter((x) => !f.key || x.family === f.key).length,
              tone: f.key ? FAMILY_COLOR[f.key] : undefined,
            }))}
          />
        </div>
        <label className="relative mb-2 w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input
            className={clsx(inputClass, 'pl-10')}
            placeholder="Search checks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        {signals.map((s) => (
          <SignalCard key={s.id} signal={s} flagged={latest.data?.findings_by_signal[s.id]} />
        ))}
      </div>
    </Page>
  )
}

function SignalCard({ signal: s, flagged }: { signal: SignalOut; flagged?: number }) {
  const params = Object.entries(s.params)
  const help = FAMILY_HELP[s.family as keyof typeof FAMILY_HELP]
  return (
    <article
      className="flex flex-col rounded-2xl border border-line border-t-4 bg-surface p-7 shadow-card"
      style={{ borderTopColor: FAMILY_COLOR[s.family] ?? 'var(--line)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.12em] text-accent-ink">
            {FAMILY_LABEL[s.family]}
            {help && <InfoTip term={help} />}
          </span>
          <SeverityTag level={s.severity} />
        </div>
        {flagged !== undefined && (
          <span className="num shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2">
            {flagged} in latest analysis
          </span>
        )}
      </div>
      <h2 className="mt-3 text-[17px] leading-snug font-semibold tracking-tight">{s.name}</h2>
      <p className="mt-1 text-[13px] text-muted">
        {s.id} · affects {CAPABILITY_LABEL[s.capability] ?? s.capability}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-ink-2">{s.description}</p>

      <Details className="mt-3" label="Why it matters and when it fires" openLabel="Hide">
        <p className="text-sm leading-relaxed text-ink-2">{s.rationale}</p>
        <p className="mt-5 mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Raises a finding when all of these hold
        </p>
        <ul className="space-y-2 text-sm">
          {params.map(([k, v]) => (
            <li key={k} className="flex items-baseline justify-between gap-4 border-b border-line/70 pb-2">
              <span className="text-ink-2">{PARAM_LABEL[k] ?? humanize(k)}</span>
              <span className="num font-semibold">{fmtParam(k, v)}</span>
            </li>
          ))}
          {s.peer_z_min !== null && (
            <li className="flex items-baseline justify-between gap-4 border-b border-line/70 pb-2">
              <span className="flex items-center gap-1.5 text-ink-2">
                Unusually {s.direction === 'high' ? 'high' : 'low'} compared with others, at least{' '}
                <InfoTip term="unusual" />
              </span>
              <span className="num font-semibold">{s.peer_z_min}</span>
            </li>
          )}
          <li className="flex items-baseline justify-between gap-4">
            <span className="text-ink-2">Records needed, at least</span>
            <span className="num font-semibold">{s.min_support}</span>
          </li>
        </ul>

        <Details nested className="mt-4" label="Technical settings" openLabel="Hide technical settings">
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <Fact label="Check code">{s.id}</Fact>
            <Fact label="Version">v{s.version}</Fact>
            <Fact label="Worse when">{s.direction === 'high' ? 'Higher' : 'Lower'}</Fact>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Thresholds live in one settings file whose fingerprint is saved with every analysis, so any finding can be
            traced to the exact rules that produced it.
          </p>
        </Details>
      </Details>
    </article>
  )
}
