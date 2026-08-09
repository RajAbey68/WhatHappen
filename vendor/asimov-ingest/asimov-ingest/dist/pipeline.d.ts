import { type DetectedType } from './guard/magic';
import { type RateLimiterOptions } from './guard/rate-limit';
import type { StorageAdapter, StoredObject } from './storage/adapter';
export interface ExtractedPayload {
    tenantId: string;
    filename: string;
    /** Real type as determined by magic bytes, never by filename. */
    type: DetectedType;
    /** Decoded bytes. Present for in-memory consumers such as booklets. */
    data: Buffer;
    /** Non-null only when the pipeline persisted the object. */
    stored: StoredObject | null;
}
export interface IngestRequest {
    /** Project id (WhatHappen) or organisation id (booklets). Scopes rate limits and paths. */
    tenantId: string;
    filename: string;
    /** Payload as base64 — matches how both apps already receive uploads. */
    base64: string;
    /**
     * Persist the object via the configured storage adapter.
     * Throws if the pipeline has no adapter. Defaults to false, so a consumer
     * must opt in to retention rather than opt out of it.
     */
    persist?: boolean;
}
export interface IngestPipelineConfig {
    /** Real content types this consumer permits. Enforced against magic bytes. */
    accept: readonly DetectedType[];
    /** Maximum DECODED payload size in bytes. */
    maxBytes: number;
    /** Omit entirely for a non-persisting consumer (booklets). */
    storage?: StorageAdapter;
    /** Per-tenant throttle. Omit to disable. */
    rateLimit?: RateLimiterOptions;
    /** Where the app-specific work happens — the 20% that genuinely differs. */
    onExtracted: (payload: ExtractedPayload) => Promise<void>;
}
export interface IngestPipeline {
    /** False when no storage adapter was supplied. Persisting is then impossible. */
    readonly canPersist: boolean;
    ingest(request: IngestRequest): Promise<ExtractedPayload>;
}
export declare function createIngestPipeline(config: IngestPipelineConfig): IngestPipeline;
