/**
 * The ingest pipeline shared by WhatHappen and booklets.
 *
 * WHY STORAGE IS OPTIONAL RATHER THAN `retention: { days: 0 }`
 * -----------------------------------------------------------
 * Booklets' defining safety property is that receipts are OCR'd in memory and
 * never written anywhere. An earlier design expressed that as a retention
 * window of zero days. Third-party review rejected it, correctly: that turns a
 * hard security property into an integer, and a one-character diff
 * (`days: 0` → `days: 1`) would silently begin persisting other people's
 * financial documents with no other code change and no failing test.
 *
 * So `storage` is an optional capability. Omit it and the pipeline cannot
 * persist, because there is nothing to persist to. Ask such a pipeline to
 * persist and it throws loudly rather than skipping quietly — in an evidence
 * system, "I thought it was saved" is worse than an error.
 */
import { UploadGuardError } from './guard/errors'
import { assertPayloadSize } from './guard/size'
import { assertAllowedType, detectType, type DetectedType } from './guard/magic'
import { RateLimiter, type RateLimiterOptions } from './guard/rate-limit'
import type { StorageAdapter, StoredObject } from './storage/adapter'

export interface ExtractedPayload {
  tenantId: string
  filename: string
  /** Real type as determined by magic bytes, never by filename. */
  type: DetectedType
  /** Decoded bytes. Present for in-memory consumers such as booklets. */
  data: Buffer
  /** Non-null only when the pipeline persisted the object. */
  stored: StoredObject | null
}

export interface IngestRequest {
  /** Project id (WhatHappen) or organisation id (booklets). Scopes rate limits and paths. */
  tenantId: string
  filename: string
  /** Payload as base64 — matches how both apps already receive uploads. */
  base64: string
  /**
   * Persist the object via the configured storage adapter.
   * Throws if the pipeline has no adapter. Defaults to false, so a consumer
   * must opt in to retention rather than opt out of it.
   */
  persist?: boolean
}

export interface IngestPipelineConfig {
  /** Real content types this consumer permits. Enforced against magic bytes. */
  accept: readonly DetectedType[]
  /** Maximum DECODED payload size in bytes. */
  maxBytes: number
  /** Omit entirely for a non-persisting consumer (booklets). */
  storage?: StorageAdapter
  /** Per-tenant throttle. Omit to disable. */
  rateLimit?: RateLimiterOptions
  /** Where the app-specific work happens — the 20% that genuinely differs. */
  onExtracted: (payload: ExtractedPayload) => Promise<void>
}

export interface IngestPipeline {
  /** False when no storage adapter was supplied. Persisting is then impossible. */
  readonly canPersist: boolean
  ingest(request: IngestRequest): Promise<ExtractedPayload>
}

export function createIngestPipeline(config: IngestPipelineConfig): IngestPipeline {
  // One limiter per pipeline instance, never module-level: two pipelines in the
  // same process must not throttle each other, and booklets' buckets must not
  // be reachable from WhatHappen's.
  const limiter = config.rateLimit ? new RateLimiter(config.rateLimit) : null
  const storage = config.storage ?? null

  return {
    canPersist: storage !== null,

    async ingest(request: IngestRequest): Promise<ExtractedPayload> {
      const persist = request.persist === true

      // Programming error, not a user error: fail before doing any work.
      if (persist && storage === null) {
        throw new Error(
          'ingest: persist was requested but this pipeline has no storage adapter. ' +
            'Supply `storage` at construction, or do not request persistence.'
        )
      }

      if (limiter && !limiter.tryConsume(request.tenantId)) {
        throw new UploadGuardError(
          'RATE_LIMITED',
          'Too many uploads for this tenant. Please wait and retry.'
        )
      }

      // Size first: rejects a hostile payload from string length alone, before
      // any decode and before any network or storage call.
      assertPayloadSize(request.base64, config.maxBytes)

      // Then the real type, from magic bytes. A filename claiming .png over zip
      // content is rejected here.
      assertAllowedType(request.base64, config.accept)

      const type = detectType(request.base64) as DetectedType
      const data = Buffer.from(request.base64, 'base64')

      let stored: StoredObject | null = null
      if (persist && storage) {
        // Sanitise BOTH segments. `filename` is obviously untrusted, but so is
        // `tenantId` from this package's point of view: WhatHappen happens to
        // validate it as a UUID at the route, booklets passes an organisation
        // id, and a future consumer may pass anything. A tenantId containing
        // '/' or '..' would escape its own prefix and let one tenant write into
        // another's namespace. The package is the trust boundary, so it checks.
        // CodeRabbit, 2026-08-10: rewriting tenantId was the wrong move and it
        // undid the property this code exists to guarantee. The rewrite is
        // many-to-one — `a/b` and `a_b` both collapse to `a_b`, so two distinct
        // tenants end up sharing one storage prefix, which is precisely the
        // cross-tenant overlap the comment above claims to prevent. And unlike
        // filename, tenantId kept leading dots, so `..` became `.` and produced
        // `./<timestamp>-<name>`.
        //
        // A tenant identifier is not user-facing text to be tidied up. It is a
        // namespace key. Reject anything outside the safe alphabet rather than
        // mapping it onto someone else's namespace.
        const safeTenant = request.tenantId
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(safeTenant) || safeTenant.includes('..')) {
          throw new UploadGuardError(
            'UNSUPPORTED_TYPE',
            'Invalid tenant id: must be alphanumeric with dots, dashes or underscores, and cannot start with a dot.'
          )
        }
        const safeName =
          request.filename.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '.').replace(/^\.+/, '') ||
          'upload'
        const path = `${safeTenant}/${Date.now()}-${safeName}`
        stored = await storage.put(path, data)
      }

      const payload: ExtractedPayload = {
        tenantId: request.tenantId,
        filename: request.filename,
        type,
        data,
        stored,
      }

      await config.onExtracted(payload)
      return payload
    },
  }
}
