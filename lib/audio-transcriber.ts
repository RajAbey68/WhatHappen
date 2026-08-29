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

/**
 * Map audio file extension to appropriate MIME type.
 */
export function getAudioMimeType(filename: string): string {
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
      const mimeType = getAudioMimeType(filename)
      const base64Data = buffer.toString('base64')
      const GEMINI_MODEL = process.env.GEMINI_AUDIO_MODEL || 'gemini-1.5-flash'
      const GEMINI_API_BASE =
        process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta'
      const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (response.ok) {
        const data = await response.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
        return {
          filename,
          text: text || '[Inaudible audio]',
          success: true,
        }
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

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: formData,
      })

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

  // Process in chunks of `concurrency`
  for (let i = 0; i < audioFiles.length; i += concurrency) {
    const chunk = audioFiles.slice(i, i + concurrency)
    const promises = chunk.map(async item => {
      const res = await transcribeAudio(item.data, item.name)
      results.set(item.name, res.text)
      completed++
      if (onProgress) {
        onProgress(completed, total)
      }
    })
    await Promise.all(promises)
  }

  return results
}
