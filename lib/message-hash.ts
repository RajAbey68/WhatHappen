import { createHash } from 'crypto'

/**
 * Compute a deterministic SHA-256 hash for a message to enable deduplication.
 *
 * The hash is based on: session_id + timestamp + sender + recipient (if present)
 * This ensures the same message won't be ingested twice within a session.
 */
export function computeMessageHash(
  sessionId: string,
  timestamp: string,
  sender: string,
  messageLength?: number
): string {
  // Include message length to prevent collision when multiple messages
  // arrive in same second from same sender. Length is cheap to compute
  // and adds entropy without exposing message content.
  const content = [
    sessionId,
    timestamp,
    sender,
    String(messageLength || 0)
  ].join('\x00')
  return createHash('sha256').update(content).digest('hex')
}
