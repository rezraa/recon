import { http, HttpResponse } from 'msw'

import himalayasResponse from '@/lib/adapters/__fixtures__/himalayas-response.json'
import jobicyResponse from '@/lib/adapters/__fixtures__/jobicy-response.json'
import remoteokResponse from '@/lib/adapters/__fixtures__/remoteok-response.json'
import serplyResponse from '@/lib/adapters/__fixtures__/serply-response.json'
import themuseResponse from '@/lib/adapters/__fixtures__/themuse-response.json'

export const sourceHandlers = [
  http.get('https://remoteok.com/api', () => {
    return HttpResponse.json(remoteokResponse)
  }),

  http.get('https://himalayas.app/jobs/api', () => {
    return HttpResponse.json(himalayasResponse)
  }),

  http.get('https://www.themuse.com/api/public/jobs', () => {
    return HttpResponse.json(themuseResponse)
  }),

  http.get('https://jobicy.com/api/v2/remote-jobs', () => {
    return HttpResponse.json(jobicyResponse)
  }),

  http.get('https://api.serply.io/v1/job/search', () => {
    return HttpResponse.json(serplyResponse, {
      headers: {
        'X-RateLimit-Remaining': '8',
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Reset': '2024-03-09T00:00:00.000Z',
      },
    })
  }),
]
