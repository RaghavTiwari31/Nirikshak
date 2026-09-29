import { ArrowRight } from 'lucide-react'
import type { FindingOut } from '@/api/supervise'
import { Details, Fact } from '@/components/Details'
import { SeverityTag } from '@/components/supervise'
import { InfoTip } from '@/components/Tooltip'
import { fmtMetric, METRIC_LABEL } from '@/lib/signals'
import { CAPABILITY_LABEL, FAMILY_HELP, FAMILY_LABEL } from '@/lib/taxonomy'

/**
 * One finding, in three layers: the headline; "View details" for the numbers behind it;
 * "See the evidence" for the full trail with records and the supervisor's decision.
 */
export function FindingCard({
  f,
  onOpen,
  showEntity = false,
}: {
  f: FindingOut
  onOpen: () => void
  showEntity?: boolean
}) {
  const help = FAMILY_HELP[f.family as keyof typeof FAMILY_HELP]
  return (
    <article className="rounded-2xl border border-line bg-surface p-6 transition-shadow hover:shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <SeverityTag level={f.severity} />
          <span className="flex items-center gap-1.5 font-medium text-muted">
            {FAMILY_LABEL[f.family]}
            {help && <InfoTip term={help} />}
          </span>
          {showEntity && <span className="font-semibold text-ink-2">{f.entity_name}</span>}
          {f.status !== 'open' && (
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 font-medium capitalize text-ink-2">
              {f.status.replace('_', ' ')}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="-mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line-strong px-3.5 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2"
        >
          See the evidence <ArrowRight size={14} />
        </button>
      </div>
      <h3 className="mt-3 text-base leading-snug font-semibold text-ink">{f.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{f.narrative}</p>

      <Details className="mt-3">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl bg-surface-2/60 p-5 lg:grid-cols-4">
          <Fact label={METRIC_LABEL[f.signal_id] ?? 'Measured value'}>{fmtMetric(f.signal_id, f.metric_value)}</Fact>
          <Fact
            label={
              <>
                Compared with others <InfoTip term="percentile" />
              </>
            }
          >
            {standing(f.peer_percentile)}
          </Fact>
          <Fact
            label={
              <>
                How sure <InfoTip term="confidence" />
              </>
            }
          >
            {Math.round(f.confidence * 100)}%
          </Fact>
          <Fact
            label={
              <>
                Area affected <InfoTip term="capability" />
              </>
            }
          >
            {CAPABILITY_LABEL[f.capability] ?? f.capability}
          </Fact>
        </dl>
        <button
          type="button"
          onClick={onOpen}
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-2"
        >
          See the records and record your decision <ArrowRight size={14} />
        </button>
      </Details>
    </article>
  )
}

/** Where the entity sits among the others, stated as a plain fact. */
function standing(p: number | null): string {
  if (p === null) return '—'
  if (p >= 0.99) return 'Higher than all others'
  if (p <= 0.01) return 'Lower than all others'
  return `Higher than ${Math.round(p * 100)}% of others`
}
