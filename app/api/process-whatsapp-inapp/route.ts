import { NextRequest, NextResponse } from 'next/server'
import { PROJECT_TOKEN_HEADER, requireProjectAccess, isAuthBypassed } from '@/lib/api-auth'
import { processWhatsappCompletion } from '@/lib/processWhatsapp'
import { logError, logWarn } from '@/lib/logger'

// Allow up to 5 minutes for large file processing (requires Vercel Pro)
export const maxDuration = 300

/**
 * IN-APP browser entry point for WhatsApp upload completion.
 *
 * Route split rationale: /api/process-whatsapp-complete is the EXTERNAL webhook
 * and requires a mandatory `x-webhook-secret` (RAJ-739). A browser must never
 * hold that secret, so the in-app upload path lives here and authenticates with
 * the short-lived `x-project-token` instead.
 *
 * RAJ-747: that token is only minted by /api/project-token after a
 * server-verified passphrase challenge/response proof, so possession of a valid
 * token already implies the caller proved knowledge of the passphrase.
 *
 * Zero-knowledge: this route accepts NO raw passphrase and NO passphrase hash —
 * only the proven token (or a Supabase Bearer JWT, via requireProjectAccess).
 * It deliberately does NOT accept `x-webhook-secret` as an alternative.
 */
export async function POST(request: NextRequest) {
  // Fail fast (and unambiguously) when the browser sent no project token at all.
  if (
    !isAuthBypassed() &&
    !request.headers.has(PROJECT_TOKEN_HEADER) &&
    !request.headers.get('authorization')?.startsWith('Bearer ')
  ) {
    return NextResponse.json(
      { error: 'Unauthorized: missing or invalid project access token' },
      { status: 401 }
    )
  }

  return processWhatsappCompletion(request, {
    authorizeProject: async (projectId) => await requireProjectAccess(request, projectId),
  })
}
