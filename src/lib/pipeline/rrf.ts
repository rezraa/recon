import type { Signal } from './types'

// RRF constant (standard value from literature)
const K = 60

// ─── Reciprocal Rank Fusion ─────────────────────────────────────────────────

/**
 * Compute RRF score from multiple signals.
 * Null signals are excluded from fusion (e.g., title embedding when not yet computed).
 * Formula: RRF_score = Σ 1/(k + rank_i) for each non-null signal
 */
export function computeRRFScore(signals: (Signal | null)[]): number {
  const validSignals = signals.filter((s): s is Signal => s !== null)

  if (validSignals.length === 0) return 0.0

  let score = 0
  for (const signal of validSignals) {
    score += 1 / (K + signal.rank)
  }

  // Normalize by dividing by the maximum possible score for this many signals
  // Max score occurs when all ranks are 1 (best)
  const maxScore = validSignals.length * (1 / (K + 1))

  return maxScore > 0 ? score / maxScore : 0.0
}
