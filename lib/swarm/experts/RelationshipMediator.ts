import { generateWithFallback } from '../../llm'
import { SentimentPoint } from '../types'
import { ChatMessage } from '../SwarmManager'

export class RelationshipMediator {
  public static async analyze(
    messages: ChatMessage[],
    options?: { signal?: AbortSignal }
  ): Promise<SentimentPoint[]> {
    if (messages.length === 0) return []

    const prompt = `You are a certified Mediation & Communication Friction Analyst. Analyze the following WhatsApp conversation chunk for friction points, emotional escalation, defensiveness, and attempts at conciliation.

STRICT INVARIANTS:
1. Friction score must be from 0 to 10 (0 = peaceful cooperation, 10 = acute dispute/hostility).
2. Tone must be one of: cooperative, neutral, passive_aggressive, confrontational, conciliatory.
3. Every entry MUST cite the exact phrase or message indicating the shift.
4. Output JSON in the format:
{
  "frictionPoints": [
    {
      "timestampIso": "ISO timestamp or original",
      "sender": "sender_name",
      "frictionScore": 7,
      "tone": "confrontational",
      "escalationTrigger": "disagreement over invoice payment date",
      "confidence": 0.9,
      "sourceCitation": "exact quote"
    }
  ]
}

MESSAGES:
${messages.map((m, i) => `[${i}] [${m.timestamp}] ${m.sender}: ${m.message}`).join('\n')}`

    try {
      const response = await generateWithFallback([
        { role: 'system', content: 'You are an objective dispute mediator. Analyze communication friction factually without taking sides. Respond strictly in valid JSON.' },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.1,
        response_format: { type: 'json_object' },
        signal: options?.signal
      } as any)

      if (!response || !response.content) return []
      const parsed = JSON.parse(response.content)
      return (parsed.frictionPoints || []).map((p: any) => ({
        timestampIso: String(p.timestampIso || new Date().toISOString()),
        sender: String(p.sender || 'unknown'),
        frictionScore: Math.max(0, Math.min(10, Number(p.frictionScore) || 0)),
        tone: p.tone || 'neutral',
        escalationTrigger: p.escalationTrigger ? String(p.escalationTrigger) : undefined,
        confidence: typeof p.confidence === 'number' ? p.confidence : 0.8,
        sourceCitation: String(p.sourceCitation || ''),
      }))
    } catch (err: any) {
      console.error('[RelationshipMediator] Extraction failed:', err.message)
      return []
    }
  }
}
