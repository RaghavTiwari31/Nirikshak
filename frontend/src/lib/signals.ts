/** How each signal's metric is displayed (the backend stores raw numbers). */

type Unit = 'percent' | 'ratio' | 'count' | 'days' | 'score' | 'rate'

const UNITS: Record<string, Unit> = {
  'EG-01': 'percent',
  'EG-02': 'percent',
  'EG-03': 'percent',
  'EG-04': 'percent',
  'EG-05': 'ratio',
  'EG-06': 'count',
  'EG-07': 'percent',
  'EG-08': 'ratio',
  'EG-09': 'percent',
  'EG-10': 'ratio',
  'EG-11': 'percent',
  'EG-12': 'percent',
  'NS-01': 'percent',
  'NS-02': 'count',
  'NS-03': 'days',
  'NS-04': 'percent',
  'NS-05': 'percent',
  'NS-06': 'rate',
  'NS-07': 'count',
  'NS-08': 'count',
  'TR-01': 'ratio',
  'AN-01': 'score',
}

export function fmtMetric(signalId: string, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  switch (UNITS[signalId]) {
    case 'percent':
      return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`
    case 'ratio':
      return `${value.toFixed(1)}×`
    case 'count':
      return value.toFixed(0)
    case 'days':
      return `${value.toFixed(0)} days`
    case 'rate':
      return value.toFixed(2)
    default:
      return value.toFixed(2)
  }
}

/** What each check's number measures, in plain words. */
export const METRIC_LABEL: Record<string, string> = {
  'EG-01': 'Serious alerts closed within 10 minutes',
  'EG-02': 'Confirmed critical alerts never escalated',
  'EG-03': 'Cases closed without real work',
  'EG-04': 'Case notes that are near-copies',
  'EG-05': 'Closed just before vs just after the deadline',
  'EG-06': 'Machines with the same unfixed incident',
  'EG-07': 'Serious alerts confirmed as real',
  'EG-08': 'Actual vs promised',
  'EG-09': 'Alerts closed in bulk',
  'EG-10': 'Night vs day response time',
  'EG-11': 'Cases reopened',
  'EG-12': 'Alerts no person looked at',
  'NS-01': 'Critical machines with no alerts',
  'NS-02': 'Expected alert types missing',
  'NS-03': 'Longest stretch with no data',
  'NS-04': 'Serious cases escalated',
  'NS-05': 'Confirmed alerts with no case',
  'NS-06': 'Alerts per machine per month',
  'NS-07': 'OT machines not monitored',
  'NS-08': 'Months with no submission',
  'TR-01': 'Worse than its own earlier months',
  'AN-01': 'How unusual overall',
}
