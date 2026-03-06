import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getResume, updateResumeParsedData, upsertResume } from '@/lib/db/queries/resume'
import { parseResume } from '@/lib/pipeline/resumeParser'

const parsedDataSchema = z.object({
  skills: z.array(z.string()),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      years: z.number().nullable(),
    }),
  ),
  jobTitles: z.array(z.string()),
})

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

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

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      return await handleFileUpload(request)
    } else {
      return await handleDataUpdate(request)
    }
  } catch {
    return NextResponse.json(
      { error: { code: 500, message: 'Internal server error' } },
      { status: 500 },
    )
  }
}

async function handleFileUpload(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json(
      { error: { code: 400, message: 'No file provided' } },
      { status: 400 },
    )
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json(
      { error: { code: 400, message: 'Please upload a PDF file' } },
      { status: 400 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  if (buffer.length > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: { code: 400, message: 'File size exceeds 5MB limit' } },
      { status: 400 },
    )
  }

  const parsedData = await parseResume(buffer)

  const resume = await upsertResume({
    fileName: file.name,
    parsedData,
    skills: parsedData.skills,
    experience: parsedData.experience,
  })

  return NextResponse.json({
    data: {
      id: resume.id,
      fileName: resume.fileName,
      parsedData: resume.parsedData,
    },
  })
}

async function handleDataUpdate(request: Request) {
  const body = await request.json()
  const result = parsedDataSchema.safeParse(body.parsedData)

  if (!result.success) {
    return NextResponse.json(
      { error: { code: 400, message: 'Invalid parsedData format' } },
      { status: 400 },
    )
  }

  const parsedData = result.data

  const resume = await updateResumeParsedData({
    parsedData,
    skills: parsedData.skills,
    experience: parsedData.experience,
  })

  if (!resume) {
    return NextResponse.json(
      { error: { code: 404, message: 'No resume found to update' } },
      { status: 404 },
    )
  }

  return NextResponse.json({
    data: {
      id: resume.id,
      parsedData: resume.parsedData,
    },
  })
}
