import type { SourceConfig } from './types'

function deepFreeze<T extends object>(obj: T): Readonly<T> {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') deepFreeze(value as object)
  }
  return Object.freeze(obj)
}

export const SOURCE_CONFIGS: Readonly<Record<string, SourceConfig>> = deepFreeze({
  himalayas: {
    name: 'himalayas',
    displayName: 'Himalayas',
    type: 'open',
    description: 'Remote jobs across industries',
    regions: ['*'],
    attribution: {
      requiresFollowLink: false,
      attributionUrl: 'https://himalayas.app',
      descriptionPolicy: 'no_modify',
    },
    rateLimits: {
      requestsPerHour: null,
      requestsPerDay: 48,
      requestsPerMonth: null,
      cooldownMs: 60_000,
    },
  },

  themuse: {
    name: 'themuse',
    displayName: 'The Muse',
    type: 'open',
    description: 'Curated US job listings',
    regions: ['US'],
    attribution: {
      requiresFollowLink: true,
      attributionUrl: 'https://www.themuse.com',
      descriptionPolicy: 'no_modify',
    },
    rateLimits: {
      requestsPerHour: 500,
      requestsPerDay: null,
      requestsPerMonth: null,
      cooldownMs: 5_000,
    },
  },

  jobicy: {
    name: 'jobicy',
    displayName: 'Jobicy',
    type: 'open',
    description: 'Remote jobs worldwide',
    regions: ['*'],
    attribution: {
      requiresFollowLink: true,
      attributionUrl: 'https://jobicy.com',
      descriptionPolicy: 'no_modify',
    },
    rateLimits: {
      requestsPerHour: 1,
      requestsPerDay: 6,
      requestsPerMonth: null,
      cooldownMs: 3_600_000,
    },
  },

  remoteok: {
    name: 'remoteok',
    displayName: 'Remote OK',
    type: 'open',
    description: 'Remote-first jobs worldwide',
    regions: ['*'],
    attribution: {
      requiresFollowLink: true,
      attributionUrl: 'https://remoteok.com',
      descriptionPolicy: 'no_modify',
    },
    rateLimits: {
      requestsPerHour: 4,
      requestsPerDay: 48,
      requestsPerMonth: null,
      cooldownMs: 60_000,
    },
  },

  rss: {
    name: 'rss',
    displayName: 'RSS Feeds',
    type: 'open',
    description: 'LinkedIn, Indeed, and custom job feeds',
    regions: ['*'],
    attribution: {
      requiresFollowLink: true,
      attributionUrl: 'https://en.wikipedia.org/wiki/RSS',
      descriptionPolicy: 'no_modify',
    },
    rateLimits: {
      requestsPerHour: null,
      requestsPerDay: null,
      requestsPerMonth: null,
      cooldownMs: 60_000,
    },
  },

  serply: {
    name: 'serply',
    displayName: 'Serply',
    type: 'key_required',
    description: 'Google for Jobs search',
    signupUrl: 'https://serply.io',
    regions: ['*'],
    attribution: {
      requiresFollowLink: false,
      attributionUrl: 'https://serply.io',
      descriptionPolicy: 'no_modify',
    },
    rateLimits: {
      requestsPerHour: null,
      requestsPerDay: 10,
      requestsPerMonth: 300,
      cooldownMs: 30_000,
    },
  },
})
