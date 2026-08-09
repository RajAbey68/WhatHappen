"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectType = detectType;
exports.assertImageMagicBytes = assertImageMagicBytes;
exports.assertAllowedType = assertAllowedType;
/**
 * Content-type detection from magic bytes.
 *
 * `assertImageMagicBytes` is lifted verbatim from booklets (RAJ-456) — same
 * accepted set, same error strings — because that repo's suite is the contract.
 *
 * `detectType` / `assertAllowedType` are the GENERALISATION: WhatHappen ingests
 * zip archives, booklets must never accept one. The accepted set is therefore
 * a caller-supplied list, not a property of the function. A client-supplied
 * filename or MIME type is a UI hint and is never trusted here.
 */
const errors_1 = require("./errors");
/** How many decoded bytes we need to identify every supported format. */
const MAGIC_PREFIX_BYTES = 16;
function decodePrefix(base64, bytes) {
    // 4 base64 chars → 3 bytes; take enough chars (rounded to a 4-char
    // boundary) to yield `bytes` decoded bytes. Never decodes the full payload.
    const chars = Math.ceil(bytes / 3) * 4;
    return Buffer.from(base64.slice(0, chars), 'base64');
}
/**
 * Identify the real content type from magic bytes, or null when unrecognised.
 * Returning null rather than guessing is deliberate — a caller must not be able
 * to smuggle an unknown format through by omission.
 */
function detectType(base64) {
    if (!base64 || base64.length === 0)
        return null;
    const head = decodePrefix(base64, MAGIC_PREFIX_BYTES);
    if (head.length < 4)
        return null;
    // JPEG: FF D8 FF
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
        return 'jpeg';
    // PNG: 89 50 4E 47
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)
        return 'png';
    // PDF: 25 50 44 46  ("%PDF")
    if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)
        return 'pdf';
    // ZIP: PK\x03\x04 (normal), PK\x05\x06 (empty archive), PK\x07\x08 (spanned).
    // WhatsApp exports are ordinary zips, but the empty-archive signature must be
    // recognised too or a zero-entry upload is misreported as an unknown type.
    if (head[0] === 0x50 && head[1] === 0x4b) {
        const c = head[2];
        const d = head[3];
        if ((c === 0x03 && d === 0x04) || (c === 0x05 && d === 0x06) || (c === 0x07 && d === 0x08)) {
            return 'zip';
        }
    }
    if (head.length < 12)
        return null;
    // HEIC/HEIF: ISO-BMFF 'ftyp' box at offset 4 with a known image brand.
    const ftyp = head.subarray(4, 12).toString('latin1');
    if (ftyp === 'ftypheic' || ftyp === 'ftypheix' || ftyp === 'ftypmif1')
        return 'heic';
    // WebP: 'RIFF' at 0 and 'WEBP' at 8. RIFF alone is not enough — WAVE audio
    // shares the container.
    if (head.subarray(0, 4).toString('latin1') === 'RIFF' &&
        head.subarray(8, 12).toString('latin1') === 'WEBP') {
        return 'webp';
    }
    return null;
}
/**
 * Validate real image magic bytes on a decoded prefix only.
 * Accepts JPEG, PNG, HEIC/HEIF and WebP; anything else is rejected.
 *
 * Behaviour and error strings preserved from booklets RAJ-456.
 */
function assertImageMagicBytes(base64) {
    if (!base64 || base64.length === 0) {
        throw new errors_1.UploadGuardError('UNSUPPORTED_TYPE', 'No image data received.');
    }
    const head = decodePrefix(base64, MAGIC_PREFIX_BYTES);
    if (head.length < 12) {
        throw new errors_1.UploadGuardError('UNSUPPORTED_TYPE', 'File is not a recognisable image.');
    }
    const type = detectType(base64);
    if (type === 'jpeg' || type === 'png' || type === 'heic' || type === 'webp')
        return;
    throw new errors_1.UploadGuardError('UNSUPPORTED_TYPE', 'Unsupported file type. Please upload a JPEG, PNG, HEIC or WebP image.');
}
/**
 * Enforce a caller-supplied accept-list against the payload's REAL type.
 *
 * This is the seam that lets one package serve both consumers: WhatHappen
 * passes ['zip','pdf',...], booklets passes images only, and the same code
 * refuses a zip for booklets.
 */
function assertAllowedType(base64, accept) {
    if (accept.length === 0) {
        throw new errors_1.UploadGuardError('UNSUPPORTED_TYPE', 'No file types are permitted by this pipeline (empty accept-list).');
    }
    const type = detectType(base64);
    if (type === null) {
        throw new errors_1.UploadGuardError('UNSUPPORTED_TYPE', 'File type could not be identified.');
    }
    if (!accept.includes(type)) {
        throw new errors_1.UploadGuardError('UNSUPPORTED_TYPE', `Unsupported file type "${type}". Permitted: ${accept.join(', ')}.`);
    }
}
