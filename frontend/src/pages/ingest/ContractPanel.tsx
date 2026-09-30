import clsx from 'clsx'
import { Lock } from 'lucide-react'
import { useState } from 'react'
import { useContract } from '@/api/ingest'
import { Details } from '@/components/Details'
import { Tooltip } from '@/components/Tooltip'
import { Card, CardHeader } from '@/components/ui'
import { GLOSSARY } from '@/lib/glossary'

const KIND_LABEL: Record<string, string> = {
  str: 'text',
  enum: 'one of a fixed list',
  datetime: 'date and time',
  date: 'date',
  int: 'whole number',
  float: 'number',
  bool: 'yes / no',
}

/** The data contract, rendered from the API so it can never drift from the validator. */
export function ContractPanel() {
  const { data } = useContract()
  const [active, setActive] = useState('alerts')
  const ds = data?.find((d) => d.key === active)

  return (
    <Card>
      <CardHeader
        title="Data Fields"
        subtitle="The fields the tool understands for each kind of file. Raw logs, network traffic and personal data are never needed."
      />
      <div className="flex flex-wrap gap-1.5 border-y border-line bg-surface-2/50 px-6 py-3">
        {data?.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setActive(d.key)}
            className={clsx(
              'shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
              active === d.key ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
      {ds && (
        <div className="px-7 py-6">
          <p className="mb-4 max-w-3xl text-sm leading-relaxed text-ink-2">{ds.description}</p>
          {/* Full-width card: fields flow into columns instead of one long list. */}
          <ul className="grid gap-x-10 text-sm sm:grid-cols-2 xl:grid-cols-3">
            {ds.fields.map((f) => (
              <li key={f.name} className="border-t border-line/70 py-3.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-medium">{f.name}</span>
                  {f.required && (
                    <span className="rounded-full bg-sev-high/10 px-2 py-0.5 text-[11px] font-medium text-sev-high">required</span>
                  )}
                  {f.pseudonymized && (
                    <Tooltip content={GLOSSARY.pseudonymised}>
                      <span tabIndex={0} className="inline-flex cursor-help items-center gap-1 text-xs text-ok">
                        <Lock size={12} /> hidden on arrival
                      </span>
                    </Tooltip>
                  )}
                  <span className="text-xs text-muted">{KIND_LABEL[f.kind] ?? f.kind}</span>
                </span>
                {f.description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{f.description}</p>}
                {f.enum && (
                  <Details className="mt-0.5" label={`Show allowed values (${f.enum.length})`} openLabel="Hide allowed values">
                    <span className="flex flex-wrap gap-1.5">
                      {f.enum.map((v) => (
                        <span key={v} className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-2">
                          {v}
                        </span>
                      ))}
                    </span>
                  </Details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
