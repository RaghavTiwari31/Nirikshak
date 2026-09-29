import { ArrowLeft, Printer } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { useRun } from '@/api/analysis'
import { usePacks, useProfile } from '@/api/supervise'
import { SECTOR_LABEL } from '@/lib/labels'
import { fmtDate } from '@/lib/format'
import { SEVERITY_LABEL, type SeverityLevel } from '@/lib/severity'
import { CAPABILITY_LABEL } from '@/lib/taxonomy'

/**
 * One-page supervisory briefing for an entity, in the light theme and laid out for A4
 * printing. Includes provenance (run, configuration and data fingerprints) so a printed
 * copy can always be traced back to the exact analysis that produced it.
 */
export function BriefingPage() {
  const { code } = useParams()
  const { data: p } = useProfile(code)
  const { data: run } = useRun(p?.run_id ?? null)
  const packs = usePacks()
  const pack = packs.data?.find((x) => x.entity_code === code)

  useEffect(() => {
    const root = document.documentElement
    const previous = root.dataset.theme
    root.dataset.theme = 'light'
    return () => {
      if (previous) root.dataset.theme = previous
      else delete root.dataset.theme
    }
  }, [])

  if (!p) return <p className="p-8 text-sm text-muted">Preparing briefing…</p>
  const s = p.score
  const caps = Object.entries(s?.capabilities ?? {}).sort((a, b) => a[1] - b[1])

  return (
    <div className="min-h-full bg-bg py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <Link to={`/entities/${p.entity_code}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft size={13} /> Back to entity
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-ink-2"
        >
          <Printer size={15} /> Print / save as PDF
        </button>
      </div>

      <article className="mx-auto max-w-[210mm] space-y-6 bg-surface p-10 text-[13px] leading-relaxed shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-line pb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              Nirikshak · Supervisory briefing · For official use
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{p.entity_name}</h1>
            <p className="text-muted">
              {p.entity_code} · {SECTOR_LABEL[p.sector]} · {p.size_tier} · {p.soc_model} SOC
            </p>
            {run && (
              <p className="mt-1 text-muted">
                Assessment window {fmtDate(run.window_start)} – {fmtDate(run.window_end)}
              </p>
            )}
          </div>
          {s && (
            <div className="text-right">
              <p className="text-xs text-muted">Attention score</p>
              <p className="text-4xl font-semibold">{s.sai.toFixed(0)}</p>
              <p className="text-muted">ranked #{s.rank}</p>
            </div>
          )}
        </header>

        {s && (
          <section>
            <h2 className="mb-1 text-sm font-semibold">Summary</h2>
            <p>{s.summary}</p>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold">Health by area</h2>
          <table className="w-full">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-1.5 font-medium">Capability</th>
                <th className="py-1.5 text-right font-medium">Score</th>
                <th className="py-1.5 text-right font-medium">Typical for others</th>
              </tr>
            </thead>
            <tbody>
              {caps.map(([k, v]) => (
                <tr key={k} className="border-b border-line/70">
                  <td className="py-1.5">{CAPABILITY_LABEL[k]}</td>
                  <td className="num py-1.5 text-right font-medium">{v.toFixed(0)}</td>
                  <td className="num py-1.5 text-right text-muted">{(p.peer_capability_median[k] ?? 100).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Findings ({p.findings.length})</h2>
          {p.findings.length === 0 ? (
            <p className="text-muted">No supervisory findings in this period.</p>
          ) : (
            <ol className="space-y-3">
              {p.findings.map((f, i) => (
                <li key={f.id} className="break-inside-avoid">
                  <p className="font-medium">
                    {i + 1}. {f.title}{' '}
                    <span className="font-normal text-muted">
                      ({f.signal_id} · {SEVERITY_LABEL[Math.min(4, Math.max(1, f.severity)) as SeverityLevel]} ·{' '}
                      {Math.round(f.confidence * 100)}% confidence)
                    </span>
                  </p>
                  <p className="text-ink/85">{f.narrative}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {pack && (
          <section className="break-inside-avoid">
            <h2 className="mb-1 text-sm font-semibold">Recommended review focus</h2>
            <p>
              Examine the {pack.samples}-record review pack: {pack.directed} records drawn from the findings above and{' '}
              {pack.control} random control records for an unbiased baseline. Progress to date: {pack.reviewed} reviewed.
            </p>
          </section>
        )}

        <footer className="border-t border-line pt-4 font-mono text-[11px] leading-relaxed text-muted">
          {run && (
            <>
              <p>
                Run #{run.id} · code {run.code_version} · generated {fmtDate(run.finished_at ?? run.window_end)}
              </p>
              <p>config sha256 {run.config_sha256}</p>
              <p>data sha256 {run.data_sha256}</p>
            </>
          )}
          <p className="mt-1">
            Findings support supervisory judgement; they are not conclusions. Prototype built on synthetic data.
          </p>
        </footer>
      </article>
    </div>
  )
}
