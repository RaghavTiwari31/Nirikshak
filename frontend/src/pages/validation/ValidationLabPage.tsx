import clsx from 'clsx'
import { CircleCheck, CircleX, FlaskConical, Sparkles } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useSignalLibrary } from '@/api/analysis'
import {
  type RobustnessRow,
  useFieldValidation,
  useRobustness,
  useValidationSummary,
  type ValidationSummary,
} from '@/api/validation'
import { YieldChart } from '@/components/charts/YieldChart'
import { Details } from '@/components/Details'
import { EmptyState, Page, PageHeader, Stat, ToneValue, ViewToggle } from '@/components/supervise'
import { Pagination } from '@/components/Pagination'
import { table } from '@/components/table'
import { InfoTip, Tooltip } from '@/components/Tooltip'
import { Card, CardHeader, cardBody } from '@/components/ui'
import { fmtDateTime } from '@/lib/format'
import { rateTone } from '@/lib/tones'
import { usePage } from '@/lib/usePage'

const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`

const METHOD = [
  [
    'Test data with known answers',
    'The test data has nine kinds of weakness planted on purpose in half of the entities; the other half are healthy. Because we know exactly where the problems are, we can count what the tool found, missed and wrongly flagged.',
  ],
  [
    'A problem nobody wrote a rule for',
    'One planted weakness has no rule at all. Finding it shows the tool can spot things nobody anticipated, not just what it was built to look for.',
  ],
  [
    'Fresh data it was never tuned on',
    'The thresholds are frozen and the whole test is repeated on new data, including data where the weaknesses are made fainter, to see where detection starts to slip.',
  ],
  [
    'Checking against real reviewers',
    'In real use, reviewers check records the tool picked and records picked at random. Comparing the two, and recording decisions on each finding, measures the tool against expert judgement on real data.',
  ],
] as const

export function ValidationLabPage() {
  const summary = useValidationSummary()

  return (
    <Page>
      <PageHeader eyebrow="Analyse" title="Accuracy">
        <p>
          How well does the tool find the problems a supervisor would find by hand? Here it is tested on data where the
          answers are known, on fresh data it was never tuned on, and, once in use, against real reviewers’ decisions.
        </p>
        <Details label="How is accuracy tested?" openLabel="Hide the method" className="mt-3">
          <ol className="grid gap-4 md:grid-cols-2">
            {METHOD.map(([title, body], i) => (
              <li key={title} className="flex gap-4 rounded-2xl border border-line bg-surface p-5">
                <span className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-ink">
                  {i + 1}
                </span>
                <span>
                  <p className="text-sm font-semibold text-ink">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{body}</p>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-start gap-2 text-[13px] text-muted">
            <FlaskConical size={15} className="mt-0.5 shrink-0 text-accent-ink" /> Results on test data show the method
            works as designed. They are not a promise about real-world accuracy, which the real-reviewer checks at the
            bottom of this page are built to measure.
          </p>
        </Details>
      </PageHeader>

      {summary.isError ? (
        <EmptyState>
          Accuracy can only be measured on test data with known answers. Generate it with the <code>synth</code> command
          and run an analysis.
        </EmptyState>
      ) : !summary.data ? (
        <p className="text-sm text-muted">Scoring the latest analysis…</p>
      ) : (
        <>
          <Headline s={summary.data} />
          <YieldCard s={summary.data} />
          <SignalTable s={summary.data} />
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 xl:grid-cols-2">
            <Archetypes s={summary.data} />
            <Holdout s={summary.data} />
          </div>
          <Robustness />
          <FieldValidation />
        </>
      )}
    </Page>
  )
}

function Headline({ s }: { s: ValidationSummary }) {
  const e = s.evaluation
  const eff = s.yield_curves.effort_to_target
  const factor = eff?.tool && eff.random ? eff.random / eff.tool : null
  const good = 'var(--ok)'
  return (
    <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Headline results">
      <Stat
        label="Problem entities found"
        value={`${e.weak_caught} of ${e.weak_entities}`}
        hint="Each caught by the check for the problem planted in it"
        helpText={`Entities with a planted weakness that the tool flagged for that weakness. ${'Higher is better.'}`}
        tone={e.weak_caught === e.weak_entities ? good : undefined}
      />
      <Stat
        label="Healthy entities wrongly flagged"
        value={`${e.healthy_flagged.length} of ${e.healthy_entities}`}
        hint={e.healthy_flagged.length ? e.healthy_flagged.join(', ') : 'Not a single false alarm on a healthy entity'}
        helpText="Healthy entities that received any finding at all. Lower is better; zero means no false alarms."
        tone={e.healthy_flagged.length === 0 ? good : undefined}
      />
      <Stat
        label="Entities to review to find 80%"
        value={eff?.tool != null ? String(eff.tool) : '—'}
        hint={
          eff?.random != null
            ? `Instead of ${eff.random} in random order${factor ? `: ${factor.toFixed(1)}× less work` : ''}`
            : undefined
        }
        help="yield"
        tone={factor && factor >= 1.5 ? good : undefined}
      />
      <Stat
        label="Ranking matches experts"
        value={e.ndcg_at_10 != null ? e.ndcg_at_10.toFixed(2) : '—'}
        hint={`Out of 1.00 · the top 10 are ${pct(e.precision_at_10)} real problems`}
        help="ndcg"
        tone={(e.ndcg_at_10 ?? 0) >= 0.85 ? good : undefined}
      />
    </section>
  )
}

function YieldCard({ s }: { s: ValidationSummary }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const y = s.yield_curves
  // When the curves coincide the oracle line is hidden under the tool's; say so in words.
  const matchesOracle = y.tool.length > 0 && y.tool.every((v, i) => Math.abs(v - (y.oracle[i] ?? -1)) < 1e-9)
  const idx = useMemo(() => y.k.map((_, i) => i), [y.k])
  const pg = usePage(idx, 10)
  return (
    <Card>
      <CardHeader
        title="Detection Speed"
        subtitle={`Imagine a supervisor working down a list of all ${y.n_entities} entities. This shows what share of the ${y.n_weak} problem entities they have reached after each one, using the tool’s order versus a random order.`}
        help="yield"
        action={<ViewToggle view={view} onChange={setView} />}
      />
      {view === 'chart' ? (
        <div className="px-5 pb-6">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 px-2 pb-3 text-[13px] text-ink-2" aria-label="Legend">
            <li className="flex items-center gap-2 font-medium text-ink">
              <span className="w-5" style={{ borderTop: '2.5px solid var(--viz-entity)' }} /> Using the tool’s order
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5" style={{ borderTop: '2px solid var(--viz-median)' }} /> Random order (average of 2,000)
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-5 rounded-sm opacity-60" style={{ background: 'var(--viz-context)' }} /> Range of
              random orders
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5" style={{ borderTop: '1px solid var(--viz-context)' }} /> Best possible order
            </li>
            {matchesOracle && (
              <li className="rounded-full bg-ok/10 px-3 py-1 font-medium text-ok">
                The tool’s order is the best possible order at every step
              </li>
            )}
          </ul>
          <YieldChart data={y} target={y.effort_to_target?.target ?? 0.8} />
        </div>
      ) : (
        <div className="border-t border-line">
          <table className={table.table}>
            <thead className={clsx(table.head, 'sticky top-0')}>
              <tr>
                <th className={table.th}>Entities reviewed</th>
                <th className={clsx(table.th, 'text-right')}>Tool’s order</th>
                <th className={clsx(table.th, 'text-right')}>Random (average)</th>
                <th className={clsx(table.th, 'text-right')}>Random range</th>
                <th className={clsx(table.th, 'text-right')}>Best possible</th>
              </tr>
            </thead>
            <tbody>
              {pg.slice.map((i) => ({ k: y.k[i] as number, i })).map(({ k, i }) => (
                <tr key={k} className={table.row}>
                  <td className={clsx(table.td, 'num py-2.5')}>{k}</td>
                  <td className={clsx(table.td, 'num py-2.5 text-right font-medium')}>{pct(y.tool[i])}</td>
                  <td className={clsx(table.td, 'num py-2.5 text-right')}>{pct(y.random_mean[i])}</td>
                  <td className={clsx(table.td, 'num py-2.5 text-right text-muted')}>
                    {pct(y.random_p05[i])}–{pct(y.random_p95[i])}
                  </td>
                  <td className={clsx(table.td, 'num py-2.5 text-right text-muted')}>{pct(y.oracle[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onChange={pg.setPage} noun="steps" />
        </div>
      )}
    </Card>
  )
}

function SignalTable({ s }: { s: ValidationSummary }) {
  const lib = useSignalLibrary()
  const name = Object.fromEntries((lib.data?.signals ?? []).map((x) => [x.id, x.name]))
  const [open, setOpen] = useState<string | null>(null)
  const pg = usePage(s.evaluation.signals, 10)
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Accuracy by Check"
        subtitle="For each check: how many entities had its problem planted, how many it flagged, and how accurate it was. Checks with nothing planted should flag nobody."
      />
      <div className={clsx(table.wrap, 'border-t border-line')}>
        <table className={clsx(table.table, 'min-w-[640px]')}>
          <thead className={table.head}>
            <tr>
              <th className={table.th}>Check</th>
              <th className={clsx(table.th, 'text-right')}>
                <Tooltip content="Entities where this problem was planted on purpose.">
                  <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-4">
                    Planted
                  </span>
                </Tooltip>
              </th>
              <th className={clsx(table.th, 'text-right')}>Flagged</th>
              <th className={clsx(table.th, 'text-right')}>
                <span className="inline-flex items-center gap-1">
                  Right when flagged <InfoTip term="precision" />
                </span>
              </th>
              <th className={clsx(table.th, 'text-right')}>
                <span className="inline-flex items-center gap-1">
                  Found <InfoTip term="recall" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pg.slice.map((sig) => {
              const clean = sig.planted === 0 && sig.flagged === 0
              const issues = sig.false_pos.length > 0 || sig.missed.length > 0
              const isOpen = open === sig.signal_id
              return (
                <Fragment key={sig.signal_id}>
                  <tr className={table.row}>
                    <td className={clsx(table.td, 'py-3.5')}>
                      <p className="font-medium text-ink">{name[sig.signal_id] ?? sig.signal_id}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        {sig.signal_id}
                        {issues && (
                          <button
                            type="button"
                            onClick={() => setOpen(isOpen ? null : sig.signal_id)}
                            aria-expanded={isOpen}
                            className="font-medium text-sev-medium hover:text-ink"
                          >
                            {isOpen ? 'Hide misses' : 'See misses'}
                          </button>
                        )}
                      </p>
                    </td>
                    <td className={clsx(table.td, 'num py-3.5 text-right')}>{sig.planted}</td>
                    <td className={clsx(table.td, 'num py-3.5 text-right')}>{sig.flagged}</td>
                    <td className={clsx(table.td, 'num py-3.5 text-right')}>
                      {clean ? <span className="text-muted">n/a</span> : <ToneValue value={pct(sig.precision)} tone={rateTone(sig.precision)} />}
                    </td>
                    <td className={clsx(table.td, 'num py-3.5 text-right')}>
                      {clean ? <span className="text-muted">n/a</span> : <ToneValue value={pct(sig.recall)} tone={rateTone(sig.recall)} />}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line/70 bg-surface-2/50">
                      <td colSpan={5} className="px-6 py-4 text-[13px] text-ink-2">
                        {sig.missed.length > 0 && (
                          <p>
                            <strong className="font-semibold text-ink">Missed:</strong> {sig.missed.join(', ')}. These
                            entities had this problem planted but the check did not flag them.
                          </p>
                        )}
                        {sig.false_pos.length > 0 && (
                          <p className="mt-1">
                            <strong className="font-semibold text-ink">Wrongly flagged:</strong> {sig.false_pos.join(', ')}.
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onChange={pg.setPage} noun="checks" />
      <p className="border-t border-line px-7 py-4 text-[13px] text-muted">
        Across checks with planted problems: right when flagged {pct(s.evaluation.macro_precision)} of the time, found{' '}
        {pct(s.evaluation.macro_recall)} of the planted problems.
      </p>
    </Card>
  )
}

function Holdout({ s }: { s: ValidationSummary }) {
  return (
    <Card>
      <CardHeader
        title="Unknown Problem Test"
        subtitle="Planted with no matching rule, so only the unusual-pattern check can find it."
        help="holdout"
      />
      <ul className={clsx(cardBody, 'space-y-4')}>
        {s.holdout.map((h) => (
          <li key={h.entity_code} className="rounded-xl border border-line bg-surface-2/40 p-5">
            <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <Link to={`/entities/${h.entity_code}`} className="font-semibold hover:text-accent-ink">
                {h.entity_code}
              </Link>
              <span
                className={clsx(
                  'flex items-center gap-1.5 text-[13px] font-medium',
                  h.found ? 'text-ok' : 'text-sev-critical',
                )}
              >
                {h.found ? <Sparkles size={14} /> : <CircleX size={14} />}
                {h.found ? 'Found' : 'Not found'} · ranked #{h.rank ?? '—'}
              </span>
            </p>
            {h.narrative && (
              <Details className="mt-1" label="What the tool noticed" openLabel="Hide">
                <p className="text-[13px] leading-relaxed text-ink-2">{h.narrative}</p>
              </Details>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Archetypes({ s }: { s: ValidationSummary }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Results by Problem Type"
        subtitle="Whether each kind was caught, and how high those entities ranked on average (lower rank = found sooner). Hover a row for a description."
      />
      <ul className="border-t border-line">
        {s.archetypes.map((a) => {
          const healthy = a.key === 'healthy'
          const ok = healthy ? a.flagged === 0 : a.caught === a.entities
          return (
            <Tooltip key={a.key} content={a.description}>
              <li tabIndex={0} className="flex items-center gap-3 border-b border-line/70 px-7 py-3.5 text-sm last:border-0 hover:bg-surface-2/50">
                {ok ? (
                  <CircleCheck size={16} className="shrink-0 text-ok" aria-label="As expected" />
                ) : (
                  <CircleX size={16} className="shrink-0 text-sev-critical" aria-label="Not as expected" />
                )}
                <span className="min-w-0 flex-1 truncate">{a.label}</span>
                <span className="num text-[13px] text-ink-2">
                  {healthy ? `${a.flagged} of ${a.entities} flagged` : `${a.caught} of ${a.entities} caught`}
                </span>
                <span className="num w-20 text-right text-[13px] text-muted">rank {a.mean_rank ?? '—'}</span>
              </li>
            </Tooltip>
          )
        })}
      </ul>
    </Card>
  )
}

function Robustness() {
  const { data } = useRobustness()
  const rows = [...(data ?? [])].sort((a, b) => b.intensity_scale - a.intensity_scale || a.seed - b.seed)
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Fresh Data Tests"
        subtitle="The same frozen settings, run on new test data: different random entities, and weaknesses made fainter to see where detection starts to slip."
      />
      {rows.length === 0 ? (
        <p className={clsx(cardBody, 'text-sm text-muted')}>
          Not run yet. Run <code className="text-xs">python -m app.cli robustness</code>.
        </p>
      ) : (
        <>
          <div className={clsx(table.wrap, 'border-t border-line')}>
            <table className={clsx(table.table, 'min-w-[860px]')}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Test data</th>
                  <th className={table.th}>Strength of planted problems</th>
                  <th className={clsx(table.th, 'text-right')}>Problems found</th>
                  <th className={clsx(table.th, 'text-right')}>False alarms</th>
                  <th className={clsx(table.th, 'text-right')}>Right / found</th>
                  <th className={clsx(table.th, 'text-right')}>Ranking</th>
                  <th className={clsx(table.th, 'text-right')}>Review to find 80%</th>
                  <th className={clsx(table.th, 'text-right')}>No-rule problem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: RobustnessRow) => (
                  <tr key={r.id} className={table.row}>
                    <td className={clsx(table.td, 'py-3.5')}>
                      <p className="font-medium">Seed {r.seed}</p>
                      <p className="text-xs text-muted">{fmtDateTime(r.created_at)}</p>
                    </td>
                    <td className={clsx(table.td, 'py-3.5')}>
                      <span className="flex items-center gap-3 text-[13px]">
                        <span className="h-2 w-20 rounded-full bg-surface-2">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${r.intensity_scale * 100}%`, background: 'var(--viz-entity)' }}
                          />
                        </span>
                        {Math.round(r.intensity_scale * 100)}%
                      </span>
                    </td>
                    <td className={clsx(table.td, 'num py-3.5 text-right')}>
                      <ToneValue value={`${r.weak_caught} of ${r.weak_entities}`} tone={rateTone(r.weak_caught / Math.max(1, r.weak_entities))} />
                    </td>
                    <td className={clsx(table.td, 'num py-3.5 text-right')}>
                      <ToneValue
                        value={`${r.healthy_flagged} of ${r.healthy_entities}`}
                        tone={rateTone(1 - r.healthy_flagged / Math.max(1, r.healthy_entities))}
                      />
                    </td>
                    <td className={clsx(table.td, 'num py-3.5 text-right')}>
                      <ToneValue value={pct(r.macro_precision)} tone={rateTone(r.macro_precision)} /> /{' '}
                      <ToneValue value={pct(r.macro_recall)} tone={rateTone(r.macro_recall)} />
                    </td>
                    <td className={clsx(table.td, 'num py-3.5 text-right')}>
                      <ToneValue value={r.ndcg_at_10?.toFixed(2) ?? '—'} tone={rateTone(r.ndcg_at_10)} />
                    </td>
                    <td className={clsx(table.td, 'num py-3.5 text-right')}>
                      {r.effort_tool ?? '—'} <span className="text-muted">vs {r.effort_random ?? '—'}</span>
                    </td>
                    <td className={clsx(table.td, 'num py-3.5 text-right')}>
                      <ToneValue
                        value={`${r.holdout_found} of ${r.holdout_total}`}
                        tone={rateTone(r.holdout_total ? r.holdout_found / r.holdout_total : null)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Details className="px-7 py-4" label="What the columns mean">
            <ul className="max-w-3xl space-y-1.5 text-[13px] leading-relaxed text-ink-2">
              <li><strong className="text-ink">Strength:</strong> 100% is full strength; lower values make the planted problems fainter and harder to find.</li>
              <li><strong className="text-ink">Right / found:</strong> how often a flag was correct, and what share of planted problems were found.</li>
              <li><strong className="text-ink">Ranking:</strong> how closely the tool’s order matches the experts’ order (1.00 = perfect).</li>
              <li><strong className="text-ink">Review to find 80%:</strong> entities a supervisor must look at, using the tool’s order vs a random order.</li>
            </ul>
          </Details>
        </>
      )}
    </Card>
  )
}

function FieldValidation() {
  const { data } = useFieldValidation()
  if (!data) return null
  const none = { total: 0, reviewed: 0, confirmed: 0, hit_rate: null }
  const d = data.review.directed ?? none
  const c = data.review.control ?? none
  return (
    <Card>
      <CardHeader
        title="Reviewer Feedback"
        subtitle="Evidence from supervisors using the tool: what the picked records turned up, and their decisions on findings."
      />
      <div className={clsx(cardBody, 'grid gap-8 md:grid-cols-2')}>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Problems found in picked records</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-line bg-surface-2/40 p-5">
              <p className="text-[13px] text-muted">Linked to findings</p>
              <p className="mt-2 text-2xl font-semibold">{pct(d.hit_rate)}</p>
              <p className="mt-1 text-xs text-muted">
                {d.confirmed} problems in {d.reviewed} checked ({d.total} picked)
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2/40 p-5">
              <p className="flex items-center gap-1.5 text-[13px] text-muted">
                Picked at random <InfoTip term="control" />
              </p>
              <p className="mt-2 text-2xl font-semibold">{pct(c.hit_rate)}</p>
              <p className="mt-1 text-xs text-muted">
                {c.confirmed} problems in {c.reviewed} checked ({c.total} picked)
              </p>
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            If records linked to findings show problems much more often than random ones, the tool is pointing reviewers
            at real problems.
          </p>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Decisions on findings</p>
          {data.feedback.length === 0 ? (
            <p className="text-sm text-muted">No decisions recorded yet. Accept or reject findings from their evidence.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2.5 font-medium">Check</th>
                  <th className="py-2.5 text-right font-medium">Accepted</th>
                  <th className="py-2.5 text-right font-medium">Rejected</th>
                  <th className="py-2.5 text-right font-medium">Share accepted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {data.feedback.map((f) => (
                  <tr key={f.signal_id}>
                    <td className="py-2.5 font-medium">{f.signal_id}</td>
                    <td className="num py-2.5 text-right">{f.accepted}</td>
                    <td className="num py-2.5 text-right">{f.rejected}</td>
                    <td className="num py-2.5 text-right">{pct(f.precision)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Card>
  )
}
