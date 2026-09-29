import { describe, expect, it } from 'vitest'
import { fmtPeriod, humanize, previousMonth } from './format'

describe('previousMonth', () => {
  it('handles year boundaries', () => {
    expect(previousMonth(new Date(2026, 0, 15))).toEqual({ start: '2025-12-01', end: '2025-12-31' })
    expect(previousMonth(new Date(2026, 2, 3))).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
})

describe('fmtPeriod', () => {
  it('collapses a whole calendar month', () => {
    expect(fmtPeriod('2026-02-01', '2026-02-28')).toMatch(/Feb.*2026/)
  })
  it('shows a range otherwise', () => {
    expect(fmtPeriod('2026-02-03', '2026-02-10')).toContain('–')
  })
})

it('humanize', () => {
  expect(humanize('source_volume')).toBe('Source volume')
})
