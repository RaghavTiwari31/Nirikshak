/** Formatting for the monthly/window operating features served by the API. */

export function featureFormatter(key: string, percent: boolean): (v: number) => string {
  if (percent) return (v) => `${Math.round(v * 100)}%`
  if (key.endsWith('_min')) return (v) => `${v.toFixed(0)} m`
  if (key.includes('_h')) return (v) => `${v.toFixed(1)} h`
  if (key === 'night_day_ack_ratio') return (v) => `${v.toFixed(1)}×`
  return (v) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(0))
}

/** Which direction is healthier for each measure, for plain-language explanations. */
export const FEATURE_BETTER: Record<string, 'lower' | 'higher' | 'neither'> = {
  alerts: 'neither',
  alerts_per_asset: 'neither',
  high_crit_share: 'neither',
  median_ack_min: 'lower',
  median_close_h: 'neither',
  median_close_h_high_crit: 'neither',
  tp_rate_high_crit: 'neither',
  unacknowledged_share: 'lower',
  cases_per_100_alerts: 'neither',
  escalation_rate: 'higher',
  external_escalations: 'neither',
  median_note_chars: 'higher',
  no_work_case_share: 'lower',
  night_day_ack_ratio: 'lower',
  top_analyst_share: 'lower',
  escalation_weekday_peak: 'lower',
  reopen_share: 'lower',
}
