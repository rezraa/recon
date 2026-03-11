import { faker } from '@faker-js/faker'

import type { AdapterConfig, RawJobListing, SourceAdapter } from '@/lib/adapters/types'

export interface MockAdapterOptions {
  name?: string
  displayName?: string
  type?: 'open' | 'key_required'
  listings?: RawJobListing[]
  shouldThrow?: Error
  validateKeyResult?: boolean
  rateLimitStatus?: { remaining: number; resetsAt: Date } | null
}

export function createMockAdapter(options: MockAdapterOptions = {}): SourceAdapter {
  const name = options.name ?? faker.lorem.slug()
  const listings = options.listings ?? []

  const adapter: SourceAdapter = {
    name,
    displayName: options.displayName ?? faker.company.name(),
    type: options.type ?? 'open',

    async fetchListings(_config: AdapterConfig): Promise<RawJobListing[]> {
      if (options.shouldThrow) {
        throw options.shouldThrow
      }
      return listings
    },
  }

  if (options.validateKeyResult !== undefined) {
    adapter.validateKey = async (_key: string): Promise<boolean> => {
      return options.validateKeyResult!
    }
  }

  if (options.rateLimitStatus !== undefined) {
    adapter.getRateLimitStatus = (): { remaining: number; resetsAt: Date } | null => {
      return options.rateLimitStatus!
    }
  }

  return adapter
}

export function createRawJobListing(overrides?: Partial<RawJobListing>): RawJobListing {
  return {
    source_name: faker.helpers.arrayElement(['himalayas', 'themuse', 'jobicy', 'serply']),
    external_id: faker.string.nanoid(),
    title: faker.person.jobTitle(),
    company: faker.company.name(),
    source_url: faker.internet.url(),
    description_text: faker.lorem.paragraphs(2),
    description_html: `<p>${faker.lorem.paragraphs(2)}</p>`,
    raw_data: { original: true, id: faker.string.nanoid() },
    ...overrides,
  }
}
