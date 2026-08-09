"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIngestPipeline = createIngestPipeline;
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
const errors_1 = require("./guard/errors");
const size_1 = require("./guard/size");
const magic_1 = require("./guard/magic");
const rate_limit_1 = require("./guard/rate-limit");
function createIngestPipeline(config) {
    // One limiter per pipeline instance, never module-level: two pipelines in the
    // same process must not throttle each other, and booklets' buckets must not
    // be reachable from WhatHappen's.
    const limiter = config.rateLimit ? new rate_limit_1.RateLimiter(config.rateLimit) : null;
    const storage = config.storage ?? null;
    return {
        canPersist: storage !== null,
        async ingest(request) {
            const persist = request.persist === true;
            // Programming error, not a user error: fail before doing any work.
            if (persist && storage === null) {
                throw new Error('ingest: persist was requested but this pipeline has no storage adapter. ' +
                    'Supply `storage` at construction, or do not request persistence.');
            }
            if (limiter && !limiter.tryConsume(request.tenantId)) {
                throw new errors_1.UploadGuardError('RATE_LIMITED', 'Too many uploads for this tenant. Please wait and retry.');
            }
            // Size first: rejects a hostile payload from string length alone, before
            // any decode and before any network or storage call.
            (0, size_1.assertPayloadSize)(request.base64, config.maxBytes);
            // Then the real type, from magic bytes. A filename claiming .png over zip
            // content is rejected here.
            (0, magic_1.assertAllowedType)(request.base64, config.accept);
            const type = (0, magic_1.detectType)(request.base64);
            const data = Buffer.from(request.base64, 'base64');
            let stored = null;
            if (persist && storage) {
                const safeName = request.filename.replace(/[^A-Za-z0-9._-]/g, '_');
                const path = `${request.tenantId}/${Date.now()}-${safeName}`;
                stored = await storage.put(path, data);
            }
            const payload = {
                tenantId: request.tenantId,
                filename: request.filename,
                type,
                data,
                stored,
            };
            await config.onExtracted(payload);
            return payload;
        },
    };
}
