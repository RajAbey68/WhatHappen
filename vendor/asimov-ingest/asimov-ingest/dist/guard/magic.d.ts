export type DetectedType = 'jpeg' | 'png' | 'webp' | 'heic' | 'pdf' | 'zip';
/**
 * Identify the real content type from magic bytes, or null when unrecognised.
 * Returning null rather than guessing is deliberate — a caller must not be able
 * to smuggle an unknown format through by omission.
 */
export declare function detectType(base64: string): DetectedType | null;
/**
 * Validate real image magic bytes on a decoded prefix only.
 * Accepts JPEG, PNG, HEIC/HEIF and WebP; anything else is rejected.
 *
 * Behaviour and error strings preserved from booklets RAJ-456.
 */
export declare function assertImageMagicBytes(base64: string): void;
/**
 * Enforce a caller-supplied accept-list against the payload's REAL type.
 *
 * This is the seam that lets one package serve both consumers: WhatHappen
 * passes ['zip','pdf',...], booklets passes images only, and the same code
 * refuses a zip for booklets.
 */
export declare function assertAllowedType(base64: string, accept: readonly DetectedType[]): void;
