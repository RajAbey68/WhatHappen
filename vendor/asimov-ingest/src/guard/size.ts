/**
 * Size guard — lifted from booklets (RAJ-456).
 *
 * The point of estimating from base64 *string length* rather than decoding is
 * that an attacker's 400 MB payload must be rejected without ever being
 * materialised in memory. Keep it O(1).
 */
import { UploadGuardError } from './errors'

/** Default cap on the DECODED payload size: 5 MB. */
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024

/**
 * Estimate decoded byte size from base64 length alone:
 * every 4 chars encode 3 bytes, minus 1 byte per trailing '=' pad.
 */
export function estimateDecodedBytes(base64: string): number {
  const len = base64.length
  if (len === 0) return 0
  let padding = 0
  if (base64.endsWith('==')) padding = 2
  else if (base64.endsWith('=')) padding = 1
  return Math.floor((len * 3) / 4) - padding
}

/**
 * Reject oversize (or empty) payloads with a typed error BEFORE any full
 * decode. Only string length is inspected — O(1) memory.
 */
export function assertPayloadSize(
  base64: string,
  maxBytes: number = MAX_RECEIPT_BYTES
): void {
  if (!base64 || base64.length === 0) {
    throw new UploadGuardError('UNSUPPORTED_TYPE', 'No image data received.')
  }
  const estimated = estimateDecodedBytes(base64)
  if (estimated > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(0)
    throw new UploadGuardError(
      'PAYLOAD_TOO_LARGE',
      `Image is too large (~${(estimated / (1024 * 1024)).toFixed(1)} MB). Maximum size is ${mb} MB.`
    )
  }
}
