export type SourceErrorType = 'rate_limit' | 'auth_error' | 'timeout' | 'parse_error' | 'unknown'

export class SourceError extends Error {
  public readonly sourceName: string
  public readonly errorType: SourceErrorType
  public readonly retryAt?: Date

  constructor(params: {
    sourceName: string
    errorType: SourceErrorType
    message: string
    retryAt?: Date
  }) {
    super(params.message)
    this.name = 'SourceError'
    this.sourceName = params.sourceName
    this.errorType = params.errorType
    this.retryAt = params.retryAt
  }
}

export function wrapAdapterError(sourceName: string, error: unknown): SourceError {
  if (error instanceof SourceError) {
    return error
  }

  let errorType: SourceErrorType = 'unknown'
  let message = 'Unknown error'
  let retryAt: Date | undefined

  if (error instanceof Error) {
    message = error.message

    // Parse error detection (highest specificity — SyntaxError is unambiguous)
    if (
      error instanceof SyntaxError
      || message.toLowerCase().includes('unexpected token')
    ) {
      errorType = 'parse_error'
    }

    // Timeout detection (AbortError/TimeoutError are unambiguous signal names)
    if (errorType === 'unknown' && (
      error.name === 'AbortError'
      || error.name === 'TimeoutError'
      || message.toLowerCase().includes('timeout')
      || message.toLowerCase().includes('timed out')
    )) {
      errorType = 'timeout'
    }

    // HTTP status code detection (from Error objects with status/statusCode)
    if (errorType === 'unknown' && ('status' in error || 'statusCode' in error)) {
      const status = (error as { status?: number; statusCode?: number }).status
        ?? (error as { statusCode?: number }).statusCode
      if (status === 429) {
        errorType = 'rate_limit'
        retryAt = new Date(Date.now() + 60_000)
      } else if (status === 401 || status === 403) {
        errorType = 'auth_error'
      }
    }

    // Fuzzy message-based parse detection (lower confidence than SyntaxError)
    if (errorType === 'unknown' && (
      message.toLowerCase().includes('json')
      || message.toLowerCase().includes('parse')
    )) {
      errorType = 'parse_error'
    }
  } else if (error && typeof error === 'object' && 'status' in error) {
    // Response-like object detection (e.g., from fetch Response — non-Error objects only)
    const status = (error as { status: number }).status
    if (status === 429) {
      errorType = 'rate_limit'
      retryAt = new Date(Date.now() + 60_000)
    } else if (status === 401 || status === 403) {
      errorType = 'auth_error'
    }
    message = (error as { statusText?: string }).statusText ?? `HTTP ${status}`
  }

  return new SourceError({
    sourceName,
    errorType,
    message: `[${sourceName}] ${message}`,
    retryAt,
  })
}

export class ApiError extends Error {
  public readonly code: number
  public readonly details?: Record<string, unknown>

  constructor(params: {
    code: number
    message: string
    details?: Record<string, unknown>
  }) {
    super(params.message)
    this.name = 'ApiError'
    this.code = params.code
    this.details = params.details
  }
}
