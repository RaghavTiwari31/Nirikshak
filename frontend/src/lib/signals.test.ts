import { expect, it } from 'vitest'
import { fmtMetric } from './signals'

it('formats each signal metric in its own unit', () => {
  expect(fmtMetric('EG-01', 0.25)).toBe('25%')
  expect(fmtMetric('EG-09', 0.052)).toBe('5.2%')
  expect(fmtMetric('EG-05', 7.345)).toBe('7.3×')
  expect(fmtMetric('NS-03', 60)).toBe('60 days')
  expect(fmtMetric('NS-02', 4)).toBe('4')
  expect(fmtMetric('AN-01', 0.5467)).toBe('0.55')
  expect(fmtMetric('EG-01', null)).toBe('—')
})
