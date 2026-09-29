const nf = new Intl.NumberFormat('en-IN')

export const fmtInt = (n: number) => nf.format(n)

export const fmtPct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtPeriod(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()
  const monthStart = s.getDate() === 1
  const lastDay = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate() === e.getDate()
  if (sameMonth && monthStart && lastDay) {
    return s.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  }
  return `${fmtDate(start)} – ${fmtDate(end)}`
}

/** First and last day of the previous calendar month, as YYYY-MM-DD. */
export function previousMonth(today = new Date()): { start: string; end: string } {
  const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const last = new Date(today.getFullYear(), today.getMonth(), 0)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: iso(first), end: iso(last) }
}

export const humanize = (key: string) =>
  key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
