import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries/preferences', () => ({
  getPreferences: vi.fn(),
  upsertPreferences: vi.fn(),
}))

import { getPreferences, upsertPreferences } from '@/lib/db/queries/preferences'
import { createPreferences } from '@/test-utils/factories/preferences.factory'

import { GET, PUT } from './route'

const mockGetPreferences = vi.mocked(getPreferences)
const mockUpsertPreferences = vi.mocked(upsertPreferences)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/preferences', () => {
  it('[P0] should return 200 with preferences data when preferences exist', async () => {
    const prefs = createPreferences({ id: 'pref-1' })
    mockGetPreferences.mockResolvedValue(prefs)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.id).toBe('pref-1')
  })

  it('[P1] should return 404 when no preferences exist', async () => {
    mockGetPreferences.mockResolvedValue(null)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe(404)
    expect(body.error.message).toBe('No preferences found')
  })

  it('[P1] should return 500 on database error', async () => {
    mockGetPreferences.mockRejectedValue(new Error('DB error'))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error.code).toBe(500)
  })
})

describe('PUT /api/preferences', () => {
  it('[P0] should save and return preferences with valid data', async () => {
    const saved = createPreferences({ id: 'pref-1' })
    mockUpsertPreferences.mockResolvedValue(saved)

    const request = new Request('http://localhost/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_titles: ['Software Engineer'],
        salary_min: 80000,
        salary_max: 150000,
        locations: ['Remote'],
        remote_preference: 'remote_only',
      }),
    })

    const response = await PUT(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.id).toBe('pref-1')
    expect(mockUpsertPreferences).toHaveBeenCalledWith({
      targetTitles: ['Software Engineer'],
      salaryMin: 80000,
      salaryMax: 150000,
      locations: ['Remote'],
      remotePreference: 'remote_only',
    })
  })

  it('[P0] should return 400 when target_titles is empty', async () => {
    const request = new Request('http://localhost/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_titles: [] }),
    })

    const response = await PUT(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe(400)
    expect(body.error.message).toBe('Validation failed')
    expect(body.error.details).toBeDefined()
    expect(mockUpsertPreferences).not.toHaveBeenCalled()
  })

  it('[P1] should return 400 when salary_min > salary_max', async () => {
    const request = new Request('http://localhost/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_titles: ['Engineer'],
        salary_min: 200000,
        salary_max: 100000,
      }),
    })

    const response = await PUT(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.details.salary_min).toBe('Minimum salary must be less than maximum')
    expect(mockUpsertPreferences).not.toHaveBeenCalled()
  })

  it('[P1] should accept request with only required fields', async () => {
    const saved = createPreferences()
    mockUpsertPreferences.mockResolvedValue(saved)

    const request = new Request('http://localhost/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_titles: ['Developer'] }),
    })

    const response = await PUT(request)

    expect(response.status).toBe(200)
    expect(mockUpsertPreferences).toHaveBeenCalledWith({
      targetTitles: ['Developer'],
      salaryMin: null,
      salaryMax: null,
      locations: [],
      remotePreference: 'no_preference',
    })
  })

  it('[P1] should return 500 on database error', async () => {
    mockUpsertPreferences.mockRejectedValue(new Error('DB error'))

    const request = new Request('http://localhost/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_titles: ['Engineer'] }),
    })

    const response = await PUT(request)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error.code).toBe(500)
  })
})
