/**
 * WhatHappen OCR client — calls the shared OCR microservice.
 *
 * Instead of calling the Gemini API directly, this module POSTs to the
 * shared OCR microservice at OCR_MICROSERVICE_URL (default http://localhost:3099).
 *
 * Environment:
 *   OCR_MICROSERVICE_URL — URL of the OCR microservice (default: http://localhost:3099)
 *   GEMINI_API_KEY — fallback for direct Gemini call if microservice is unreachable
 *
 * @module gemini-ocr
 */

const OCR_MICROSERVICE_URL =
  process.env.OCR_MICROSERVICE_URL || 'https://ocr-microservice-gamma.vercel.app';
const OCR_TIMEOUT_MS = (() => {
  const raw = process.env.OCR_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
})();

/**
 * OCR result from the microservice.
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
 * Extract all visible text from a base64-encoded image via the OCR microservice.
 *
 * @param imageBase64 - Base64-encoded image data (with or without data URI prefix)
 * @returns The extraction result
 */
export async function extractImageText(
  imageBase64: string
): Promise<GeminiOcrResult> {
  // Try the OCR microservice first
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

    const response = await fetch(`${OCR_MICROSERVICE_URL}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        mode: 'text',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `OCR microservice error: ${response.status} ${response.statusText}${
          errorText ? ` — ${errorText.slice(0, 500)}` : ''
        }`
      );
    }

    const data = await response.json();

    return {
      extractedText: data.text || '',
      success: true,
    };
  } catch (err) {
    // Microservice unavailable — fall back to direct Gemini call
    console.warn(
      'OCR microservice unreachable, falling back to direct Gemini:',
      err instanceof Error ? err.message : String(err)
    );
    return fallbackToDirectGemini(imageBase64);
  }

  async function fallbackToDirectGemini(
    base64Input: string
  ): Promise<GeminiOcrResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        extractedText: '',
        success: false,
        error: 'OCR microservice unreachable and GEMINI_API_KEY is not set.',
      };
    }

    const GEMINI_MODEL = process.env.GEMINI_OCR_MODEL || 'gemini-1.5-flash';
    const GEMINI_API_BASE =
      process.env.GEMINI_API_BASE ||
      'https://generativelanguage.googleapis.com/v1beta';
    const GEMINI_TIMEOUT_MS = (() => {
      const raw = process.env.GEMINI_OCR_TIMEOUT_MS;
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
    })();

    const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const cleanBase64 = base64Input.replace(/^data:image\/[a-z]+;base64,/, '');
    const mimeType = sniffMimeType(cleanBase64);

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are an OCR assistant for WhatHappen, a chat analysis application used in Sri Lanka.

Extract ALL visible text from this image and return ONLY the raw text content.

Rules:
- Images may contain a mix of English and Sinhala text. Extract ALL text you can read.
- Preserve the original language: do not translate Sinhala to English.
- If a word or phrase is in Sinhala, return it in the original Sinhala script (not transliterated).
- Do not add any commentary, explanations, markdown formatting, or JSON wrapping.
- Return ONLY the raw extracted text, exactly as it appears in the image.
- If you cannot read any text in the image, return an empty string.`,
            },
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
        temperature: 0.1,
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

function sniffMimeType(base64: string): string {
  const raw = atob(base64.slice(0, 30));
  const byte0 = raw.charCodeAt(0);
  const byte1 = raw.charCodeAt(1);

  if (byte0 === 0xff && byte1 === 0xd8) return 'image/jpeg';
  if (byte0 === 0x89 && byte1 === 0x50) return 'image/png';
  if (byte0 === 0x52 && raw.slice(0, 4) === 'RIFF') return 'image/webp';
  if (byte0 === 0x00 && byte1 === 0x00) return 'image/heic';

  return 'image/jpeg';
}
