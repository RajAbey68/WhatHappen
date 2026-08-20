import { createHash } from 'crypto'

/**
 * Compute a deterministic SHA-256 hash for a message to enable deduplication.
 *
 * The hash is based on: session_id + timestamp + sender + message_snippet
 * This ensures the same message won't be ingested twice within a session.
 */
export function computeMessageHash(
  sessionId: string,
  timestamp: string,
  sender: string,
  messageContent?: string
): string {
  const content = [sessionId, timestamp, sender, messageContent || ''].join('\x00')
  return createHash('sha256').update(content).digest('hex')
}
