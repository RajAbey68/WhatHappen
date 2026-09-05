import {
  transcribeAudio,
  transcribeBatchAudio,
  isAudioFile,
  getAudioMimeType,
} from '@/lib/audio-transcriber'

describe('Audio Transcriber (Gemini & Fallback Engine)', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    // Reset global fetch mock
    global.fetch = jest.fn()
  })

  afterAll(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  describe('File Format & MIME Detection', () => {
    it('accurately identifies WhatsApp supported audio extensions', () => {
      expect(isAudioFile('voice-message.opus')).toBe(true)
      expect(isAudioFile('VOICE-MESSAGE.OPUS')).toBe(true)
      expect(isAudioFile('audio.m4a')).toBe(true)
      expect(isAudioFile('audio.mp3')).toBe(true)
      expect(isAudioFile('audio.wav')).toBe(true)
      expect(isAudioFile('audio.ogg')).toBe(true)
      expect(isAudioFile('image.jpg')).toBe(false)
      expect(isAudioFile('document.pdf')).toBe(false)
      expect(isAudioFile('video.mp4')).toBe(false)
    })

    it('returns appropriate audio MIME types', () => {
      expect(getAudioMimeType('recording.opus')).toBe('audio/ogg')
      expect(getAudioMimeType('recording.ogg')).toBe('audio/ogg')
      expect(getAudioMimeType('recording.m4a')).toBe('audio/mp4')
      expect(getAudioMimeType('recording.mp3')).toBe('audio/mpeg')
      expect(getAudioMimeType('recording.wav')).toBe('audio/wav')
      expect(getAudioMimeType('unknown.xyz')).toBe('audio/ogg')
    })
  })

  describe('transcribeAudio: Gemini Primary Provider', () => {
    it('returns an error result if neither GEMINI_API_KEY nor OPENAI_API_KEY is configured', async () => {
      delete process.env.GEMINI_API_KEY
      delete process.env.OPENAI_API_KEY

      const buf = Buffer.from('fake-audio-bytes')
      const result = await transcribeAudio(buf, 'test.opus')

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.error).toContain('Neither GEMINI_API_KEY nor OPENAI_API_KEY')
    })

    it('transcribes verbatim using Google Gemini API successfully', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key'
      delete process.env.OPENAI_API_KEY

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Kohomada Sudath, can we review the villa bookings for next weekend?' },
              ],
            },
          },
        ],
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const buf = Buffer.from('sample-audio-data')
      const result = await transcribeAudio(buf, 'whatsapp_ptt.opus')

      expect(result.success).toBe(true)
      expect(result.filename).toBe('whatsapp_ptt.opus')
      expect(result.text).toBe('Kohomada Sudath, can we review the villa bookings for next weekend?')

      // Verify fetch payload sent to Gemini API
      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toContain('https://generativelanguage.googleapis.com/v1beta/models/')
      expect(url).toContain('key=test-gemini-key')
      expect(options.method).toBe('POST')

      const body = JSON.parse(options.body)
      expect(body.contents[0].parts[1].inlineData.mimeType).toBe('audio/ogg')
      expect(body.contents[0].parts[1].inlineData.data).toBe(buf.toString('base64'))
    })

    it('handles empty or inaudible transcription by returning "[Inaudible audio]"', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key'

      const mockEmptyResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: '   ' }],
            },
          },
        ],
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockEmptyResponse,
      })

      const buf = Buffer.from('sample-silent-audio')
      const result = await transcribeAudio(buf, 'silent.m4a')

      expect(result.success).toBe(true)
      expect(result.text).toBe('[Inaudible audio]')
    })

    it('falls back to OpenAI Whisper if Gemini fails and OPENAI_API_KEY is available', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key'
      process.env.OPENAI_API_KEY = 'test-whisper-key'

      // Gemini call fails with 500
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Gemini internal error',
      })

      // Whisper call succeeds
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Whisper fallback transcript of voice note' }),
      })

      const buf = Buffer.from('audio-bytes')
      const result = await transcribeAudio(buf, 'chat_audio.mp3')

      expect(result.success).toBe(true)
      expect(result.text).toBe('Whisper fallback transcript of voice note')
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('handles network error gracefully and returns fallback placeholder', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key'
      delete process.env.OPENAI_API_KEY

      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network connection timeout'))

      const buf = Buffer.from('audio-bytes')
      const result = await transcribeAudio(buf, 'voice_test.wav')

      expect(result.success).toBe(false)
      expect(result.text).toBe('[Voice Note: voice_test.wav (Transcription unavailable)]')
      expect(result.error).toBe('Audio transcription failed on all providers')
    })
  })

  describe('transcribeBatchAudio: Concurrency & Aggregation', () => {
    it('returns an empty map when given no files', async () => {
      const results = await transcribeBatchAudio([])
      expect(results.size).toBe(0)
    })

    it('processes batch audio with concurrency limit and tracks progress', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key'
      delete process.env.OPENAI_API_KEY

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Voice note 1 text' }] } }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Voice note 2 text' }] } }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Voice note 3 text' }] } }],
          }),
        })

      const audioFiles = [
        { name: 'ptt1.opus', data: Buffer.from('audio1') },
        { name: 'ptt2.opus', data: Buffer.from('audio2') },
        { name: 'ptt3.opus', data: Buffer.from('audio3') },
      ]

      const progressCalls: Array<[number, number]> = []
      const results = await transcribeBatchAudio(audioFiles, 2, (completed, total) => {
        progressCalls.push([completed, total])
      })

      expect(results.size).toBe(3)
      expect(results.get('ptt1.opus')).toBe('Voice note 1 text')
      expect(results.get('ptt2.opus')).toBe('Voice note 2 text')
      expect(results.get('ptt3.opus')).toBe('Voice note 3 text')
      expect(progressCalls).toEqual([
        [1, 3],
        [2, 3],
        [3, 3],
      ])
    })

    it('preserves other results even if one item in the batch encounters an unexpected error', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key'
      delete process.env.OPENAI_API_KEY

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Good transcript' }] } }],
          }),
        })
        .mockRejectedValueOnce(new Error('Fatal worker crash'))

      const audioFiles = [
        { name: 'good.opus', data: Buffer.from('good') },
        { name: 'bad.opus', data: Buffer.from('bad') },
      ]

      const results = await transcribeBatchAudio(audioFiles, 2)
      expect(results.size).toBe(2)
      expect(results.get('good.opus')).toBe('Good transcript')
      expect(results.get('bad.opus')).toContain('Transcription unavailable')
    })
  })
})
