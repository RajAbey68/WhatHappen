/**
 * Guard error type. Lifted verbatim from booklets `src/lib/upload-guard.ts`
 * (RAJ-456) so that repo's existing suite passes against this package with no
 * edits. Do not change the code strings — callers branch on them.
 */
export type UploadGuardCode = 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'RATE_LIMITED'

export class UploadGuardError extends Error {
  readonly code: UploadGuardCode

  constructor(code: UploadGuardCode, message: string) {
    super(message)
    this.name = 'UploadGuardError'
    this.code = code
  }
}
