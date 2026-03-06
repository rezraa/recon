import { NextResponse } from 'next/server'

import { getResume } from '@/lib/db/queries/resume'

export async function GET() {
  try {
    const resume = await getResume()

    if (!resume) {
      return NextResponse.json(
        { error: { code: 404, message: 'No resume found' } },
        { status: 404 },
      )
    }

    return NextResponse.json({
      data: {
        id: resume.id,
        fileName: resume.fileName,
        uploadedAt: resume.uploadedAt,
      },
    })
  } catch {
    return NextResponse.json(
      { error: { code: 500, message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
