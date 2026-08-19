export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import { requireProjectAccess } from '@/lib/api-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const projectId = request.nextUrl.searchParams.get('projectId')

  if (!projectId) {
    return NextResponse.json(
      { error: 'Missing required projectId parameter' },
      { status: 400 }
    )
  }

  const authError = await requireProjectAccess(request, projectId)
  if (authError) return authError

  const supabase = getServiceClient()
  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, processing_status, processing_error, total_messages, date_range_start, date_range_end')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json({ session })
}
