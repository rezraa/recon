export class SourceError extends Error {
  public readonly sourceName: string
  public readonly errorType: string
  public readonly retryAt?: Date

  constructor(params: {
    sourceName: string
    errorType: string
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
