import { describe, expect, it } from 'vitest'

import { POST } from './route'

describe('POST /api/discovery/run', () => {
  it('[P2] should return 202 with stub response (placeholder until discovery is implemented)', async () => {
    // This endpoint currently returns a hardcoded stub.
    // Real tests should be added when discovery pipeline is implemented (story 2-3+).
    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body.data).toHaveProperty('runId')
    expect(body.data).toHaveProperty('status')
  })
})
