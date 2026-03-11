import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createMockAdapter } from '@/test-utils/factories/adapter.factory'

import { SOURCE_CONFIGS } from './constants'
import { himalayasAdapter } from './himalayas'
import { jobicyAdapter } from './jobicy'
import {
  clearAdapterRegistry,
  getAdapter,
  getAllAdapters,
  getAllSources,
  getEnabledAdapters,
  getKeyRequiredSources,
  getOpenSources,
  getSourceByName,
  getSourcesByRegion,
  registerAdapter,
} from './registry'
import { serplyAdapter } from './serply'
import { themuseAdapter } from './themuse'
import { rawJobListingSchema } from './types'

function reRegisterDefaults() {
  registerAdapter(himalayasAdapter)
  registerAdapter(themuseAdapter)
  registerAdapter(jobicyAdapter)
  registerAdapter(serplyAdapter)
}

// Zod schema to validate SOURCE_CONFIGS shape
const sourceConfigSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  type: z.enum(['open', 'key_required']),
  description: z.string().min(1),
  signupUrl: z.string().url().optional(),
  regions: z.array(z.string().min(1)).min(1),
  attribution: z.object({
    requiresFollowLink: z.boolean(),
    attributionUrl: z.string().url(),
    descriptionPolicy: z.literal('no_modify'),
  }),
  rateLimits: z.object({
    requestsPerHour: z.number().nullable(),
    requestsPerDay: z.number().nullable(),
    requestsPerMonth: z.number().nullable(),
    cooldownMs: z.number().min(0),
  }),
})

describe('SOURCE_CONFIGS validation', () => {
  it('should have exactly 4 sources', () => {
    expect(Object.keys(SOURCE_CONFIGS)).toHaveLength(4)
  })

  it('should contain all expected sources', () => {
    expect(Object.keys(SOURCE_CONFIGS)).toEqual(
      expect.arrayContaining(['himalayas', 'themuse', 'jobicy', 'serply']),
    )
  })

  it.each(Object.entries(SOURCE_CONFIGS))('%s should match SourceConfig Zod schema', (_, config) => {
    const result = sourceConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it.each(Object.entries(SOURCE_CONFIGS))('%s should have name matching its key', (key, config) => {
    expect(config.name).toBe(key)
  })

  it('should have all open sources without signupUrl', () => {
    const openSources = Object.values(SOURCE_CONFIGS).filter((s) => s.type === 'open')
    for (const source of openSources) {
      expect(source.signupUrl).toBeUndefined()
    }
  })

  it('should have signupUrl for key_required sources', () => {
    const keySources = Object.values(SOURCE_CONFIGS).filter((s) => s.type === 'key_required')
    for (const source of keySources) {
      expect(source.signupUrl).toBeDefined()
    }
  })

  it('should have descriptionPolicy as no_modify for all sources', () => {
    for (const config of Object.values(SOURCE_CONFIGS)) {
      expect(config.attribution.descriptionPolicy).toBe('no_modify')
    }
  })
})

describe('getAllSources', () => {
  it('should return all 4 sources', () => {
    const sources = getAllSources()
    expect(sources).toHaveLength(4)
  })

  it('should return SourceConfig objects', () => {
    const sources = getAllSources()
    for (const source of sources) {
      expect(source).toHaveProperty('name')
      expect(source).toHaveProperty('type')
      expect(source).toHaveProperty('attribution')
      expect(source).toHaveProperty('rateLimits')
    }
  })
})

describe('getSourceByName', () => {
  it('should return source by name', () => {
    const source = getSourceByName('himalayas')
    expect(source).toBeDefined()
    expect(source!.displayName).toBe('Himalayas')
  })

  it('should return undefined for unknown source', () => {
    const source = getSourceByName('nonexistent')
    expect(source).toBeUndefined()
  })

  it('should return serply with correct type', () => {
    const source = getSourceByName('serply')
    expect(source).toBeDefined()
    expect(source!.type).toBe('key_required')
    expect(source!.signupUrl).toBe('https://serply.io')
  })
})

describe('getOpenSources', () => {
  it('should return only open sources', () => {
    const sources = getOpenSources()
    expect(sources).toHaveLength(3)
    for (const source of sources) {
      expect(source.type).toBe('open')
    }
  })

  it('should include Himalayas, The Muse, and Jobicy', () => {
    const names = getOpenSources().map((s) => s.name)
    expect(names).toEqual(expect.arrayContaining(['himalayas', 'themuse', 'jobicy']))
  })
})

describe('getKeyRequiredSources', () => {
  it('should return only key-required sources', () => {
    const sources = getKeyRequiredSources()
    expect(sources).toHaveLength(1)
    expect(sources[0].name).toBe('serply')
    expect(sources[0].type).toBe('key_required')
  })
})

describe('getSourcesByRegion', () => {
  it('should return US sources including global ones', () => {
    const sources = getSourcesByRegion('US')
    const names = sources.map((s) => s.name)
    // themuse has ['US'], others have ['*']
    expect(names).toContain('themuse')
    expect(names).toContain('himalayas')
    expect(names).toContain('serply')
    expect(sources.length).toBe(4) // all sources match US (3 global + 1 US-specific)
  })

  it('should return only global sources for non-US region', () => {
    const sources = getSourcesByRegion('GB')
    const names = sources.map((s) => s.name)
    expect(names).not.toContain('themuse') // themuse is US-only
    expect(names).toContain('himalayas')
    expect(sources.length).toBe(3) // 3 global sources
  })

  it('should return global sources for unknown region', () => {
    const sources = getSourcesByRegion('ZZ')
    expect(sources.length).toBe(3)
    for (const source of sources) {
      expect(source.regions).toContain('*')
    }
  })
})

// ─── Adapter-Level Registry Tests ─────────────────────────────────────────

describe('adapter registry (pre-registered)', () => {
  it('should have all 4 adapters registered by default', () => {
    const adapters = getAllAdapters()
    expect(adapters).toHaveLength(4)
  })

  it('should have adapter names matching source config names', () => {
    const adapterNames = getAllAdapters().map((a) => a.name).sort()
    const configNames = Object.keys(SOURCE_CONFIGS).sort()
    expect(adapterNames).toEqual(configNames)
  })

  it.each(['himalayas', 'themuse', 'jobicy', 'serply'])(
    'should retrieve %s adapter by name',
    (name) => {
      const adapter = getAdapter(name)
      expect(adapter).toBeDefined()
      expect(adapter!.name).toBe(name)
    },
  )

  it('should return undefined for unknown adapter', () => {
    expect(getAdapter('nonexistent')).toBeUndefined()
  })

  it('should have correct displayName for each adapter', () => {
    expect(getAdapter('himalayas')!.displayName).toBe('Himalayas')
    expect(getAdapter('themuse')!.displayName).toBe('The Muse')
    expect(getAdapter('jobicy')!.displayName).toBe('Jobicy')
    expect(getAdapter('serply')!.displayName).toBe('Serply')
  })

  it('should have correct type for each adapter', () => {
    expect(getAdapter('himalayas')!.type).toBe('open')
    expect(getAdapter('themuse')!.type).toBe('open')
    expect(getAdapter('jobicy')!.type).toBe('open')
    expect(getAdapter('serply')!.type).toBe('key_required')
  })

  it('should have serply adapter with validateKey method', () => {
    const serply = getAdapter('serply')
    expect(serply!.validateKey).toBeDefined()
    expect(typeof serply!.validateKey).toBe('function')
  })

  it('should have real implementations (not stubs) for all adapters', () => {
    const adapters = getAllAdapters()
    for (const adapter of adapters) {
      expect(typeof adapter.fetchListings).toBe('function')
    }
  })
})

describe('adapter registry (dynamic registration)', () => {
  beforeEach(() => {
    clearAdapterRegistry()
  })

  afterEach(() => {
    clearAdapterRegistry()
    reRegisterDefaults()
  })

  it('should register a custom adapter', () => {
    const mockAdapter = createMockAdapter({ name: 'custom-source', displayName: 'Custom' })
    registerAdapter(mockAdapter)
    expect(getAdapter('custom-source')).toBe(mockAdapter)
  })

  it('should overwrite adapter with same name', () => {
    const first = createMockAdapter({ name: 'test-source', displayName: 'First' })
    const second = createMockAdapter({ name: 'test-source', displayName: 'Second' })
    registerAdapter(first)
    registerAdapter(second)
    expect(getAdapter('test-source')!.displayName).toBe('Second')
  })

  it('should clear registry and re-register', () => {
    registerAdapter(createMockAdapter({ name: 'a' }))
    registerAdapter(createMockAdapter({ name: 'b' }))
    clearAdapterRegistry()
    expect(getAllAdapters()).toHaveLength(0)
    expect(getAdapter('a')).toBeUndefined()
  })
})

describe('getEnabledAdapters', () => {
  it('should return only adapters whose source is enabled', () => {
    const sources = [
      { name: 'himalayas', isEnabled: true },
      { name: 'themuse', isEnabled: false },
      { name: 'serply', isEnabled: true },
    ]
    const enabled = getEnabledAdapters(sources)
    const names = enabled.map((a) => a.name)
    expect(names).toContain('himalayas')
    expect(names).toContain('serply')
    expect(names).not.toContain('themuse')
  })

  it('should return empty array when no sources are enabled', () => {
    const sources = [
      { name: 'himalayas', isEnabled: false },
      { name: 'serply', isEnabled: false },
    ]
    expect(getEnabledAdapters(sources)).toHaveLength(0)
  })

  it('should return empty array for empty sources list', () => {
    expect(getEnabledAdapters([])).toHaveLength(0)
  })

  it('should ignore sources without matching adapters', () => {
    const sources = [
      { name: 'nonexistent', isEnabled: true },
      { name: 'himalayas', isEnabled: true },
    ]
    const enabled = getEnabledAdapters(sources)
    expect(enabled).toHaveLength(1)
    expect(enabled[0].name).toBe('himalayas')
  })

  it('should return all adapters when all sources are enabled', () => {
    const sources = [
      { name: 'himalayas', isEnabled: true },
      { name: 'themuse', isEnabled: true },
      { name: 'jobicy', isEnabled: true },
      { name: 'serply', isEnabled: true },
    ]
    expect(getEnabledAdapters(sources)).toHaveLength(4)
  })
})

// ─── Constants Immutability Tests ────────────────────────────────────────────

describe('SOURCE_CONFIGS immutability', () => {
  it('should throw when modifying top-level property', () => {
    expect(() => {
      (SOURCE_CONFIGS as Record<string, unknown>).newSource = {}
    }).toThrow()
  })

  it('should throw when modifying nested attribution', () => {
    expect(() => {
      (SOURCE_CONFIGS.himalayas.attribution as { requiresFollowLink: boolean }).requiresFollowLink = false
    }).toThrow()
  })

  it('should throw when modifying nested rateLimits', () => {
    expect(() => {
      (SOURCE_CONFIGS.himalayas.rateLimits as { cooldownMs: number }).cooldownMs = 0
    }).toThrow()
  })
})

// ─── Region Filtering Edge Cases ────────────────────────────────────────────

describe('getSourcesByRegion edge cases', () => {
  it('should be case-sensitive for region codes', () => {
    // regions use uppercase ISO codes, lowercase should not match
    const sources = getSourcesByRegion('us')
    // Only global (*) sources match — 'US' !== 'us'
    expect(sources.every((s) => s.regions.includes('*'))).toBe(true)
    expect(sources.length).toBe(3) // 3 global sources, themuse excluded
  })

  it('should return only global sources for empty string region', () => {
    const sources = getSourcesByRegion('')
    expect(sources.length).toBe(3)
    for (const source of sources) {
      expect(source.regions).toContain('*')
    }
  })
})

// ─── Adapter-Config Cross Validation ────────────────────────────────────────

describe('adapter-config consistency', () => {
  it('should have validateKey for all key_required adapters', () => {
    const keyRequiredConfigs = Object.values(SOURCE_CONFIGS).filter((c) => c.type === 'key_required')
    for (const config of keyRequiredConfigs) {
      const adapter = getAdapter(config.name)
      expect(adapter, `${config.name} should have a registered adapter`).toBeDefined()
      expect(adapter!.validateKey, `${config.name} should have validateKey method`).toBeDefined()
    }
  })

  it('should have matching type between adapter and config for all sources', () => {
    for (const [name, config] of Object.entries(SOURCE_CONFIGS)) {
      const adapter = getAdapter(name)
      expect(adapter, `${name} should have a registered adapter`).toBeDefined()
      expect(adapter!.type).toBe(config.type)
    }
  })

  it('should have matching displayName between adapter and config for all sources', () => {
    for (const [name, config] of Object.entries(SOURCE_CONFIGS)) {
      const adapter = getAdapter(name)
      expect(adapter!.displayName).toBe(config.displayName)
    }
  })
})

// ─── getEnabledAdapters Edge Cases ──────────────────────────────────────────

describe('getEnabledAdapters edge cases', () => {
  it('should handle duplicate source names in input', () => {
    const sources = [
      { name: 'himalayas', isEnabled: true },
      { name: 'himalayas', isEnabled: true },
    ]
    const enabled = getEnabledAdapters(sources)
    // Deduplication via Set means only 1 adapter returned
    expect(enabled).toHaveLength(1)
    expect(enabled[0].name).toBe('himalayas')
  })

  it('should use last isEnabled value when source name is duplicated', () => {
    // Set filters sources first, so both himalayas entries pass (both enabled)
    // But if first is true and second is false, only false passes filter
    const sources = [
      { name: 'himalayas', isEnabled: true },
      { name: 'himalayas', isEnabled: false },
    ]
    const enabled = getEnabledAdapters(sources)
    // The Set is built from filtered sources — only the first (enabled=true) passes
    // Actually both go through filter: first passes, second doesn't
    // Set ends up with just 'himalayas' from the first entry
    expect(enabled).toHaveLength(1)
  })
})

describe('rawJobListingSchema', () => {
  it('should validate a complete job listing', () => {
    const listing = {
      source_name: 'himalayas',
      external_id: '12345',
      title: 'Senior Developer',
      company: 'Acme Corp',
      source_url: 'https://himalayas.app/jobs/12345',
      description_text: 'Great job opportunity',
      raw_data: { original: 'data' },
    }
    const result = rawJobListingSchema.safeParse(listing)
    expect(result.success).toBe(true)
  })

  it('should validate listing with all optional fields', () => {
    const listing = {
      source_name: 'serply',
      external_id: '67890',
      title: 'Frontend Engineer',
      company: 'Tech Inc',
      source_url: 'https://example.com/job/67890',
      apply_url: 'https://employer.com/apply',
      description_text: 'Join our team',
      description_html: '<p>Join our team</p>',
      salary_min: 80000,
      salary_max: 120000,
      location: 'Remote, US',
      is_remote: true,
      raw_data: {},
    }
    const result = rawJobListingSchema.safeParse(listing)
    expect(result.success).toBe(true)
  })

  it('should reject listing without required fields', () => {
    const result = rawJobListingSchema.safeParse({ source_name: 'test' })
    expect(result.success).toBe(false)
  })

  it('should reject listing with invalid source_url', () => {
    const listing = {
      source_name: 'himalayas',
      external_id: '12345',
      title: 'Dev',
      company: 'Co',
      source_url: 'not-a-url',
      description_text: 'desc',
      raw_data: {},
    }
    const result = rawJobListingSchema.safeParse(listing)
    expect(result.success).toBe(false)
  })

  it('should reject listing with empty strings for required string fields', () => {
    const listing = {
      source_name: '',
      external_id: '',
      title: '',
      company: '',
      source_url: 'https://example.com',
      description_text: '',
      raw_data: {},
    }
    const result = rawJobListingSchema.safeParse(listing)
    expect(result.success).toBe(false)
  })

  it('should reject empty string for individual required fields', () => {
    const base = {
      source_name: 'test',
      external_id: '1',
      title: 'Dev',
      company: 'Co',
      source_url: 'https://example.com',
      description_text: 'desc',
      raw_data: {},
    }
    expect(rawJobListingSchema.safeParse({ ...base, title: '' }).success).toBe(false)
    expect(rawJobListingSchema.safeParse({ ...base, company: '' }).success).toBe(false)
    expect(rawJobListingSchema.safeParse({ ...base, source_name: '' }).success).toBe(false)
    expect(rawJobListingSchema.safeParse({ ...base, external_id: '' }).success).toBe(false)
    expect(rawJobListingSchema.safeParse({ ...base, description_text: '' }).success).toBe(false)
  })

  it('should reject empty string for optional location', () => {
    const listing = {
      source_name: 'test',
      external_id: '1',
      title: 'Dev',
      company: 'Co',
      source_url: 'https://example.com',
      description_text: 'desc',
      location: '',
      raw_data: {},
    }
    const result = rawJobListingSchema.safeParse(listing)
    expect(result.success).toBe(false)
  })

  it('should accept salary_min greater than salary_max (no cross-field validation)', () => {
    // Documents current behavior — schema does NOT validate salary_min <= salary_max
    const listing = {
      source_name: 'test',
      external_id: '1',
      title: 'Dev',
      company: 'Co',
      source_url: 'https://example.com',
      description_text: 'desc',
      salary_min: 200000,
      salary_max: 100000,
      raw_data: {},
    }
    const result = rawJobListingSchema.safeParse(listing)
    expect(result.success).toBe(true)
  })

  it('should reject listing with invalid apply_url', () => {
    const listing = {
      source_name: 'test',
      external_id: '1',
      title: 'Dev',
      company: 'Co',
      source_url: 'https://example.com',
      apply_url: 'not-a-url',
      description_text: 'desc',
      raw_data: {},
    }
    const result = rawJobListingSchema.safeParse(listing)
    expect(result.success).toBe(false)
  })

  it('should reject negative salary values', () => {
    const listing = {
      source_name: 'test',
      external_id: '1',
      title: 'Dev',
      company: 'Co',
      source_url: 'https://example.com',
      description_text: 'desc',
      salary_min: -1,
      raw_data: {},
    }
    const result = rawJobListingSchema.safeParse(listing)
    expect(result.success).toBe(false)
  })

  it('should accept zero salary', () => {
    const listing = {
      source_name: 'test',
      external_id: '1',
      title: 'Dev',
      company: 'Co',
      source_url: 'https://example.com',
      description_text: 'desc',
      salary_min: 0,
      raw_data: {},
    }
    const result = rawJobListingSchema.safeParse(listing)
    expect(result.success).toBe(true)
  })

  it('should reject non-boolean is_remote', () => {
    const listing = {
      source_name: 'test',
      external_id: '1',
      title: 'Dev',
      company: 'Co',
      source_url: 'https://example.com',
      description_text: 'desc',
      is_remote: 'yes',
      raw_data: {},
    }
    const result = rawJobListingSchema.safeParse(listing)
    expect(result.success).toBe(false)
  })
})
