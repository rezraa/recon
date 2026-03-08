import { describe, expect, it } from 'vitest'

import { SourceError, wrapAdapterError } from './errors'

describe('wrapAdapterError', () => {
  it('should return existing SourceError unchanged', () => {
    const original = new SourceError({
      sourceName: 'remoteok',
      errorType: 'rate_limit',
      message: 'Too many requests',
    })
    const result = wrapAdapterError('remoteok', original)
    expect(result).toBe(original)
  })

  it('should classify HTTP 429 as rate_limit', () => {
    const error = Object.assign(new Error('Too Many Requests'), { status: 429 })
    const result = wrapAdapterError('serply', error)
    expect(result).toBeInstanceOf(SourceError)
    expect(result.errorType).toBe('rate_limit')
    expect(result.sourceName).toBe('serply')
    expect(result.retryAt).toBeDefined()
  })

  it('should classify HTTP 401 as auth_error', () => {
    const error = Object.assign(new Error('Unauthorized'), { status: 401 })
    const result = wrapAdapterError('serply', error)
    expect(result.errorType).toBe('auth_error')
  })

  it('should classify HTTP 403 as auth_error', () => {
    const error = Object.assign(new Error('Forbidden'), { status: 403 })
    const result = wrapAdapterError('serply', error)
    expect(result.errorType).toBe('auth_error')
  })

  it('should classify AbortError as timeout', () => {
    const error = new Error('The operation was aborted')
    error.name = 'AbortError'
    const result = wrapAdapterError('remoteok', error)
    expect(result.errorType).toBe('timeout')
  })

  it('should classify TimeoutError as timeout', () => {
    const error = new Error('Request timed out')
    error.name = 'TimeoutError'
    const result = wrapAdapterError('himalayas', error)
    expect(result.errorType).toBe('timeout')
  })

  it('should classify "timeout" in message as timeout', () => {
    const error = new Error('Connection timeout after 30s')
    const result = wrapAdapterError('jobicy', error)
    expect(result.errorType).toBe('timeout')
  })

  it('should classify "timed out" in message as timeout', () => {
    const error = new Error('Request timed out')
    const result = wrapAdapterError('jobicy', error)
    expect(result.errorType).toBe('timeout')
  })

  it('should classify SyntaxError as parse_error', () => {
    const error = new SyntaxError('Unexpected token < in JSON at position 0')
    const result = wrapAdapterError('remoteok', error)
    expect(result.errorType).toBe('parse_error')
  })

  it('should classify JSON-related errors as parse_error', () => {
    const error = new Error('Invalid JSON response')
    const result = wrapAdapterError('himalayas', error)
    expect(result.errorType).toBe('parse_error')
  })

  it('should classify "unexpected token" errors as parse_error', () => {
    const error = new Error('Unexpected token in response')
    const result = wrapAdapterError('themuse', error)
    expect(result.errorType).toBe('parse_error')
  })

  it('should classify unknown errors as unknown', () => {
    const error = new Error('Something went wrong')
    const result = wrapAdapterError('jobicy', error)
    expect(result.errorType).toBe('unknown')
    expect(result.message).toContain('[jobicy]')
    expect(result.message).toContain('Something went wrong')
  })

  it('should handle non-Error objects', () => {
    const result = wrapAdapterError('serply', { status: 429, statusText: 'Too Many Requests' })
    expect(result).toBeInstanceOf(SourceError)
    expect(result.errorType).toBe('rate_limit')
  })

  it('should handle response-like objects with statusCode', () => {
    const error = Object.assign(new Error('Unauthorized'), { statusCode: 401 })
    const result = wrapAdapterError('serply', error)
    expect(result.errorType).toBe('auth_error')
  })

  it('should include source name in error message', () => {
    const error = new Error('Network failure')
    const result = wrapAdapterError('remoteok', error)
    expect(result.message).toContain('[remoteok]')
  })

  it('should set retryAt for rate_limit errors', () => {
    const error = Object.assign(new Error('Rate limited'), { status: 429 })
    const result = wrapAdapterError('serply', error)
    expect(result.retryAt).toBeDefined()
    expect(result.retryAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('should not set retryAt for non-rate-limit errors', () => {
    const error = new Error('Connection refused')
    const result = wrapAdapterError('remoteok', error)
    expect(result.retryAt).toBeUndefined()
  })

  // ─── Classification Priority Tests ────────────────────────────────────────
  // Priority: parse_error (SyntaxError/unexpected token) > timeout > HTTP status > fuzzy parse

  it('should classify as timeout when error has both status=429 and AbortError name', () => {
    // Timeout (AbortError) has higher priority than HTTP status classification
    const error = Object.assign(new Error('Aborted'), { status: 429 })
    error.name = 'AbortError'
    const result = wrapAdapterError('serply', error)
    expect(result.errorType).toBe('timeout')
  })

  it('should classify as parse_error when SyntaxError also has status=429', () => {
    // SyntaxError (parse_error) has highest priority — beats HTTP status
    const error = Object.assign(new SyntaxError('Unexpected token'), { status: 429 })
    const result = wrapAdapterError('serply', error)
    expect(result.errorType).toBe('parse_error')
  })

  it('should classify as parse_error when SyntaxError also has "timeout" in message', () => {
    // SyntaxError wins over timeout message heuristic — parse_error is highest priority
    const error = new SyntaxError('timeout parsing JSON response')
    const result = wrapAdapterError('remoteok', error)
    expect(result.errorType).toBe('parse_error')
  })

  it('should classify as rate_limit for HTTP 429 with "json" in message (fuzzy parse)', () => {
    // HTTP status (rate_limit) beats fuzzy "json" message heuristic
    const error = Object.assign(new Error('Invalid JSON at position 0'), { status: 429 })
    const result = wrapAdapterError('serply', error)
    expect(result.errorType).toBe('rate_limit')
  })

  it('should handle plain string errors', () => {
    const result = wrapAdapterError('remoteok', 'something broke')
    expect(result).toBeInstanceOf(SourceError)
    expect(result.errorType).toBe('unknown')
    expect(result.message).toContain('[remoteok]')
  })

  it('should handle null error', () => {
    const result = wrapAdapterError('remoteok', null)
    expect(result).toBeInstanceOf(SourceError)
    expect(result.errorType).toBe('unknown')
  })

  it('should handle undefined error', () => {
    const result = wrapAdapterError('remoteok', undefined)
    expect(result).toBeInstanceOf(SourceError)
    expect(result.errorType).toBe('unknown')
  })

  it('should use statusText from response-like object as message', () => {
    const result = wrapAdapterError('serply', { status: 503, statusText: 'Service Unavailable' })
    expect(result.message).toContain('Service Unavailable')
  })

  it('should fallback to "HTTP {status}" when response-like object has no statusText', () => {
    const result = wrapAdapterError('serply', { status: 500 })
    expect(result.message).toContain('HTTP 500')
  })

  it('should preserve Error message for Error objects with status property', () => {
    // Error objects are handled by the Error block only — response-like block
    // only fires for non-Error objects, so the original Error message is preserved
    const error = Object.assign(new Error('Custom auth message'), { status: 401, statusText: 'Unauthorized' })
    const result = wrapAdapterError('serply', error)
    expect(result.errorType).toBe('auth_error')
    expect(result.message).toContain('Custom auth message')
  })
})
