/** Default cap on the DECODED payload size: 5 MB. */
export declare const MAX_RECEIPT_BYTES: number;
/**
 * Estimate decoded byte size from base64 length alone:
 * every 4 chars encode 3 bytes, minus 1 byte per trailing '=' pad.
 */
export declare function estimateDecodedBytes(base64: string): number;
/**
 * Reject oversize (or empty) payloads with a typed error BEFORE any full
 * decode. Only string length is inspected — O(1) memory.
 */
export declare function assertPayloadSize(base64: string, maxBytes?: number): void;
