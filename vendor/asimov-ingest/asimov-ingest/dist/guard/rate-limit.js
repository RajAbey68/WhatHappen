"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
class RateLimiter {
    capacity;
    refillPerMs;
    now;
    buckets = new Map();
    constructor(options) {
        if (options.capacity <= 0 || options.refillPerMinute <= 0) {
            throw new Error('RateLimiter: capacity and refillPerMinute must be positive.');
        }
        this.capacity = options.capacity;
        this.refillPerMs = options.refillPerMinute / 60_000;
        this.now = options.now ?? (() => Date.now());
    }
    /** Consume one token for `key`. Returns false when the bucket is empty. */
    tryConsume(key) {
        const nowMs = this.now();
        let bucket = this.buckets.get(key);
        if (!bucket) {
            bucket = { tokens: this.capacity, lastRefillMs: nowMs };
            this.buckets.set(key, bucket);
        }
        else {
            const elapsed = Math.max(0, nowMs - bucket.lastRefillMs);
            bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerMs);
            bucket.lastRefillMs = nowMs;
        }
        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            return true;
        }
        return false;
    }
}
exports.RateLimiter = RateLimiter;
