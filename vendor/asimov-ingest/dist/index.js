"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIngestPipeline = exports.createSupabaseStorageAdapter = exports.RateLimiter = exports.detectType = exports.assertAllowedType = exports.assertImageMagicBytes = exports.assertPayloadSize = exports.estimateDecodedBytes = exports.MAX_RECEIPT_BYTES = exports.UploadGuardError = void 0;
// --- guard (booklets-derived; API-compatible with src/lib/upload-guard.ts) ---
var errors_1 = require("./guard/errors");
Object.defineProperty(exports, "UploadGuardError", { enumerable: true, get: function () { return errors_1.UploadGuardError; } });
var size_1 = require("./guard/size");
Object.defineProperty(exports, "MAX_RECEIPT_BYTES", { enumerable: true, get: function () { return size_1.MAX_RECEIPT_BYTES; } });
Object.defineProperty(exports, "estimateDecodedBytes", { enumerable: true, get: function () { return size_1.estimateDecodedBytes; } });
Object.defineProperty(exports, "assertPayloadSize", { enumerable: true, get: function () { return size_1.assertPayloadSize; } });
var magic_1 = require("./guard/magic");
Object.defineProperty(exports, "assertImageMagicBytes", { enumerable: true, get: function () { return magic_1.assertImageMagicBytes; } });
Object.defineProperty(exports, "assertAllowedType", { enumerable: true, get: function () { return magic_1.assertAllowedType; } });
Object.defineProperty(exports, "detectType", { enumerable: true, get: function () { return magic_1.detectType; } });
var rate_limit_1 = require("./guard/rate-limit");
Object.defineProperty(exports, "RateLimiter", { enumerable: true, get: function () { return rate_limit_1.RateLimiter; } });
var supabase_1 = require("./storage/supabase");
Object.defineProperty(exports, "createSupabaseStorageAdapter", { enumerable: true, get: function () { return supabase_1.createSupabaseStorageAdapter; } });
// --- pipeline --------------------------------------------------------------
var pipeline_1 = require("./pipeline");
Object.defineProperty(exports, "createIngestPipeline", { enumerable: true, get: function () { return pipeline_1.createIngestPipeline; } });
