import clsx from 'clsx'

/** Page numbers to show: always the first and last, the current one and its neighbours. */
function pageList(page: number, pages: number): (number | '…')[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages))
  const out: (number | '…')[] = []
  let prev = 0
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push('…')
    out.push(p)
    prev = p
  }
  return out
}

/** Table footer: "Showing 1–10 of 40" with Previous, page numbers and Next. */
export function Pagination({
  page,
  pages,
  total,
  size,
  onChange,
  noun = 'items',
  className,
}: {
  page: number
  pages: number
  total: number
  size: number
  onChange: (page: number) => void
  noun?: string
  className?: string
}) {
  if (total === 0) return null
  const from = (page - 1) * size + 1
  const to = Math.min(page * size, total)
  const btn =
    'rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <nav
      aria-label="Pages"
      className={clsx('flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-3.5', className)}
    >
      <p className="num text-[13px] text-muted">
        Showing {from}–{to} of {total} {noun}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1.5">
          <button type="button" className={btn} disabled={page === 1} onClick={() => onChange(page - 1)}>
            Previous
          </button>
          {pageList(page, pages).map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="px-1 text-muted">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onChange(p)}
                className={clsx(
                  'num min-w-8 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                  p === page ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-2',
                )}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className={btn} disabled={page === pages} onClick={() => onChange(page + 1)}>
            Next
          </button>
        </div>
      )}
    </nav>
  )
}
