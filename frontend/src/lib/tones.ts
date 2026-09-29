/**
 * Colour coding shared by every chart, table and meter, so a colour means the same thing
 * everywhere. Each tone has a mark colour (bars, dots, cell fills), a text colour (readable
 * at small sizes) and a word, because colour never carries meaning on its own.
 */
export interface Tone {
  mark: string
  ink: string
  label: string
}

const GOOD = { mark: 'var(--health-good)', ink: 'var(--health-good-ink)' }
const FAIR = { mark: 'var(--health-fair)', ink: 'var(--sev-medium-ink)' }
const POOR = { mark: 'var(--health-poor)', ink: 'var(--sev-high-ink)' }
const BAD = { mark: 'var(--health-bad)', ink: 'var(--sev-critical-ink)' }

/** Capability or any 0–100 "higher is healthier" score. */
export function healthTone(score: number): Tone {
  if (score >= 80) return { ...GOOD, label: 'Healthy' }
  if (score >= 50) return { ...FAIR, label: 'Some concern' }
  if (score >= 25) return { ...POOR, label: 'Weak' }
  return { ...BAD, label: 'Very weak' }
}

/** Observed ÷ expected evidence. `hole` = expected but none reported. */
export function coverageTone(ratio: number | null | undefined, hole = false): Tone | null {
  if (ratio === null || ratio === undefined) return null
  if (hole || ratio === 0) return { ...BAD, label: 'None' }
  if (ratio >= 0.8) return { ...GOOD, label: 'As expected' }
  if (ratio >= 0.4) return { ...FAIR, label: 'Partial' }
  return { ...POOR, label: 'Low' }
}

/** A 0–1 success rate such as precision, recall or review progress. */
export function rateTone(rate: number | null | undefined): Tone | null {
  if (rate === null || rate === undefined) return null
  if (rate >= 0.9) return { ...GOOD, label: 'Strong' }
  if (rate >= 0.75) return { ...FAIR, label: 'Fair' }
  if (rate >= 0.5) return { ...POOR, label: 'Weak' }
  return { ...BAD, label: 'Poor' }
}

/** Finding type → categorical colour. */
export const FAMILY_COLOR: Record<string, string> = {
  execution_gap: 'var(--fam-gap)',
  negative_space: 'var(--fam-missing)',
  anomaly: 'var(--fam-anomaly)',
  trend: 'var(--fam-trend)',
}

export const COVERAGE_LEGEND: Tone[] = [
  { ...GOOD, label: 'As expected (80%+)' },
  { ...FAIR, label: 'Partial (40–79%)' },
  { ...POOR, label: 'Low (under 40%)' },
  { ...BAD, label: 'None where expected' },
]

export const HEALTH_LEGEND: Tone[] = [
  { ...GOOD, label: 'Healthy (80+)' },
  { ...FAIR, label: 'Some concern (50–79)' },
  { ...POOR, label: 'Weak (25–49)' },
  { ...BAD, label: 'Very weak (under 25)' },
]
