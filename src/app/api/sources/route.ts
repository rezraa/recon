import { NextResponse } from 'next/server'

import { SOURCE_CONFIGS } from '@/lib/adapters/constants'
import { findAllSources } from '@/lib/db/queries/sources'

export async function GET() {
  try {
    const dbSources = await findAllSources()
    const dbSourceMap = new Map(dbSources.map((s) => [s.name, s]))

    const sources = Object.values(SOURCE_CONFIGS).map((config) => {
      const dbSource = dbSourceMap.get(config.name)
      const hasConfig = dbSource?.config != null
      const configObj = dbSource?.config as Record<string, unknown> | null

      return {
        name: config.name,
        displayName: config.displayName,
        type: config.type,
        description: config.description,
        ...(config.signupUrl && { signupUrl: config.signupUrl }),
        isConfigured: config.type === 'open' || (hasConfig && !!configObj?.apiKey),
        isActive: dbSource?.isEnabled ?? config.type === 'open',
      }
    })

    return NextResponse.json({ data: sources })
  } catch {
    return NextResponse.json(
      { error: { code: 500, message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
