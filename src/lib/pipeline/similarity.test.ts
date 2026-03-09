import { describe, expect, it } from 'vitest'

import { jaroWinkler, locationSimilarity, normalizeLocation, salaryOverlap } from './similarity'

describe('jaroWinkler', () => {
  it('[P1] should return 1.0 for identical strings', () => {
    expect(jaroWinkler('Google', 'Google')).toBe(1.0)
  })

  it('[P1] should return 0.0 for empty strings', () => {
    expect(jaroWinkler('', 'Google')).toBe(0.0)
    expect(jaroWinkler('Google', '')).toBe(0.0)
  })

  it('[P1] should return 0.0 for completely different strings', () => {
    expect(jaroWinkler('abc', 'xyz')).toBe(0.0)
  })

  it('[P1] should return high score for "Google" vs "Google LLC"', () => {
    const score = jaroWinkler('Google', 'Google LLC')
    expect(score).toBeGreaterThan(0.85)
  })

  it('[P1] should return high score for similar company names', () => {
    const score = jaroWinkler('Microsoft', 'Microsoft Corp')
    expect(score).toBeGreaterThan(0.85)
  })

  it('[P2] should be symmetric', () => {
    const ab = jaroWinkler('Google', 'Google LLC')
    const ba = jaroWinkler('Google LLC', 'Google')
    expect(Math.abs(ab - ba)).toBeLessThan(0.001)
  })

  it('[P2] should handle single character strings', () => {
    expect(jaroWinkler('a', 'a')).toBe(1.0)
    expect(jaroWinkler('a', 'b')).toBe(0.0)
  })

  it('[P2] should give higher scores when common prefix is longer', () => {
    const withPrefix = jaroWinkler('Google Inc', 'Google LLC')
    const noPrefix = jaroWinkler('Inc Google', 'LLC Google')
    expect(withPrefix).toBeGreaterThanOrEqual(noPrefix)
  })

  it('[P1] should return 1.0 for both empty strings', () => {
    expect(jaroWinkler('', '')).toBe(1.0)
  })
})

describe('salaryOverlap', () => {
  it('[P1] should return null when first salary is missing', () => {
    expect(salaryOverlap({}, { min: 100000, max: 150000 })).toBeNull()
  })

  it('[P1] should return null when second salary is missing', () => {
    expect(salaryOverlap({ min: 100000, max: 150000 }, {})).toBeNull()
  })

  it('[P1] should return null when both salaries are missing', () => {
    expect(salaryOverlap({}, {})).toBeNull()
  })

  it('[P1] should return 1.0 for identical ranges', () => {
    expect(salaryOverlap({ min: 100000, max: 150000 }, { min: 100000, max: 150000 })).toBe(1.0)
  })

  it('[P1] should return 0.0 for non-overlapping ranges', () => {
    expect(salaryOverlap({ min: 50000, max: 80000 }, { min: 100000, max: 150000 })).toBe(0.0)
  })

  it('[P1] should return partial overlap score', () => {
    const score = salaryOverlap({ min: 100000, max: 150000 }, { min: 120000, max: 180000 })
    expect(score).toBeGreaterThan(0.0)
    expect(score).toBeLessThan(1.0)
    // overlap: 120k-150k = 30k, total: 100k-180k = 80k => 30/80 = 0.375
    expect(score).toBeCloseTo(0.375, 2)
  })

  it('[P1] should handle single value (min only)', () => {
    expect(salaryOverlap({ min: 100000 }, { min: 100000 })).toBe(1.0)
  })

  it('[P2] should handle one range containing another', () => {
    const score = salaryOverlap({ min: 80000, max: 200000 }, { min: 100000, max: 150000 })
    expect(score).toBeGreaterThan(0.0)
    expect(score).toBeLessThan(1.0)
  })

  it('[P2] should handle zero-width ranges (same min and max)', () => {
    expect(salaryOverlap({ min: 100000, max: 100000 }, { min: 100000, max: 100000 })).toBe(1.0)
  })
})

describe('normalizeLocation', () => {
  it('[P1] should normalize "NYC" to "New York, NY"', () => {
    expect(normalizeLocation('NYC')).toBe('New York, NY')
  })

  it('[P1] should normalize "SF" to "San Francisco, CA"', () => {
    expect(normalizeLocation('SF')).toBe('San Francisco, CA')
  })

  it('[P1] should normalize "New York City" to "New York, NY"', () => {
    expect(normalizeLocation('New York City')).toBe('New York, NY')
  })

  it('[P1] should pass through unknown locations', () => {
    expect(normalizeLocation('Austin, TX')).toBe('Austin, TX')
  })

  it('[P2] should trim whitespace', () => {
    expect(normalizeLocation('  NYC  ')).toBe('New York, NY')
  })

  it('[P2] should be case-insensitive for aliases', () => {
    expect(normalizeLocation('nyc')).toBe('New York, NY')
    expect(normalizeLocation('NYC')).toBe('New York, NY')
    expect(normalizeLocation('Nyc')).toBe('New York, NY')
  })
})

describe('locationSimilarity', () => {
  it('[P1] should return 1.0 for identical locations', () => {
    expect(locationSimilarity('New York, NY', 'New York, NY')).toBe(1.0)
  })

  it('[P1] should return 1.0 for "NYC" vs "New York, NY" (aliased)', () => {
    expect(locationSimilarity('NYC', 'New York, NY')).toBe(1.0)
  })

  it('[P1] should return high score for similar locations', () => {
    const score = locationSimilarity('San Francisco', 'San Francisco, CA')
    expect(score).toBeGreaterThan(0.8)
  })

  it('[P1] should return low score for different locations', () => {
    const score = locationSimilarity('New York, NY', 'Los Angeles, CA')
    expect(score).toBeLessThan(0.7)
  })
})
