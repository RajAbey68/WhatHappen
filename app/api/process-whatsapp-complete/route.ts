import { NextRequest } from 'next/server'
import {
  requireProjectAccess,
  verifyWebhookSecret,
  PROJECT_TOKEN_HEADER,
} from '@/lib/api-auth'
import { processWhatsappCompletion } from '@/lib/processWhatsapp'

// Allow up to 5 minutes for large file processing (requires Vercel Pro)
export const maxDuration = 300

/**
 * EXTERNAL webhook entry point.
 *
 * RAJ-739 (rework): the shared webhook secret is MANDATORY on EVERY request.
 * Previously this route only verified the secret when the header happened to be
 * present, so an attacker could simply omit the header and fall through to the
 * in-app token path. Fails closed when WHATSAPP_WEBHOOK_SECRET is unset.
 *
 * IN-APP browser uploads must NOT use this route (a browser cannot hold the
 * webhook secret) — they use /api/process-whatsapp-inapp, which authenticates
 * with a passphrase-proven x-project-token instead. Both routes share the same
 * processing implementation in lib/processWhatsapp.ts.
 */
export async function POST(request: NextRequest) {
  const webhookError = verifyWebhookSecret(request)
  if (webhookError) return webhookError

  return processWhatsappCompletion(request, {
    // Defence in depth: if a caller additionally supplies a project token it
    // must be valid for this project. The webhook secret remains mandatory
    // regardless of whether this header is present.
    authorizeProject: async (projectId) =>
      request.headers.has(PROJECT_TOKEN_HEADER)
        ? await requireProjectAccess(request, projectId)
        : null,
  })
}
