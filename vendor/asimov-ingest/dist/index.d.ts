/**
 * @asimov/ingest — shared file-ingest pipeline.
 *
 * Consumers:
 *   - WhatHappen : WhatsApp zip exports (text + media), persisted for a
 *                  retention window, OCR'd, analysed.
 *   - booklets   : receipt images, OCR'd in memory and NEVER persisted.
 *
 * The guard, type detection and rate limiter are lifted from booklets'
 * `src/lib/upload-guard.ts` (RAJ-456), which has been in production. Booklets'
 * existing test suite is treated as the behavioural contract for this package:
 * if it needs editing to pass, this package changed behaviour and the change is
 * wrong.
 */
export { UploadGuardError, type UploadGuardCode } from './guard/errors';
export { MAX_RECEIPT_BYTES, estimateDecodedBytes, assertPayloadSize } from './guard/size';
export { assertImageMagicBytes, assertAllowedType, detectType, type DetectedType, } from './guard/magic';
export { RateLimiter, type RateLimiterOptions } from './guard/rate-limit';
export type { StorageAdapter, StoredObject, SignedUploadUrl } from './storage/adapter';
export { createSupabaseStorageAdapter, type SupabaseAdapterOptions } from './storage/supabase';
export { createIngestPipeline, type IngestPipeline, type IngestPipelineConfig, type IngestRequest, type ExtractedPayload, } from './pipeline';
