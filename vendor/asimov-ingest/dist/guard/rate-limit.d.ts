/**
 * Token-bucket rate limiter — lifted verbatim from booklets (RAJ-456).
 *
 * LIMITATION (documented and accepted there, and it still applies): the bucket
 * is per-process. Under multi-instance or serverless deployment each replica
 * holds its own bucket, so the effective global limit is N × capacity.
 *
 * This matters more for WhatHappen than it did for booklets: WhatHappen runs on
 * Cloud Run with min-instances=0 and max-instances=10, so the real ceiling is
 * up to 10× and resets on cold start. Treat this as defence-in-depth, not a
 * hard global cap. A shared store (Redis/Postgres) is required for that.
 */
export interface RateLimiterOptions {
    /** Maximum burst size (bucket capacity). */
    capacity: number;
    /** Continuous refill rate, tokens per minute. */
    refillPerMinute: number;
    /** Injectable clock returning milliseconds; defaults to Date.now at CALL time. */
    now?: () => number;
}
export declare class RateLimiter {
    private readonly capacity;
    private readonly refillPerMs;
    private readonly now;
    private readonly buckets;
    constructor(options: RateLimiterOptions);
    /** Consume one token for `key`. Returns false when the bucket is empty. */
    tryConsume(key: string): boolean;
}
