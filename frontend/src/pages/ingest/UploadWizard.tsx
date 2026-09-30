import clsx from 'clsx'
import { ArrowLeft, FileUp, Lock, RotateCcw, Upload } from 'lucide-react'
import { type DragEvent, useMemo, useRef, useState } from 'react'
import {
  type ContractDataset,
  type DatasetReport,
  type PreviewOut,
  type UploadResult,
  useContract,
  useEntities,
  usePreview,
  useUpload,
} from '@/api/ingest'
import { Button, Card, CardHeader, Field, inputClass } from '@/components/ui'
import { fmtInt, previousMonth } from '@/lib/format'
import { DqReport } from './DqReport'

type Step = 'configure' | 'map' | 'result'
const STEPS: { key: Step; label: string }[] = [
  { key: 'configure', label: 'Choose a file' },
  { key: 'map', label: 'Match columns' },
  { key: 'result', label: 'Check quality' },
]
const TIMEZONES = ['Asia/Kolkata', 'UTC']

export function UploadWizard() {
  const contract = useContract()
  const entities = useEntities()
  const preview = usePreview()
  const upload = useUpload()

  const [step, setStep] = useState<Step>('configure')
  const [dataset, setDataset] = useState('alerts')
  const [entityCode, setEntityCode] = useState('')
  const [period, setPeriod] = useState(previousMonth)
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [file, setFile] = useState<File | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [saveAs, setSaveAs] = useState('')
  const [result, setResult] = useState<UploadResult | null>(null)

  const spec = contract.data?.find((d) => d.key === dataset)
  const isProfile = dataset === 'entity_profile'
  const canPreview = !!file && (isProfile || (!!entityCode && period.start <= period.end))

  const runPreview = () => {
    if (!file) return
    preview.mutate(
      { file, dataset },
      {
        onSuccess: (p) => {
          setMapping(p.suggested_mapping)
          setStep('map')
        },
      },
    )
  }

  const runUpload = () => {
    if (!file) return
    upload.mutate(
      {
        file,
        dataset,
        mapping,
        timezone,
        entityCode: isProfile ? undefined : entityCode,
        periodStart: isProfile ? undefined : period.start,
        periodEnd: isProfile ? undefined : period.end,
        saveMappingAs: saveAs.trim() || undefined,
      },
      {
        onSuccess: (r) => {
          setResult(r)
          setStep('result')
        },
      },
    )
  }

  const reset = () => {
    setStep('configure')
    setFile(null)
    setMapping({})
    setSaveAs('')
    setResult(null)
    preview.reset()
    upload.reset()
  }

  return (
    <Card>
      <CardHeader
        title="New Upload"
        subtitle="Three steps: choose the file and whose it is, match its columns to ours, then review the quality report."
        action={<Stepper current={step} />}
      />
      <div className="px-7 pb-7">
        {step === 'configure' && (
          <div className="space-y-5">
            {/* Full-width card: file details on the left, drop zone beside them on wide screens. */}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Dataset">
                    <select className={inputClass} value={dataset} onChange={(e) => setDataset(e.target.value)}>
                      {contract.data?.map((d) => (
                        <option key={d.key} value={d.key}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {!isProfile && (
                    <Field label="Entity">
                      <select
                        className={inputClass}
                        value={entityCode}
                        onChange={(e) => setEntityCode(e.target.value)}
                      >
                        <option value="">Select an entity…</option>
                        {entities.data?.map((e) => (
                          <option key={e.code} value={e.code}>
                            {e.code} · {e.display_name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
                {spec && <p className="-mt-2 text-xs text-muted">{spec.description}</p>}

                {!isProfile && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Period start">
                      <input
                        type="date"
                        className={inputClass}
                        value={period.start}
                        onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
                      />
                    </Field>
                    <Field label="Period end">
                      <input
                        type="date"
                        className={inputClass}
                        value={period.end}
                        onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
                      />
                    </Field>
                    <Field label="Timestamps without offset are in">
                      <select className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                        {TIMEZONES.map((tz) => (
                          <option key={tz}>{tz}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
              </div>

              <DropZone file={file} onFile={setFile} />
            </div>

            {preview.isError && <p className="text-sm text-sev-critical">{preview.error.message}</p>}
            <div className="flex justify-end">
              <Button disabled={!canPreview || preview.isPending} onClick={runPreview}>
                {preview.isPending ? 'Reading file…' : 'Preview & map columns'}
              </Button>
            </div>
          </div>
        )}

        {step === 'map' && preview.data && spec && (
          <div className="space-y-5">
            <MappingTable spec={spec} preview={preview.data} mapping={mapping} onChange={setMapping} />
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="w-full max-w-xs">
                <Field label="Save this mapping as (optional)" hint="Reuse it for this entity's next export.">
                  <input
                    className={inputClass}
                    value={saveAs}
                    placeholder="e.g. Vendor SIEM export"
                    onChange={(e) => setSaveAs(e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep('configure')}>
                  <ArrowLeft size={15} /> Back
                </Button>
                <Button
                  disabled={upload.isPending || spec.fields.some((f) => f.required && !mapping[f.name])}
                  onClick={runUpload}
                >
                  <Upload size={15} />
                  {upload.isPending ? 'Validating & loading…' : `Ingest ${fmtInt(preview.data.row_count)} rows`}
                </Button>
              </div>
            </div>
            {upload.isError && <p className="text-sm text-sev-critical">{upload.error.message}</p>}
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-5">
            {result.kind === 'entity_profile' ? (
              <>
                <p className="text-sm">
                  Registered or updated <span className="num font-medium">{result.entity_codes.length}</span>{' '}
                  {result.entity_codes.length === 1 ? 'entity' : 'entities'}: {result.entity_codes.join(', ')}
                </p>
                {result.profile_report && (
                  <DqReport status="accepted" datasets={[result.profile_report as unknown as DatasetReport]} />
                )}
              </>
            ) : (
              result.submission && (
                <DqReport
                  status={result.submission.status}
                  datasets={(result.submission.dq_report.datasets ?? []) as DatasetReport[]}
                />
              )
            )}
            <div className="flex justify-end">
              <Button variant="ghost" onClick={reset}>
                <RotateCcw size={15} /> Upload another file
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

function Stepper({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current)
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={clsx(
              'num flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
              i < idx && 'bg-accent/25 text-accent-ink',
              i === idx && 'bg-ink text-white',
              i > idx && 'bg-surface-2 text-muted',
            )}
          >
            {i + 1}
          </span>
          <span className={clsx('max-sm:hidden', i === idx ? 'text-ink' : 'text-muted')}>{s.label}</span>
          {i < STEPS.length - 1 && <span className="h-px w-4 bg-line" />}
        </li>
      ))}
    </ol>
  )
}

function DropZone({ file, onFile }: { file: File | null; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={clsx(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition',
        over ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/60',
      )}
    >
      <FileUp size={22} className="text-accent-ink" />
      {file ? (
        <p className="text-sm">
          <span className="font-medium">{file.name}</span>{' '}
          <span className="num text-muted">({fmtInt(Math.ceil(file.size / 1024))} KB)</span>
        </p>
      ) : (
        <p className="text-sm">
          Drop a file here or <span className="text-accent-ink">browse</span>
        </p>
      )}
      <p className="text-xs text-muted">CSV, JSON or NDJSON · up to 25 MB</p>
      <input
        ref={input}
        type="file"
        accept=".csv,.json,.ndjson,.jsonl"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </div>
  )
}

function MappingTable({
  spec,
  preview,
  mapping,
  onChange,
}: {
  spec: ContractDataset
  preview: PreviewOut
  mapping: Record<string, string>
  onChange: (m: Record<string, string>) => void
}) {
  const used = useMemo(() => new Set(Object.values(mapping)), [mapping])
  const unused = preview.columns.filter((c) => !used.has(c))
  const missingRequired = spec.fields.filter((f) => f.required && !mapping[f.name])
  const sample = preview.sample_rows[0] ?? {}

  const set = (field: string, column: string) => {
    const next = { ...mapping }
    if (column) next[field] = column
    else delete next[field]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p>
          <span className="font-medium text-ink">{preview.filename}</span> ·{' '}
          <span className="num">{fmtInt(preview.row_count)}</span> rows ·{' '}
          <span className="uppercase">{preview.source_format}</span>
        </p>
        <p className={missingRequired.length ? 'text-sev-critical' : 'text-ok'}>
          {missingRequired.length
            ? `${missingRequired.length} required field${missingRequired.length > 1 ? 's' : ''} unmapped`
            : 'All required fields mapped'}
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nirikshak field</th>
              <th className="px-4 py-3 font-medium">Column in your file</th>
              <th className="px-4 py-3 font-medium">Sample value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {spec.fields.map((f) => {
              const col = mapping[f.name] ?? ''
              const missing = f.required && !col
              return (
                <tr key={f.name} className={missing ? 'bg-sev-critical/5' : undefined}>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs">{f.name}</span>
                      {f.required && <span className="text-[11px] font-medium text-sev-high">required</span>}
                      {f.pseudonymized && (
                        <Lock size={11} className="text-accent-ink" aria-label="Pseudonymised on ingestion" />
                      )}
                    </div>
                    {f.description && <p className="mt-0.5 text-xs text-muted">{f.description}</p>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <select
                      className={clsx(inputClass, 'py-1.5', missing && 'border-sev-critical/60')}
                      value={col}
                      onChange={(e) => set(f.name, e.target.value)}
                    >
                      <option value="">— not mapped —</option>
                      {col && <option value={col}>{col}</option>}
                      {unused.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="max-w-[16rem] truncate px-4 py-3 align-top font-mono text-xs text-muted">
                    {col ? (sample[col] ?? '∅') : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {unused.length > 0 && (
        <p className="text-xs text-muted">
          Ignored columns: <span className="font-mono">{unused.join(', ')}</span>
        </p>
      )}
    </div>
  )
}
