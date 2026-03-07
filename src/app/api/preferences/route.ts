import { NextResponse } from 'next/server'

import { getPreferences, upsertPreferences } from '@/lib/db/queries/preferences'
import { preferencesSchema } from '@/lib/validations/preferences'

export async function GET() {
  try {
    const preferences = await getPreferences()

    if (!preferences) {
      return NextResponse.json(
        { error: { code: 404, message: 'No preferences found' } },
        { status: 404 },
      )
    }

    return NextResponse.json({ data: preferences })
  } catch {
    return NextResponse.json(
      { error: { code: 500, message: 'Internal server error' } },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const result = preferencesSchema.safeParse(body)

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const path = issue.path.join('.')
        fieldErrors[path] = issue.message
      }

      return NextResponse.json(
        {
          error: {
            code: 400,
            message: 'Validation failed',
            details: fieldErrors,
          },
        },
        { status: 400 },
      )
    }

    const data = result.data
    const preferences = await upsertPreferences({
      targetTitles: data.target_titles,
      salaryMin: data.salary_min ?? null,
      salaryMax: data.salary_max ?? null,
      locations: data.locations,
      remotePreference: data.remote_preference,
    })

    return NextResponse.json({ data: preferences })
  } catch {
    return NextResponse.json(
      { error: { code: 500, message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
