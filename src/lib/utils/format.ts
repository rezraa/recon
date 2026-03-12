import { Building2, Globe, RefreshCw } from 'lucide-react'

/** Decode HTML entities like &#038; &amp; &lt; etc. from source-scraped text */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
}

export function formatSalary(min: number | null, max: number | null): string {
  const lo = min && min > 0 ? min : null
  const hi = max && max > 0 ? max : null
  if (lo && hi) return `$${Math.round(lo / 1000)}k – $${Math.round(hi / 1000)}k`
  if (lo) return `$${Math.round(lo / 1000)}k+`
  if (hi) return `Up to $${Math.round(hi / 1000)}k`
  return ''
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Infer work style from isRemote flag and location text */
export function inferWorkStyle(isRemote: boolean, location: string | null): { label: string; icon: typeof Globe } {
  const loc = (location ?? '').trim()
  if (isRemote) {
    if (loc && !/^remote$/i.test(loc)) return { label: `Remote · ${loc}`, icon: Globe }
    return { label: 'Remote', icon: Globe }
  }
  const locLower = loc.toLowerCase()
  if (locLower.includes('hybrid')) {
    const clean = loc.replace(/\s*\(?\bhybrid\b\)?[,\s-]*/i, '').trim()
    if (clean) return { label: `Hybrid · ${clean}`, icon: RefreshCw }
    return { label: 'Hybrid', icon: RefreshCw }
  }
  if (loc) return { label: loc, icon: Building2 }
  return { label: 'On-site', icon: Building2 }
}
