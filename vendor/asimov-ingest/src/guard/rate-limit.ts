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
  capacity: number
  /** Continuous refill rate, tokens per minute. */
  refillPerMinute: number
  /** Injectable clock returning milliseconds; defaults to Date.now at CALL time. */
  now?: () => number
}

interface Bucket {
  tokens: number
  lastRefillMs: number
}

export class RateLimiter {
  private readonly capacity: number
  private readonly refillPerMs: number
  private readonly now: () => number
  private readonly buckets = new Map<string, Bucket>()

  constructor(options: RateLimiterOptions) {
    if (options.capacity <= 0 || options.refillPerMinute <= 0) {
      throw new Error('RateLimiter: capacity and refillPerMinute must be positive.')
    }
    this.capacity = options.capacity
    this.refillPerMs = options.refillPerMinute / 60_000
    this.now = options.now ?? (() => Date.now())
  }

  /** Consume one token for `key`. Returns false when the bucket is empty. */
  tryConsume(key: string): boolean {
    const nowMs = this.now()
    let bucket = this.buckets.get(key)

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefillMs: nowMs }
      this.buckets.set(key, bucket)
    } else {
      const elapsed = Math.max(0, nowMs - bucket.lastRefillMs)
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerMs)
      bucket.lastRefillMs = nowMs
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return true
    }
    return false
  }
}
