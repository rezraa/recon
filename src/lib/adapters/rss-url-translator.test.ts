import { describe, expect, it } from 'vitest'

import { buildLinkedInRssHubUrl, buildSearchUrls } from './rss-url-translator'

describe('buildLinkedInRssHubUrl', () => {
  const base = 'http://localhost:1200'

  it('should build URL with keywords only (defaults to all/all)', () => {
    const url = buildLinkedInRssHubUrl('SDET', base)
    expect(url).toBe('http://localhost:1200/linkedin/jobs/all/all/SDET')
  })

  it('should build URL with geoId query param', () => {
    const url = buildLinkedInRssHubUrl('SDET', base, { geoId: '102265205' })
    expect(url).toBe('http://localhost:1200/linkedin/jobs/all/all/SDET?geoId=102265205')
  })

  it('should build URL with jobTypes and expLevels', () => {
    const url = buildLinkedInRssHubUrl('React Developer', base, {
      jobTypes: 'F',
      expLevels: '4',
    })
    expect(url).toBe('http://localhost:1200/linkedin/jobs/F/4/React%20Developer')
  })

  it('should build URL with all options', () => {
    const url = buildLinkedInRssHubUrl('Node.js', base, {
      jobTypes: 'F',
      expLevels: '3',
      geoId: '102265205',
    })
    expect(url).toBe('http://localhost:1200/linkedin/jobs/F/3/Node.js?geoId=102265205')
  })

  it('should URL-encode special characters in keywords', () => {
    const url = buildLinkedInRssHubUrl('C++ Engineer', base)
    expect(url).toBe('http://localhost:1200/linkedin/jobs/all/all/C%2B%2B%20Engineer')
  })

  it('should URL-encode ampersands in keywords', () => {
    const url = buildLinkedInRssHubUrl('R&D Manager', base)
    expect(url).toBe('http://localhost:1200/linkedin/jobs/all/all/R%26D%20Manager')
  })

  it('should handle trailing slash on base URL', () => {
    const url = buildLinkedInRssHubUrl('SDET', 'http://localhost:1200/')
    expect(url).toBe('http://localhost:1200/linkedin/jobs/all/all/SDET')
  })

  it('should trim whitespace from keywords', () => {
    const url = buildLinkedInRssHubUrl('  SDET  ', base)
    expect(url).toBe('http://localhost:1200/linkedin/jobs/all/all/SDET')
  })

  it('should URL-encode geoId with special characters', () => {
    const url = buildLinkedInRssHubUrl('SDET', base, { geoId: '123?foo=bar' })
    expect(url).toContain('geoId=123%3Ffoo%3Dbar')
    expect(url).not.toContain('?foo=bar')
  })
})

describe('buildSearchUrls', () => {
  it('should return linkedin URL when rsshubUrl is configured', () => {
    const result = buildSearchUrls('SDET', { rsshubUrl: 'http://localhost:1200' })
    expect(result.linkedin).toBe('http://localhost:1200/linkedin/jobs/all/all/SDET')
    expect(result.serply).toBeUndefined()
  })

  it('should return serply URL when serplyKey is configured', () => {
    const result = buildSearchUrls('SDET', { serplyKey: 'test-key' })
    expect(result.linkedin).toBeUndefined()
    expect(result.serply).toBe('SDET')
  })

  it('should return both URLs when both are configured', () => {
    const result = buildSearchUrls('SDET', {
      rsshubUrl: 'http://localhost:1200',
      serplyKey: 'test-key',
    })
    expect(result.linkedin).toBeDefined()
    expect(result.serply).toBe('SDET')
  })

  it('should return empty object when neither is configured', () => {
    const result = buildSearchUrls('SDET', {})
    expect(result.linkedin).toBeUndefined()
    expect(result.serply).toBeUndefined()
  })

  it('should pass geoId through to LinkedIn URL', () => {
    const result = buildSearchUrls('SDET', {
      rsshubUrl: 'http://localhost:1200',
      geoId: '102265205',
    })
    expect(result.linkedin).toContain('geoId=102265205')
  })

  it('should handle empty query string', () => {
    const result = buildSearchUrls('', { rsshubUrl: 'http://localhost:1200' })
    expect(result.linkedin).toBeUndefined()
  })

  it('should handle whitespace-only query string', () => {
    const result = buildSearchUrls('   ', { rsshubUrl: 'http://localhost:1200' })
    expect(result.linkedin).toBeUndefined()
  })
})
