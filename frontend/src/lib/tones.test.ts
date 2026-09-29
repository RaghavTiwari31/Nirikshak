import { describe, expect, it } from 'vitest'
import { coverageTone, healthTone, rateTone } from './tones'

describe('healthTone', () => {
  it('bins 0–100 scores into the four health levels', () => {
    expect(healthTone(100).label).toBe('Healthy')
    expect(healthTone(80).label).toBe('Healthy')
    expect(healthTone(79).label).toBe('Some concern')
    expect(healthTone(38).label).toBe('Weak')
    expect(healthTone(19).label).toBe('Very weak')
  })
})

describe('coverageTone', () => {
  it('marks holes and zero coverage as None, and skips missing values', () => {
    expect(coverageTone(1.3)?.label).toBe('As expected')
    expect(coverageTone(0.5)?.label).toBe('Partial')
    expect(coverageTone(0.2)?.label).toBe('Low')
    expect(coverageTone(0)?.label).toBe('None')
    expect(coverageTone(0.9, true)?.label).toBe('None')
    expect(coverageTone(null)).toBeNull()
  })
})

describe('rateTone', () => {
  it('grades success rates', () => {
    expect(rateTone(1)?.label).toBe('Strong')
    expect(rateTone(0.8)?.label).toBe('Fair')
    expect(rateTone(0.6)?.label).toBe('Weak')
    expect(rateTone(0.1)?.label).toBe('Poor')
    expect(rateTone(undefined)).toBeNull()
  })
})
