// ─── Country Extraction from Job Location Strings ──────────────────────────

// US state abbreviations (50 states + DC + territories)
const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'GU', 'VI',
])

// Full US state names → "US"
const US_STATE_NAMES = new Map<string, string>([
  ['alabama', 'US'], ['alaska', 'US'], ['arizona', 'US'], ['arkansas', 'US'],
  ['california', 'US'], ['colorado', 'US'], ['connecticut', 'US'], ['delaware', 'US'],
  ['florida', 'US'], ['georgia', 'US'], ['hawaii', 'US'], ['idaho', 'US'],
  ['illinois', 'US'], ['indiana', 'US'], ['iowa', 'US'], ['kansas', 'US'],
  ['kentucky', 'US'], ['louisiana', 'US'], ['maine', 'US'], ['maryland', 'US'],
  ['massachusetts', 'US'], ['michigan', 'US'], ['minnesota', 'US'], ['mississippi', 'US'],
  ['missouri', 'US'], ['montana', 'US'], ['nebraska', 'US'], ['nevada', 'US'],
  ['new hampshire', 'US'], ['new jersey', 'US'], ['new mexico', 'US'], ['new york', 'US'],
  ['north carolina', 'US'], ['north dakota', 'US'], ['ohio', 'US'], ['oklahoma', 'US'],
  ['oregon', 'US'], ['pennsylvania', 'US'], ['rhode island', 'US'], ['south carolina', 'US'],
  ['south dakota', 'US'], ['tennessee', 'US'], ['texas', 'US'], ['utah', 'US'],
  ['vermont', 'US'], ['virginia', 'US'], ['washington', 'US'], ['west virginia', 'US'],
  ['wisconsin', 'US'], ['wyoming', 'US'],
  ['district of columbia', 'US'], ['puerto rico', 'US'], ['guam', 'US'],
  ['virgin islands', 'US'],
])

// Country names/codes → ISO 3166-1 alpha-2 (top 30+ countries in tech job boards)
const COUNTRY_PATTERNS = new Map<string, string>([
  // US variants
  ['united states', 'US'], ['united states of america', 'US'], ['usa', 'US'], ['us', 'US'],
  // UK variants
  ['united kingdom', 'GB'], ['uk', 'GB'], ['england', 'GB'], ['scotland', 'GB'], ['wales', 'GB'],
  // Common tech job countries
  ['india', 'IN'], ['canada', 'CA'], ['germany', 'DE'], ['france', 'FR'],
  ['australia', 'AU'], ['netherlands', 'NL'], ['ireland', 'IE'], ['singapore', 'SG'],
  ['japan', 'JP'], ['south korea', 'KR'], ['brazil', 'BR'], ['mexico', 'MX'],
  ['spain', 'ES'], ['italy', 'IT'], ['switzerland', 'CH'], ['sweden', 'SE'],
  ['norway', 'NO'], ['denmark', 'DK'], ['finland', 'FI'], ['belgium', 'BE'],
  ['austria', 'AT'], ['poland', 'PL'], ['portugal', 'PT'], ['czech republic', 'CZ'],
  ['czechia', 'CZ'], ['romania', 'RO'], ['ukraine', 'UA'], ['israel', 'IL'],
  ['china', 'CN'], ['taiwan', 'TW'], ['hong kong', 'HK'], ['new zealand', 'NZ'],
  ['argentina', 'AR'], ['chile', 'CL'], ['colombia', 'CO'], ['philippines', 'PH'],
  ['vietnam', 'VN'], ['thailand', 'TH'], ['malaysia', 'MY'], ['indonesia', 'ID'],
  ['south africa', 'ZA'], ['nigeria', 'NG'], ['kenya', 'KE'], ['egypt', 'EG'],
  ['turkey', 'TR'], ['uae', 'AE'], ['united arab emirates', 'AE'], ['saudi arabia', 'SA'],
  ['qatar', 'QA'], ['pakistan', 'PK'], ['bangladesh', 'BD'], ['sri lanka', 'LK'],
  ['estonia', 'EE'], ['latvia', 'LV'], ['lithuania', 'LT'], ['croatia', 'HR'],
  ['serbia', 'RS'], ['bulgaria', 'BG'], ['hungary', 'HU'], ['slovakia', 'SK'],
  ['luxembourg', 'LU'], ['malta', 'MT'], ['iceland', 'IS'], ['greece', 'GR'],
  ['cyprus', 'CY'], ['russia', 'RU'], ['costa rica', 'CR'], ['uruguay', 'UY'],
  ['peru', 'PE'],
])

// Region acronyms and multi-country labels → non-US markers
const NON_US_REGIONS = new Set([
  'emea', 'apac', 'latam', 'asia', 'europe', 'africa',
  'asia pacific', 'middle east', 'european union', 'eu',
])

// Major non-US cities → country code
const CITY_PATTERNS = new Map<string, string>([
  ['london', 'GB'], ['manchester', 'GB'], ['edinburgh', 'GB'], ['bristol', 'GB'],
  ['berlin', 'DE'], ['munich', 'DE'], ['hamburg', 'DE'], ['frankfurt', 'DE'],
  ['paris', 'FR'], ['lyon', 'FR'],
  ['amsterdam', 'NL'], ['rotterdam', 'NL'],
  ['dublin', 'IE'],
  ['toronto', 'CA'], ['vancouver', 'CA'], ['montreal', 'CA'], ['ottawa', 'CA'],
  ['sydney', 'AU'], ['melbourne', 'AU'],
  ['tokyo', 'JP'], ['osaka', 'JP'],
  ['singapore', 'SG'],
  ['mexico city', 'MX'], ['guadalajara', 'MX'], ['monterrey', 'MX'],
  ['bangalore', 'IN'], ['bengaluru', 'IN'], ['mumbai', 'IN'], ['hyderabad', 'IN'],
  ['delhi', 'IN'], ['new delhi', 'IN'], ['pune', 'IN'], ['chennai', 'IN'],
  ['são paulo', 'BR'], ['sao paulo', 'BR'], ['rio de janeiro', 'BR'],
  ['tel aviv', 'IL'], ['jerusalem', 'IL'],
  ['warsaw', 'PL'], ['krakow', 'PL'], ['kraków', 'PL'],
  ['prague', 'CZ'], ['bucharest', 'RO'], ['budapest', 'HU'],
  ['lisbon', 'PT'], ['barcelona', 'ES'], ['madrid', 'ES'],
  ['zurich', 'CH'], ['zürich', 'CH'], ['geneva', 'CH'],
  ['stockholm', 'SE'], ['copenhagen', 'DK'], ['oslo', 'NO'], ['helsinki', 'FI'],
  ['brussels', 'BE'],
  ['hong kong', 'HK'], ['taipei', 'TW'], ['seoul', 'KR'],
  ['dubai', 'AE'], ['abu dhabi', 'AE'],
  ['cape town', 'ZA'], ['johannesburg', 'ZA'],
  ['bogota', 'CO'], ['bogotá', 'CO'], ['buenos aires', 'AR'], ['santiago', 'CL'],
  ['santo domingo', 'DO'],
])

/**
 * Extract a 2-letter ISO country code from a job location string.
 *
 * Parsing strategy (from end of string backward):
 * 1. Check for US state abbreviation after comma
 * 2. Check for known country name/code in segments
 * 3. Check for full US state name in segments
 * 4. "Remote" without country qualifier → "US"
 * 5. Fallback → "Unknown"
 */
export function extractCountry(location: string | null | undefined): string {
  if (!location || !location.trim()) return 'Unknown'

  const trimmed = location.trim()

  // Split on commas, dashes, and semicolons — work backward
  const segments = trimmed
    .split(/[,;\-–—]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  // Check segments from the end backward
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]
    const segUpper = seg.toUpperCase()
    const segLower = seg.toLowerCase()

    // Strip parentheses for matching (e.g., "(Anywhere)")
    const cleanLower = segLower.replace(/[()]/g, '').trim()

    // Skip generic terms that aren't countries
    if (['anywhere', 'worldwide', 'global', 'hybrid remote', 'remote'].includes(cleanLower)) {
      continue
    }

    // Check non-US region acronyms (EMEA, APAC, Asia, etc.)
    // Strip trailing codes like "APAC-C1" → "apac"
    const regionClean = cleanLower.replace(/[\s-]\w{1,3}$/, '')
    if (NON_US_REGIONS.has(cleanLower) || NON_US_REGIONS.has(regionClean)) {
      return 'INTL'
    }

    // Check US state abbreviation (2-letter uppercase)
    if (segUpper.length === 2 && US_STATES.has(segUpper)) {
      return 'US'
    }

    // Check country patterns
    const countryCode = COUNTRY_PATTERNS.get(cleanLower)
    if (countryCode) return countryCode

    // Check full US state names
    const stateCode = US_STATE_NAMES.get(cleanLower)
    if (stateCode) return stateCode

    // Check city patterns (exact match and as prefix, e.g. "Mexico City, DF")
    const cityCode = CITY_PATTERNS.get(cleanLower)
    if (cityCode) return cityCode
  }

  // Second pass: check multi-word city names across the full string
  const fullLower = trimmed.toLowerCase()
  for (const [city, code] of CITY_PATTERNS) {
    if (city.includes(' ') && fullLower.includes(city)) return code
  }

  // If the string contains "remote" and we haven't found a country, default to US
  if (/\bremote\b/i.test(trimmed)) {
    return 'US'
  }

  return 'Unknown'
}
