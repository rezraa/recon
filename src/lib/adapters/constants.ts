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
    mode: 'feed',
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
    mode: 'feed',
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
    mode: 'feed',
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
    mode: 'feed',
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
    mode: 'feed',
    description: 'We Work Remotely, Jobicy, and custom job feeds',
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

  ashby: {
    name: 'ashby',
    displayName: 'Ashby',
    type: 'open',
    mode: 'search', // TODO: flip to 'feed' when going live
    description: 'Direct from company career pages via Ashby ATS',
    regions: ['US'],
    attribution: {
      requiresFollowLink: true,
      attributionUrl: 'https://www.ashbyhq.com',
      descriptionPolicy: 'no_modify',
    },
    rateLimits: {
      requestsPerHour: 900, // 15 req/min documented limit
      requestsPerDay: null,
      requestsPerMonth: null,
      cooldownMs: 4_000, // ~15 req/min = 1 every 4s (conservative)
    },
  },

  lever: {
    name: 'lever',
    displayName: 'Lever',
    type: 'open',
    mode: 'search', // TODO: flip to 'feed' when going live
    description: 'Direct from company career pages via Lever ATS',
    regions: ['US'],
    attribution: {
      requiresFollowLink: true,
      attributionUrl: 'https://www.lever.co',
      descriptionPolicy: 'no_modify',
    },
    rateLimits: {
      requestsPerHour: null, // 10 req/s standard, POST limited to 2/s
      requestsPerDay: null,
      requestsPerMonth: null,
      cooldownMs: 500,
    },
  },

  greenhouse: {
    name: 'greenhouse',
    displayName: 'Greenhouse',
    type: 'open',
    mode: 'search', // TODO: flip to 'feed' when going live
    description: 'Direct from company career pages via Greenhouse ATS',
    regions: ['US'],
    attribution: {
      requiresFollowLink: true,
      attributionUrl: 'https://www.greenhouse.io',
      descriptionPolicy: 'no_modify',
    },
    rateLimits: {
      requestsPerHour: null, // Public board API: no hard rate limits, heavily cached
      requestsPerDay: null,
      requestsPerMonth: null,
      cooldownMs: 500,
    },
  },

  smartrecruiters: {
    name: 'smartrecruiters',
    displayName: 'SmartRecruiters',
    type: 'open',
    mode: 'search', // TODO: flip to 'feed' when going live
    description: 'Direct from company career pages via SmartRecruiters ATS',
    regions: ['*'],
    attribution: {
      requiresFollowLink: true,
      attributionUrl: 'https://www.smartrecruiters.com',
      descriptionPolicy: 'no_modify',
    },
    rateLimits: {
      requestsPerHour: null, // 10 req/s, 8 concurrent max
      requestsPerDay: null,
      requestsPerMonth: null,
      cooldownMs: 500,
    },
  },

  serply: {
    name: 'serply',
    displayName: 'Serply',
    type: 'key_required',
    mode: 'search',
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
