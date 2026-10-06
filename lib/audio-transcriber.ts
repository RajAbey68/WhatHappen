/**
 * Audio transcription module for WhatsApp voice notes and audio attachments.
 * Supports .opus, .m4a, .mp3, .wav, .ogg formats using Gemini Audio / OpenAI Whisper.
 *
 * WhatsApp exports typically contain .opus (OGG container) or .m4a voice notes.
 */

export interface AudioTranscriptionResult {
  filename: string
  text: string
  success: boolean
  durationSeconds?: number
  error?: string
}

export const SUPPORTED_AUDIO_EXTENSIONS = ['.opus', '.m4a', '.mp3', '.wav', '.ogg']

/**
 * Check if a filename corresponds to a supported audio format.
 */
export function isAudioFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return SUPPORTED_AUDIO_EXTENSIONS.some(ext => lower.endsWith(ext))
}

export const MAX_AUDIO_FILE_BYTES = 15 * 1024 * 1024 // 15MB cap

/**
 * Sniff audio magic bytes to determine or verify MIME type.
 */
export function sniffAudioMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) return null
  // Ogg container (Opus or Vorbis) -> "OggS"
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return 'audio/ogg'
  }
  // WAV -> "RIFF....WAVE"
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45
  ) {
    return 'audio/wav'
  }
  // MP4 / M4A -> contains "ftyp" at offset 4
  if (
    buffer.length >= 8 &&
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70
  ) {
    return 'audio/mp4'
  }
  // MP3 -> frame sync 0xFF 0xFB, 0xFF 0xF3, 0xFF 0xF2 or "ID3"
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
    (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    return 'audio/mpeg'
  }
  return null
}

/**
 * Map audio file extension or magic bytes to appropriate MIME type.
 */
export function getAudioMimeType(filename: string, buffer?: Buffer): string {
  if (buffer) {
    const sniffed = sniffAudioMime(buffer)
    if (sniffed) return sniffed
  }
  const lower = filename.toLowerCase()
  if (lower.endsWith('.opus')) return 'audio/ogg'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  return 'audio/ogg'
}

/**
 * Transcribe a single audio buffer using Gemini API (with fallback to OpenAI Whisper if available).
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string
): Promise<AudioTranscriptionResult> {
  if (buffer.length > MAX_AUDIO_FILE_BYTES) {
    return {
      filename,
      text: `[Voice Note: ${filename} (File exceeds 15MB limit)]`,
      success: false,
      error: `Audio file size (${(buffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds maximum allowable 15MB limit.`
    }
  }

  const apiKey = process.env.GEMINI_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (!apiKey && !openaiKey) {
    return {
      filename,
      text: '',
      success: false,
      error: 'Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured for audio transcription.',
    }
  }

  // 1. Try Gemini Audio Transcription
  if (apiKey) {
    try {
      const mimeType = getAudioMimeType(filename, buffer)
      const base64Data = buffer.toString('base64')
      const GEMINI_MODEL =
        process.env.GEMINI_AUDIO_MODEL ||
        process.env.GEMINI_MODEL ||
        'gemini-2.5-flash'
      const GEMINI_API_BASE =
        process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta'
      // Pass key in x-goog-api-key header to avoid leaking in URL logs, but support query param fallback
      const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000)

      const body = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are an audio transcription assistant for WhatHappen, a chat analysis application.
Transcribe this WhatsApp voice message verbatim into text.

Rules:
- Capture spoken words accurately in their original language (English, Sinhala, Tamil, or mixed language/Singlish).
- Do not translate; output the spoken text as heard.
- If Sinhala or Tamil script is spoken, write it in that script or clear phonetic representation.
- Do not add preambles, summaries, or metadata tags. Return ONLY the transcribed text.
- If the audio contains only background noise, silence, or is unintelligible, return "[Inaudible audio]".`,
              },
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (response.ok) {
        const data = await response.json()
        const candidate = data?.candidates?.[0]
        if (candidate?.finishReason === 'SAFETY') {
          return {
            filename,
            text: '[Voice note flagged by content safety filter]',
            success: true,
          }
        }
        const text = candidate?.content?.parts?.[0]?.text?.trim() || ''
        return {
          filename,
          text: text || '[Inaudible audio]',
          success: true,
        }
      } else {
        const errText = await response.text().catch(() => '')
        console.warn(`[audio-transcriber] Gemini HTTP ${response.status} for ${filename}:`, errText)
      }
    } catch (err: any) {
      console.warn(`[audio-transcriber] Gemini audio transcription failed for ${filename}:`, err?.message)
    }
  }

  // 2. Fallback to OpenAI Whisper API if configured
  if (openaiKey) {
    try {
      const mimeType = getAudioMimeType(filename)
      const blob = new Blob([buffer], { type: mimeType })
      const formData = new FormData()
      formData.append('file', blob, filename)
      formData.append('model', 'whisper-1')

      // Bound the Whisper call so a hung request cannot stall the batch.
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000)

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (response.ok) {
        const data = await response.json()
        return {
          filename,
          text: (data.text || '').trim() || '[Inaudible audio]',
          success: true,
        }
      }
    } catch (err: any) {
      console.warn(`[audio-transcriber] Whisper transcription failed for ${filename}:`, err?.message)
    }
  }

  return {
    filename,
    text: `[Voice Note: ${filename} (Transcription unavailable)]`,
    success: false,
    error: 'Audio transcription failed on all providers',
  }
}

/**
 * Concurrency-bounded batch audio transcriber.
 * Processes up to `concurrency` audio files simultaneously.
 */
export async function transcribeBatchAudio(
  audioFiles: Array<{ name: string; data: Buffer }>,
  concurrency: number = 3,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  const total = audioFiles.length
  let completed = 0

  if (total === 0) return results

  // Process in chunks of `concurrency`.
  // allSettled: one failed/hung transcription must not reject the whole chunk —
  // failed items fall back to a placeholder so the rest of the upload still processes.
  for (let i = 0; i < audioFiles.length; i += concurrency) {
    const chunk = audioFiles.slice(i, i + concurrency)
    const outcomes = await Promise.allSettled(
      chunk.map(item => transcribeAudio(item.data, item.name))
    )
    outcomes.forEach((outcome, j) => {
      const item = chunk[j]
      if (outcome.status === 'fulfilled') {
        results.set(item.name, outcome.value.text)
      } else {
        console.warn(`[audio-transcriber] batch item failed unexpectedly: ${item.name}`, outcome.reason)
        results.set(item.name, `[Voice Note: ${item.name} (Transcription unavailable)]`)
      }
      completed++
      onProgress?.(completed, total)
    })
  }

  return results
}
