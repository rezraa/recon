import { describe, expect, it } from 'vitest'

describe('Serply Key Validation Integration', () => {
  it.skipIf(!process.env.SERPLY_API_KEY)('should validate real API key', async () => {
    const apiKey = process.env.SERPLY_API_KEY!

    const response = await fetch('https://api.serply.io/v1/job/search/q=test', {
      headers: { 'X-Api-Key': apiKey },
    })

    expect(response.ok).toBe(true)
  })

  it('should reject invalid API key', async () => {
    const response = await fetch('https://api.serply.io/v1/job/search/q=test', {
      headers: { 'X-Api-Key': 'invalid-key-12345' },
    })

    expect([401, 403]).toContain(response.status)
  })
})
