import { describe, expect, it } from 'vitest'

import { POST } from './route'

describe('POST /api/discovery/run', () => {
  it('should return 202 with stub response', async () => {
    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body.data).toEqual({
      runId: 'stub',
      status: 'pending',
    })
  })
})
