const CIRCUMFERENCE = 2 * Math.PI * 16 // r=16, ~100.53

function getColor(score: number): string {
  if (score < 30) return '#ef4444'
  if (score < 50) return '#f97316'
  if (score < 70) return '#eab308'
  if (score < 85) return '#22c55e'
  return '#10b981'
}

interface ScoreRingProps {
  score: number
  partial?: boolean
  size?: number
}

export function ScoreRing({ score, partial = false, size = 42 }: ScoreRingProps) {
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE

  if (partial) {
    const hasScore = score > 0
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" aria-label={hasScore ? `Approximate score: ${score}` : 'Pending enrichment'}>
        <circle cx="20" cy="20" r="16" fill="none" stroke="#374151" strokeWidth="3" />
        <circle
          cx="20" cy="20" r="16" fill="none"
          stroke="#facc15" strokeWidth="3"
          strokeDasharray="6 3"
          transform="rotate(-90 20 20)"
          style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
          fontSize={hasScore ? '11' : '9'} fontWeight="600" fill="#d1d5db">
          {hasScore ? `~${score}` : '...'}
        </text>
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label={`Score: ${score}`}>
      <circle cx="20" cy="20" r="16" fill="none" stroke="#374151" strokeWidth="3" />
      <circle
        cx="20" cy="20" r="16" fill="none"
        stroke={getColor(score)} strokeWidth="3"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fontSize="11" fontWeight="600" fill="white">
        {score}
      </text>
    </svg>
  )
}
