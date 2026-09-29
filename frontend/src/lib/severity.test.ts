import { describe, expect, it } from 'vitest'
import { BAND_LABEL, saiBand, severityColor, severityInk } from './severity'

describe('saiBand', () => {
  it('maps SAI boundaries to bands', () => {
    expect(saiBand(0)).toBe(1)
    expect(saiBand(24.9)).toBe(1)
    expect(saiBand(25)).toBe(2)
    expect(saiBand(50)).toBe(3)
    expect(saiBand(75)).toBe(4)
    expect(saiBand(100)).toBe(4)
  })
})

describe('severityColor', () => {
  it('clamps out-of-range levels', () => {
    expect(severityColor(0)).toBe('var(--sev-low)')
    expect(severityColor(9)).toBe('var(--sev-critical)')
  })
})

describe('severityInk', () => {
  it('uses the darker text step of the same level', () => {
    expect(severityInk(2)).toBe('var(--sev-medium-ink)')
    expect(severityInk(7)).toBe('var(--sev-critical-ink)')
  })
})

describe('BAND_LABEL', () => {
  it('names every attention band in plain words', () => {
    expect([1, 2, 3, 4].map((b) => BAND_LABEL[b as 1 | 2 | 3 | 4])).toEqual(['Routine', 'Watch', 'Attention', 'Priority'])
  })
})
