import { NextResponse } from 'next/server'
import { z } from 'zod'

const validateSchema = z.object({
  sourceName: z.string().min(1),
  apiKey: z.string().min(1),
})

class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: { code: 400, message: 'Invalid JSON body' } },
        { status: 400 },
      )
    }

    const result = validateSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 400, message: 'sourceName and apiKey are required' } },
        { status: 400 },
      )
    }

    const { sourceName, apiKey } = result.data

    if (sourceName !== 'serply') {
      return NextResponse.json(
        { error: { code: 400, message: 'Validation not supported for this source' } },
        { status: 400 },
      )
    }

    const isValid = await validateSerplyKey(apiKey)

    if (isValid) {
      return NextResponse.json({ data: { valid: true } })
    }

    return NextResponse.json(
      { error: { code: 400, message: 'Invalid API key \u2014 please check and try again' } },
      { status: 400 },
    )
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: { code: 502, message: error.message } },
        { status: 502 },
      )
    }
    return NextResponse.json(
      { error: { code: 500, message: 'Internal server error' } },
      { status: 500 },
    )
  }
}

async function validateSerplyKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.serply.io/v1/job/search/q=test', {
      headers: { 'X-Api-Key': apiKey },
      signal: AbortSignal.timeout(10_000),
    })

    if (response.ok) return true
    if (response.status === 401 || response.status === 403) return false

    // 5xx or other server errors — treat as network issue, not invalid key
    throw new ValidationError('Source API is temporarily unavailable \u2014 please try again later')
  } catch (error) {
    if (error instanceof ValidationError) throw error
    // Timeout or network error
    throw new ValidationError('Unable to reach Serply API \u2014 please try again later')
  }
}
