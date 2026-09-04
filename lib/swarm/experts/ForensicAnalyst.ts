import { generateWithFallback } from '../../llm'
import { FinancialMention } from '../types'
import { ChatMessage } from '../SwarmManager'

export class ForensicAnalyst {
  public static async analyze(
    messages: ChatMessage[],
    options?: { signal?: AbortSignal }
  ): Promise<FinancialMention[]> {
    if (messages.length === 0) return []

    const prompt = `You are an expert Forensic Accounting Agent. Analyze the following WhatsApp messages and extract all financial transactions, payments, loans, bank transfers, and debt obligations.

STRICT INVARIANTS:
1. Every item MUST have an exact source citation (quote from text).
2. Assign a confidence score from 0.0 to 1.0.
3. Categorize into: payment, transfer, debt_obligation, dispute, or unspecified.
4. Output JSON in the format:
{
  "transactions": [
    {
      "messageId": "msg-index",
      "sender": "sender_name",
      "timestampIso": "ISO timestamp or original timestamp",
      "amount": 100.0,
      "currency": "GBP|USD|EUR|LKR",
      "transactionType": "payment|transfer|debt_obligation|dispute|unspecified",
      "confidence": 0.95,
      "sourceCitation": "exact quotation from text"
    }
  ]
}

MESSAGES:
${messages.map((m, i) => `[${i}] [${m.timestamp}] ${m.sender}: ${m.message}`).join('\n')}`

    try {
      const response = await generateWithFallback([
        { role: 'system', content: 'You are a certified forensic accountant analyzing digital evidence. Respond strictly in valid JSON.' },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.1,
        response_format: { type: 'json_object' },
        signal: options?.signal
      } as any)

      if (!response || !response.content) return []
      const parsed = JSON.parse(response.content)
      return (parsed.transactions || []).map((t: any) => ({
        messageId: String(t.messageId || 'unknown'),
        sender: String(t.sender || 'unknown'),
        timestampIso: String(t.timestampIso || new Date().toISOString()),
        amount: Number(t.amount) || 0,
        currency: String(t.currency || 'GBP'),
        transactionType: t.transactionType || 'unspecified',
        confidence: typeof t.confidence === 'number' ? t.confidence : 0.8,
        sourceCitation: String(t.sourceCitation || ''),
      }))
    } catch (err: any) {
      console.error('[ForensicAnalyst] Extraction failed:', err.message)
      return []
    }
  }
}
