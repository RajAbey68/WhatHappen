/**
 * Issue a short-lived, HMAC-signed project access token (RAJ-747).
 *
 * The client verifies the passphrase locally (zero-knowledge decryption) and then
 * exchanges *proof of project selection* for a token, so the raw passphrase does
 * not have to be replayed as an authorization credential on every API call.
 *
 * The token is returned in the body (for the `x-project-token` header) and also
 * set as an httpOnly cookie so it is not readable by injected script (RAJ-746).
 */
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import {
  isValidProjectId,
  issueProjectToken,
  PROJECT_TOKEN_TTL_MS,
} from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json()

    if (!isValidProjectId(projectId)) {
      return NextResponse.json({ error: 'A valid project ID is required' }, { status: 400 })
    }

    // The project must exist before we mint a token for it.
    const supabase = getServiceClient()
    const { data: project, error } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle()

    if (error) throw error
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { token, expiresAt } = issueProjectToken(projectId)

    const response = NextResponse.json(
      { token, expiresAt },
      { headers: { 'Content-Type': 'application/json' } }
    )

    // httpOnly so XSS cannot read it; short-lived so theft has a bounded window.
    response.cookies.set(`project-token-${projectId}`, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: Math.floor(PROJECT_TOKEN_TTL_MS / 1000),
    })

    return response
  } catch (err) {
    console.error('Error issuing project token:', err)
    return NextResponse.json({ error: 'Failed to issue project token' }, { status: 500 })
  }
}
