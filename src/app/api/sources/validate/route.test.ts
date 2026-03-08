import { describe, expect, it, vi } from 'vitest'

import { POST } from './route'

function createRequest(body: unknown): Request {
  return new Request('http://localhost/api/sources/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/sources/validate', () => {
  it('should return valid: true for a valid Serply key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    )

    const res = await POST(createRequest({ sourceName: 'serply', apiKey: 'valid-key' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ data: { valid: true } })
  })

  it('should return error for invalid Serply key (401)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    )

    const res = await POST(createRequest({ sourceName: 'serply', apiKey: 'bad-key' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.message).toContain('Invalid API key')
  })

  it('should return error for invalid Serply key (403)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 })),
    )

    const res = await POST(createRequest({ sourceName: 'serply', apiKey: 'bad-key' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.message).toContain('Invalid API key')
  })

  it('should return 502 for Serply server error (5xx)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 })),
    )

    const res = await POST(createRequest({ sourceName: 'serply', apiKey: 'any-key' }))
    const json = await res.json()

    expect(res.status).toBe(502)
    expect(json.error.message).toContain('unavailable')
  })

  it('should return 502 for network timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'AbortError')),
    )

    const res = await POST(createRequest({ sourceName: 'serply', apiKey: 'any-key' }))
    const json = await res.json()

    expect(res.status).toBe(502)
    expect(json.error.message).toContain('Unable to reach')
  })

  it('should return 400 for missing sourceName', async () => {
    const res = await POST(createRequest({ apiKey: 'test' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.message).toContain('required')
  })

  it('should return 400 for missing apiKey', async () => {
    const res = await POST(createRequest({ sourceName: 'serply' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.message).toContain('required')
  })

  it('should return 400 for unsupported source', async () => {
    const res = await POST(createRequest({ sourceName: 'remoteok', apiKey: 'key' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.message).toContain('not supported')
  })
})
