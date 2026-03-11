import { delay,http, HttpResponse } from 'msw'

import himalayasResponse from '@/lib/adapters/__fixtures__/himalayas-response.json'
import jobicyResponse from '@/lib/adapters/__fixtures__/jobicy-response.json'
import serplyResponse from '@/lib/adapters/__fixtures__/serply-response.json'
import themuseResponse from '@/lib/adapters/__fixtures__/themuse-response.json'

// ─── Default Success Handlers ──────────────────────────────────────────────

export const sourceHandlers = [
  http.get('https://himalayas.app/jobs/api', () => {
    return HttpResponse.json(himalayasResponse)
  }),

  http.get('https://www.themuse.com/api/public/jobs', () => {
    return HttpResponse.json(themuseResponse)
  }),

  http.get('https://jobicy.com/api/v2/remote-jobs', () => {
    return HttpResponse.json(jobicyResponse)
  }),

  http.get('https://api.serply.io/v1/job/search/*', () => {
    return HttpResponse.json(serplyResponse, {
      headers: {
        'X-RateLimit-Remaining': '8',
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Reset': '2024-03-09T00:00:00.000Z',
      },
    })
  }),
]

// ─── Error Response Handlers (for use with server.use() in tests) ──────────

export const sourceErrorHandlers = {
  himalayas: {
    http401: http.get('https://himalayas.app/jobs/api', () => {
      return new HttpResponse(null, { status: 401, statusText: 'Unauthorized' })
    }),
    http429: http.get('https://himalayas.app/jobs/api', () => {
      return new HttpResponse(null, { status: 429, statusText: 'Too Many Requests' })
    }),
    http500: http.get('https://himalayas.app/jobs/api', () => {
      return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })
    }),
    timeout: http.get('https://himalayas.app/jobs/api', async () => {
      await delay('infinite')
      return HttpResponse.json({})
    }),
    errorResponse: http.get('https://himalayas.app/jobs/api', () => {
      return HttpResponse.json({ error: 'Something went wrong' })
    }),
    emptyJobs: http.get('https://himalayas.app/jobs/api', () => {
      return HttpResponse.json({ jobs: [], totalCount: 0 })
    }),
    missingJobsKey: http.get('https://himalayas.app/jobs/api', () => {
      return HttpResponse.json({})
    }),
  },

  themuse: {
    http401: http.get('https://www.themuse.com/api/public/jobs', () => {
      return new HttpResponse(null, { status: 401, statusText: 'Unauthorized' })
    }),
    http403: http.get('https://www.themuse.com/api/public/jobs', () => {
      return new HttpResponse(null, { status: 403, statusText: 'Forbidden' })
    }),
    http429: http.get('https://www.themuse.com/api/public/jobs', () => {
      return new HttpResponse(null, { status: 429, statusText: 'Too Many Requests' })
    }),
    http500: http.get('https://www.themuse.com/api/public/jobs', () => {
      return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })
    }),
    timeout: http.get('https://www.themuse.com/api/public/jobs', async () => {
      await delay('infinite')
      return HttpResponse.json({})
    }),
    errorResponse: http.get('https://www.themuse.com/api/public/jobs', () => {
      return HttpResponse.json({ error: 'Rate limited' })
    }),
    emptyResults: http.get('https://www.themuse.com/api/public/jobs', () => {
      return HttpResponse.json({ results: [], page: 1, page_count: 0, total: 0 })
    }),
    missingResultsKey: http.get('https://www.themuse.com/api/public/jobs', () => {
      return HttpResponse.json({})
    }),
  },

  jobicy: {
    http401: http.get('https://jobicy.com/api/v2/remote-jobs', () => {
      return new HttpResponse(null, { status: 401, statusText: 'Unauthorized' })
    }),
    http429: http.get('https://jobicy.com/api/v2/remote-jobs', () => {
      return new HttpResponse(null, { status: 429, statusText: 'Too Many Requests' })
    }),
    http500: http.get('https://jobicy.com/api/v2/remote-jobs', () => {
      return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })
    }),
    timeout: http.get('https://jobicy.com/api/v2/remote-jobs', async () => {
      await delay('infinite')
      return HttpResponse.json({})
    }),
    errorResponse: http.get('https://jobicy.com/api/v2/remote-jobs', () => {
      return HttpResponse.json({ error: 'Rate limited' })
    }),
    emptyJobs: http.get('https://jobicy.com/api/v2/remote-jobs', () => {
      return HttpResponse.json({ jobs: [], totalCount: 0 })
    }),
    missingJobsKey: http.get('https://jobicy.com/api/v2/remote-jobs', () => {
      return HttpResponse.json({})
    }),
  },

  serply: {
    http401: http.get('https://api.serply.io/v1/job/search/*', () => {
      return new HttpResponse(null, { status: 401, statusText: 'Unauthorized' })
    }),
    http403: http.get('https://api.serply.io/v1/job/search/*', () => {
      return new HttpResponse(null, { status: 403, statusText: 'Forbidden' })
    }),
    http429: http.get('https://api.serply.io/v1/job/search/*', () => {
      return new HttpResponse(null, {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Reset': '2024-03-09T01:00:00.000Z',
        },
      })
    }),
    http500: http.get('https://api.serply.io/v1/job/search/*', () => {
      return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })
    }),
    timeout: http.get('https://api.serply.io/v1/job/search/*', async () => {
      await delay('infinite')
      return HttpResponse.json({})
    }),
    emptyJobs: http.get('https://api.serply.io/v1/job/search/*', () => {
      return HttpResponse.json({ jobs: [] }, {
        headers: {
          'X-RateLimit-Remaining': '7',
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Reset': '2024-03-09T00:00:00.000Z',
        },
      })
    }),
    missingJobsKey: http.get('https://api.serply.io/v1/job/search/*', () => {
      return HttpResponse.json({ metadata: {} }, {
        headers: {
          'X-RateLimit-Remaining': '7',
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Reset': '2024-03-09T00:00:00.000Z',
        },
      })
    }),
  },
}
