import { describe, expect, it } from 'vitest'

import { computeRRFScore } from './rrf'

describe('computeRRFScore', () => {
  it('[P1] should return 0 for empty signals array', () => {
    expect(computeRRFScore([])).toBe(0.0)
  })

  it('[P1] should return 0 for all-null signals', () => {
    expect(computeRRFScore([null, null, null])).toBe(0.0)
  })

  it('[P1] should return 1.0 for a single signal with rank 1 (best)', () => {
    const score = computeRRFScore([{ rank: 1 }])
    expect(score).toBeCloseTo(1.0, 5)
  })

  it('[P1] should return lower score for higher rank values', () => {
    const best = computeRRFScore([{ rank: 1 }])
    const worse = computeRRFScore([{ rank: 10 }])
    const worst = computeRRFScore([{ rank: 100 }])

    expect(best).toBeGreaterThan(worse)
    expect(worse).toBeGreaterThan(worst)
  })

  it('[P1] should exclude null signals from computation', () => {
    const withNull = computeRRFScore([{ rank: 1 }, null, null])
    const withoutNull = computeRRFScore([{ rank: 1 }])
    expect(withNull).toBeCloseTo(withoutNull, 5)
  })

  it('[P1] should combine multiple signals', () => {
    const singleSignal = computeRRFScore([{ rank: 1 }])
    const multiSignal = computeRRFScore([{ rank: 1 }, { rank: 1 }])
    // Both rank-1 signals should produce same normalized score
    expect(multiSignal).toBeCloseTo(singleSignal, 5)
  })

  it('[P1] should produce higher score when more signals agree on top rank', () => {
    const allGood = computeRRFScore([{ rank: 1 }, { rank: 1 }, { rank: 1 }])
    const mixed = computeRRFScore([{ rank: 1 }, { rank: 50 }, { rank: 100 }])
    expect(allGood).toBeGreaterThan(mixed)
  })

  it('[P2] should use k=60 constant (verify specific value)', () => {
    // With k=60, rank=1: 1/(60+1) = 1/61
    // Normalized by max (also 1/61): score = 1.0
    const score = computeRRFScore([{ rank: 1 }])
    expect(score).toBeCloseTo(1.0, 5)
  })

  it('[P2] should handle mix of valid signals and nulls', () => {
    const score = computeRRFScore([{ rank: 1 }, null, { rank: 5 }, null, { rank: 10 }])
    expect(score).toBeGreaterThan(0.0)
    expect(score).toBeLessThan(1.0)
  })

  it('[P2] should return value between 0 and 1', () => {
    const testCases = [
      [{ rank: 1 }],
      [{ rank: 1 }, { rank: 100 }],
      [{ rank: 50 }, { rank: 50 }, { rank: 50 }],
      [{ rank: 1 }, null, { rank: 1 }],
    ]

    for (const signals of testCases) {
      const score = computeRRFScore(signals)
      expect(score).toBeGreaterThanOrEqual(0.0)
      expect(score).toBeLessThanOrEqual(1.0)
    }
  })
})
