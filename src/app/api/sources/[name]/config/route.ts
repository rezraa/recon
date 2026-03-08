import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getSourceByName } from '@/lib/adapters/registry'
import { getConfig } from '@/lib/config'
import { upsertSourceConfig } from '@/lib/db/queries/sources'
import { encrypt } from '@/lib/encryption'

const configSchema = z.object({
  apiKey: z.string().min(1),
})

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params
    const source = getSourceByName(name)

    if (!source) {
      return NextResponse.json(
        { error: { code: 404, message: 'Source not found' } },
        { status: 404 },
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: { code: 400, message: 'Invalid JSON body' } },
        { status: 400 },
      )
    }
    const result = configSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: { code: 400, message: 'apiKey is required' } },
        { status: 400 },
      )
    }

    const { ENCRYPTION_KEY } = getConfig()
    const encryptedKey = encrypt(result.data.apiKey, ENCRYPTION_KEY)

    await upsertSourceConfig(name, { apiKey: encryptedKey })

    return NextResponse.json({ data: { name, isConfigured: true } })
  } catch {
    return NextResponse.json(
      { error: { code: 500, message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
