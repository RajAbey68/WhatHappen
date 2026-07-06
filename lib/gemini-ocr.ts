/**
 * Gemini Flash Vision OCR — text extraction from images via Google Gemini API.
 *
 * Extracts text (English + Sinhala) from images found in WhatsApp exports
 * and email attachments. Used by the WhatHappen file processing pipeline.
 *
 * Environment:
 *   GEMINI_API_KEY — required, loaded from macOS Keychain service "gemini-api"
 *
 * @module gemini-ocr
 */

const GEMINI_MODEL = process.env.GEMINI_OCR_MODEL || 'gemini-1.5-flash';
const GEMINI_API_BASE =
  process.env.GEMINI_API_BASE ||
  'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TIMEOUT_MS = (() => {
  const raw = process.env.GEMINI_OCR_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
})();

/**
 * OCR result from Gemini Flash Vision.
 */
export interface GeminiOcrResult {
  /** All extracted text from the image. */
  extractedText: string;
  /** Whether the extraction was successful. */
  success: boolean;
  /** Error message if extraction failed. */
  error?: string;
}

/**
 * Prompt instructs the model to extract ALL visible text from the image,
 * handling English and Sinhala text. Returns plain text (no JSON).
 */
const OCR_PROMPT = `You are an OCR assistant for WhatHappen, a chat analysis application used in Sri Lanka.

Extract ALL visible text from this image and return ONLY the raw text content.

Rules:
- Images may contain a mix of English and Sinhala text. Extract ALL text you can read.
- Preserve the original language: do not translate Sinhala to English.
- If a word or phrase is in Sinhala, return it in the original Sinhala script (not transliterated).
- Do not add any commentary, explanations, markdown formatting, or JSON wrapping.
- Return ONLY the raw extracted text, exactly as it appears in the image.
- If you cannot read any text in the image, return an empty string.
- This may be a photo of a document, a receipt, a screenshot of a chat conversation, or any image shared in a WhatsApp chat.`;

/**
 * Extract all visible text from a base64-encoded image using Gemini Flash Vision.
 *
 * @param imageBase64 - Base64-encoded image data (with or without data URI prefix)
 * @returns The extracted text
 * @throws Error if the API key is missing or the request fails
 */
export async function extractImageText(
  imageBase64: string
): Promise<GeminiOcrResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      extractedText: '',
      success: false,
      error: 'GEMINI_API_KEY is not set in environment variables.',
    };
  }

  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  // Strip data URI prefix if present
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  // Detect MIME type from the base64 header bytes
  const mimeType = sniffMimeType(cleanBase64);

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: OCR_PROMPT },
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1, // low temperature for deterministic extraction
      maxOutputTokens: 2048,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Gemini OCR API Error: ${response.status} ${response.statusText}${
          errorText ? ` — ${errorText.slice(0, 500)}` : ''
        }`
      );
    }

    const data = await response.json();

    // Extract the model's text response from the Gemini response format
    const textResponse =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!textResponse) {
      const blockReason = data?.promptFeedback?.blockReason;
      if (blockReason) {
        return {
          extractedText: '',
          success: false,
          error: `Gemini OCR: Content blocked — ${blockReason}`,
        };
      }
      return {
        extractedText: '',
        success: true,
        error: undefined,
      };
    }

    return {
      extractedText: textResponse.trim(),
      success: true,
    };
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      return {
        extractedText: '',
        success: false,
        error: `Gemini OCR: Request timed out after ${GEMINI_TIMEOUT_MS}ms.`,
      };
    }
    const message =
      err instanceof Error ? err.message : `Unexpected error — ${String(err)}`;
    return {
      extractedText: '',
      success: false,
      error: `Gemini OCR: ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * List of image file extensions we can OCR.
 */
export const SUPPORTED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
  '.gif',
];

/**
 * Check whether a filename has a supported image extension.
 */
export function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sniff MIME type from base64-encoded image data by inspecting the first few
 * decoded bytes. Defaults to image/jpeg which Gemini handles fine.
 */
function sniffMimeType(base64: string): string {
  const raw = atob(base64.slice(0, 30));
  const byte0 = raw.charCodeAt(0);
  const byte1 = raw.charCodeAt(1);

  if (byte0 === 0xff && byte1 === 0xd8) return 'image/jpeg';
  if (byte0 === 0x89 && byte1 === 0x50) return 'image/png';
  // WEBP starts with "RIFF" + 4 bytes + "WEBP"
  if (byte0 === 0x52 && raw.slice(0, 4) === 'RIFF') return 'image/webp';
  // HEIC/HEIF
  if (byte0 === 0x00 && byte1 === 0x00) return 'image/heic';

  return 'image/jpeg'; // safe default
}
