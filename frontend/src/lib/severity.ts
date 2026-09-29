export type SeverityLevel = 1 | 2 | 3 | 4

export const SEVERITY_LABEL: Record<SeverityLevel, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Critical',
}

const SEVERITY_TOKEN: Record<SeverityLevel, string> = {
  1: 'var(--sev-low)',
  2: 'var(--sev-medium)',
  3: 'var(--sev-high)',
  4: 'var(--sev-critical)',
}

const SEVERITY_INK: Record<SeverityLevel, string> = {
  1: 'var(--sev-low-ink)',
  2: 'var(--sev-medium-ink)',
  3: 'var(--sev-high-ink)',
  4: 'var(--sev-critical-ink)',
}

const clampLevel = (level: number) => Math.min(4, Math.max(1, Math.round(level))) as SeverityLevel

/** Mark colour (dots, fills, tints). */
export function severityColor(level: number): string {
  return SEVERITY_TOKEN[clampLevel(level)]
}

/** Text colour: a darker step of the same hue, readable at small sizes. */
export function severityInk(level: number): string {
  return SEVERITY_INK[clampLevel(level)]
}

/** Attention bands in plain words. */
export const BAND_LABEL: Record<SeverityLevel, string> = {
  1: 'Routine',
  2: 'Watch',
  3: 'Attention',
  4: 'Priority',
}

/** Map a 0–100 Supervisory Attention Index onto a severity band. */
export function saiBand(sai: number): SeverityLevel {
  if (sai >= 75) return 4
  if (sai >= 50) return 3
  if (sai >= 25) return 2
  return 1
}
