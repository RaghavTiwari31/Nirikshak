/** Display labels for the analytics vocabulary shared with the backend. */
import type { GlossaryKey } from './glossary'

export const FAMILY_LABEL: Record<string, string> = {
  execution_gap: 'Claim vs evidence',
  negative_space: 'Missing evidence',
  anomaly: 'Unusual pattern',
  trend: 'Getting worse',
}

/** Glossary entry explaining each finding type. */
export const FAMILY_HELP = {
  execution_gap: 'executionGap',
  negative_space: 'negativeSpace',
  anomaly: 'anomaly',
  trend: 'trend',
} as const satisfies Record<string, GlossaryKey>

export const CAPABILITY_LABEL: Record<string, string> = {
  threat_detection: 'Threat detection',
  investigation: 'Investigation',
  escalation: 'Escalation',
  incident_response: 'Incident response',
  security_operations: 'Security operations',
  governance: 'Governance & oversight',
  operational_discipline: 'Operational discipline',
  cyber_resilience: 'Cyber resilience',
}

export const PARAM_LABEL: Record<string, string> = {
  max_minutes: 'closed within (minutes)',
  min_share: 'at least this share',
  max_share: 'at most this share',
  min_note_chars: 'note shorter than (characters)',
  similarity: 'counts as a copy above',
  band: 'window around the deadline',
  min_ratio: 'at least this many times',
  max_p: 'chance it is random, at most',
  min_repeats: 'repeats on the same machine',
  min_unremediated: 'share never fixed',
  min_clusters: 'at least this many machines',
  min_mttr_ratio: 'actual ÷ promised fix time',
  max_night_ratio: 'night ÷ day response time',
  batch_size: 'alerts closed in one minute',
  min_night_minutes: 'typical night wait (minutes)',
  max_human_share: 'seen by a person, at most',
  min_expected: 'expected alerts, at least',
  alpha: 'allowed false-alarm rate',
  min_silent: 'silent machines, at least',
  min_days: 'days in a row with no data',
}

export function fmtParam(key: string, value: unknown): string {
  if (typeof value !== 'number') return String(value)
  if (['min_share', 'max_share', 'min_unremediated', 'max_human_share', 'band'].includes(key)) {
    return `${Math.round(value * 100)}%`
  }
  return String(value)
}
