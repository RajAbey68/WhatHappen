import { ForensicAnalyst } from '@/lib/swarm/experts/ForensicAnalyst'
import { RelationshipMediator } from '@/lib/swarm/experts/RelationshipMediator'
import { ChronologyMapper } from '@/lib/swarm/experts/ChronologyMapper'
import { ChatMessage } from '@/lib/swarm/SwarmManager'
import * as llm from '@/lib/llm'

jest.mock('@/lib/llm', () => ({
  generateWithFallback: jest.fn()
}))

describe('MoE Swarm Experts & Epistemic Tiers', () => {
  const sampleMessages: ChatMessage[] = [
    {
      sender: 'Alice',
      message: 'Can you wire the £4,500 deposit for the villa by next Tuesday?',
      timestamp: '2026-08-10T10:00:00Z',
    },
    {
      sender: 'Bob',
      message: 'I thought we agreed on £3,000 upfront and the rest upon arrival! This is completely unacceptable.',
      timestamp: '2026-08-10T10:15:00Z',
    },
    {
      sender: 'Alice',
      message: 'Let us meet in the middle. Pay £3,750 on August 15th and we will confirm the booking.',
      timestamp: '2026-08-10T10:30:00Z',
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('ForensicAnalyst extracts financial mentions with citations and confidence', async () => {
    jest.spyOn(llm, 'generateWithFallback').mockResolvedValueOnce({
      content: JSON.stringify({
        transactions: [
          {
            messageId: '0',
            sender: 'Alice',
            timestampIso: '2026-08-10T10:00:00Z',
            amount: 4500,
            currency: 'GBP',
            transactionType: 'payment',
            confidence: 0.98,
            sourceCitation: 'wire the £4,500 deposit'
          },
          {
            messageId: '1',
            sender: 'Bob',
            timestampIso: '2026-08-10T10:15:00Z',
            amount: 3000,
            currency: 'GBP',
            transactionType: 'debt_obligation',
            confidence: 0.95,
            sourceCitation: 'agreed on £3,000 upfront'
          }
        ]
      })
    } as any)

    const results = await ForensicAnalyst.analyze(sampleMessages)
    expect(results).toHaveLength(2)
    expect(results[0].amount).toBe(4500)
    expect(results[0].currency).toBe('GBP')
    expect(results[0].confidence).toBeGreaterThanOrEqual(0.9)
    expect(results[0].sourceCitation).toContain('£4,500')
  })

  test('RelationshipMediator assesses friction score and tone progression', async () => {
    jest.spyOn(llm, 'generateWithFallback').mockResolvedValueOnce({
      content: JSON.stringify({
        frictionPoints: [
          {
            timestampIso: '2026-08-10T10:15:00Z',
            sender: 'Bob',
            frictionScore: 8,
            tone: 'confrontational',
            escalationTrigger: 'dispute over deposit amount',
            confidence: 0.92,
            sourceCitation: 'This is completely unacceptable.'
          },
          {
            timestampIso: '2026-08-10T10:30:00Z',
            sender: 'Alice',
            frictionScore: 3,
            tone: 'conciliatory',
            escalationTrigger: 'compromise proposal',
            confidence: 0.88,
            sourceCitation: 'Let us meet in the middle.'
          }
        ]
      })
    } as any)

    const results = await RelationshipMediator.analyze(sampleMessages)
    expect(results).toHaveLength(2)
    expect(results[0].frictionScore).toBe(8)
    expect(results[0].tone).toBe('confrontational')
    expect(results[1].tone).toBe('conciliatory')
  })

  test('ChronologyMapper normalizes relative dates into strict ISO milestones', async () => {
    jest.spyOn(llm, 'generateWithFallback').mockResolvedValueOnce({
      content: JSON.stringify({
        milestones: [
          {
            normalizedIsoDate: '2026-08-15T00:00:00Z',
            rawDateMention: 'August 15th',
            eventDescription: 'Deposit payment due date',
            confidence: 0.95,
            sourceMessageId: '2',
            temporalOrderingCertainty: 'exact'
          }
        ]
      })
    } as any)

    const results = await ChronologyMapper.analyze(sampleMessages)
    expect(results).toHaveLength(1)
    expect(results[0].normalizedIsoDate).toBe('2026-08-15T00:00:00Z')
    expect(results[0].temporalOrderingCertainty).toBe('exact')
  })
})
