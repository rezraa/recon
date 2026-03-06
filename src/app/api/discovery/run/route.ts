import { NextResponse } from 'next/server'

export async function POST() {
  // Stub — actual pipeline triggering is Story 2.9
  return NextResponse.json(
    { data: { runId: 'stub', status: 'pending' } },
    { status: 202 },
  )
}
