import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries/sources', () => ({
  upsertSourceConfig: vi.fn(),
}))

vi.mock('@/lib/config', () => ({
  getConfig: vi.fn(() => ({
    DATABASE_URL: 'postgresql://test',
    REDIS_URL: 'redis://test',
    ENCRYPTION_KEY: 'a'.repeat(64),
  })),
}))

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn(() => 'iv:tag:ciphertext'),
}))

import { upsertSourceConfig } from '@/lib/db/queries/sources'
import { encrypt } from '@/lib/encryption'

import { PUT } from './route'

const mockUpsert = vi.mocked(upsertSourceConfig)
const mockEncrypt = vi.mocked(encrypt)

function createRequest(name: string, body: unknown): [Request, { params: Promise<{ name: string }> }] {
  const req = new Request(`http://localhost/api/sources/${name}/config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return [req, { params: Promise.resolve({ name }) }]
}

describe('PUT /api/sources/[name]/config', () => {
  it('should encrypt and store API key', async () => {
    mockUpsert.mockResolvedValue({ id: '1', name: 'serply' } as never)

    const [req, ctx] = createRequest('serply', { apiKey: 'my-secret-key' })
    const res = await PUT(req, ctx)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ data: { name: 'serply', isConfigured: true } })
    expect(mockEncrypt).toHaveBeenCalledWith('my-secret-key', 'a'.repeat(64))
    expect(mockUpsert).toHaveBeenCalledWith('serply', { apiKey: 'iv:tag:ciphertext' })
  })

  it('should return 404 for unknown source', async () => {
    const [req, ctx] = createRequest('nonexistent', { apiKey: 'key' })
    const res = await PUT(req, ctx)
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error.message).toContain('Source not found')
  })

  it('should return 400 for missing apiKey', async () => {
    const [req, ctx] = createRequest('serply', {})
    const res = await PUT(req, ctx)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.message).toContain('apiKey is required')
  })

  it('should not return the encrypted key in response', async () => {
    mockUpsert.mockResolvedValue({ id: '1', name: 'serply' } as never)

    const [req, ctx] = createRequest('serply', { apiKey: 'secret' })
    const res = await PUT(req, ctx)
    const json = await res.json()

    expect(json.data).not.toHaveProperty('apiKey')
    expect(json.data).not.toHaveProperty('config')
  })
})
