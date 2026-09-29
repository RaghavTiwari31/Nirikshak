import { expect, it } from 'vitest'
import { fmtParam } from './taxonomy'

it('formats share parameters as percentages and leaves others alone', () => {
  expect(fmtParam('min_share', 0.08)).toBe('8%')
  expect(fmtParam('max_human_share', 0.05)).toBe('5%')
  expect(fmtParam('batch_size', 10)).toBe('10')
  expect(fmtParam('alpha', 0.001)).toBe('0.001')
})
