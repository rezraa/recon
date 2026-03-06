import { describe, expect, it } from 'vitest'

import { ApiError, SourceError } from './errors'

describe('SourceError', () => {
  it('[P1] should create error with required fields', () => {
    const err = new SourceError({
      sourceName: 'RemoteOK',
      errorType: 'rate_limit',
      message: 'Rate limited',
    })
    expect(err.name).toBe('SourceError')
    expect(err.sourceName).toBe('RemoteOK')
    expect(err.errorType).toBe('rate_limit')
    expect(err.message).toBe('Rate limited')
    expect(err.retryAt).toBeUndefined()
  })

  it('[P1] should create error with optional retryAt', () => {
    const retryAt = new Date('2026-01-01')
    const err = new SourceError({
      sourceName: 'Serply',
      errorType: 'auth_failed',
      message: 'Invalid API key',
      retryAt,
    })
    expect(err.retryAt).toEqual(retryAt)
  })

  it('[P1] should be an instance of Error', () => {
    const err = new SourceError({
      sourceName: 'test',
      errorType: 'test',
      message: 'test',
    })
    expect(err).toBeInstanceOf(Error)
  })
})

describe('ApiError', () => {
  it('[P1] should create error with required fields', () => {
    const err = new ApiError({
      code: 404,
      message: 'Not found',
    })
    expect(err.name).toBe('ApiError')
    expect(err.code).toBe(404)
    expect(err.message).toBe('Not found')
    expect(err.details).toBeUndefined()
  })

  it('[P1] should create error with optional details', () => {
    const err = new ApiError({
      code: 422,
      message: 'Validation failed',
      details: { field: 'email', reason: 'invalid format' },
    })
    expect(err.details).toEqual({ field: 'email', reason: 'invalid format' })
  })

  it('[P1] should be an instance of Error', () => {
    const err = new ApiError({ code: 500, message: 'test' })
    expect(err).toBeInstanceOf(Error)
  })
})
