// ─── Jaro-Winkler Similarity ────────────────────────────────────────────────

export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0
  if (s1.length === 0 || s2.length === 0) return 0.0

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1
  if (matchDistance < 0) return 0.0

  const s1Matches = new Array<boolean>(s1.length).fill(false)
  const s2Matches = new Array<boolean>(s2.length).fill(false)

  let matches = 0
  let transpositions = 0

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, s2.length)

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }

  if (matches === 0) return 0.0

  let k = 0
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }

  const jaro =
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3

  // Winkler modification: boost for common prefix (up to 4 chars)
  let prefix = 0
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }

  return jaro + prefix * 0.1 * (1 - jaro)
}

// ─── Salary Overlap ─────────────────────────────────────────────────────────

export function salaryOverlap(
  a: { min?: number; max?: number },
  b: { min?: number; max?: number },
): number | null {
  const aMin = a.min
  const aMax = a.max ?? a.min
  const bMin = b.min
  const bMax = b.max ?? b.min

  // If either side lacks salary data entirely, return null (no signal)
  if (aMin === undefined || bMin === undefined) return null
  if (aMax === undefined || bMax === undefined) return null

  const overlapStart = Math.max(aMin, bMin)
  const overlapEnd = Math.min(aMax, bMax)

  if (overlapStart > overlapEnd) return 0.0

  const overlapRange = overlapEnd - overlapStart
  const totalRange = Math.max(aMax, bMax) - Math.min(aMin, bMin)

  if (totalRange === 0) return 1.0

  return overlapRange / totalRange
}

// ─── Location Normalization ─────────────────────────────────────────────────

const LOCATION_ALIASES: Record<string, string> = {
  'nyc': 'New York, NY',
  'new york city': 'New York, NY',
  'new york': 'New York, NY',
  'sf': 'San Francisco, CA',
  'san francisco': 'San Francisco, CA',
  'la': 'Los Angeles, CA',
  'los angeles': 'Los Angeles, CA',
  'dc': 'Washington, DC',
  'washington d.c.': 'Washington, DC',
  'washington dc': 'Washington, DC',
  'chi': 'Chicago, IL',
  'chicago': 'Chicago, IL',
}

export function normalizeLocation(location: string): string {
  const trimmed = location.trim()
  const lower = trimmed.toLowerCase()
  return LOCATION_ALIASES[lower] ?? trimmed
}

// ─── Location Similarity ────────────────────────────────────────────────────

export function locationSimilarity(loc1: string, loc2: string): number {
  const norm1 = normalizeLocation(loc1).toLowerCase()
  const norm2 = normalizeLocation(loc2).toLowerCase()

  if (norm1 === norm2) return 1.0

  return jaroWinkler(norm1, norm2)
}
