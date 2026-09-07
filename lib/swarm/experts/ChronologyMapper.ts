import { generateWithFallback } from '../../llm'
import { ChronologyEvent } from '../types'
import { ChatMessage } from '../SwarmManager'

export class ChronologyMapper {
  public static async analyze(
    messages: ChatMessage[],
    options?: { signal?: AbortSignal }
  ): Promise<ChronologyEvent[]> {
    if (messages.length === 0) return []

    const prompt = `You are an expert Chronology & Temporal Sequencing Analyst. Analyze the WhatsApp conversation chunk and normalize all chronological events, deadlines, commitments, and retrospective mentions ("last Tuesday", "the day after invoice", "next month") into strict ISO-8601 timeline milestones.

STRICT INVARIANTS:
1. Temporal certainty must be: exact, inferred, or approximate.
2. Link every milestone to the specific message index or quote.
3. Output JSON in the format:
{
  "milestones": [
    {
      "normalizedIsoDate": "YYYY-MM-DDTHH:mm:ssZ",
      "rawDateMention": "raw text mention like 'next Tuesday'",
      "eventDescription": "what occurred or was promised",
      "confidence": 0.85,
      "sourceMessageId": "msg-index",
      "temporalOrderingCertainty": "exact|inferred|approximate"
    }
  ]
}

MESSAGES:
${messages.map((m, i) => `[${i}] [${m.timestamp}] ${m.sender}: ${m.message}`).join('\n')}`

    try {
      const response = await generateWithFallback([
        { role: 'system', content: 'You are an objective chronological investigator. Resolve relative temporal references to standard ISO dates strictly. Respond in JSON.' },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.1,
        response_format: { type: 'json_object' },
        signal: options?.signal
      } as any)

      if (!response || !response.content) return []
      const parsed = JSON.parse(response.content)
      return (parsed.milestones || []).map((m: any) => ({
        normalizedIsoDate: String(m.normalizedIsoDate || new Date().toISOString()),
        rawDateMention: String(m.rawDateMention || ''),
        eventDescription: String(m.eventDescription || ''),
        confidence: typeof m.confidence === 'number' ? m.confidence : 0.8,
        sourceMessageId: String(m.sourceMessageId || 'unknown'),
        temporalOrderingCertainty: m.temporalOrderingCertainty || 'inferred',
      }))
    } catch (err: any) {
      console.error('[ChronologyMapper] Extraction failed:', err.message)
      return []
    }
  }
}
