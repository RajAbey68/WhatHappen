import { BM25Index } from '@/lib/rag/bm25'
import { CitationGate } from '@/lib/forensics/citation-gate'
import { ForensicReconciler, BookLetsExpenseRecord } from '@/lib/forensics/reconciler'
import { BookLetsIntentBridge } from '@/lib/integrations/booklets/intent-bridge'
import { FinancialMention } from '@/lib/swarm/types'
import { RawChatMessage, SessionWindow } from '@/lib/rag/sessionizer'

describe('Operational Truth & BookLets Integration Test Harness', () => {
  describe('BM25 In-Memory Lexical Search', () => {
    it('ranks relevant sessions containing exact keywords in sub-5ms', () => {
      const mockSessions: SessionWindow[] = [
        {
          sessionId: 'sess_1',
          startTime: '2026-05-10T10:00:00Z',
          endTime: '2026-05-10T10:30:00Z',
          participants: ['Sudath', 'Indrajith'],
          messageCount: 2,
          messageIds: ['1', '2'],
          formattedContent: '[2026-05-10] Indrajith: Sent 50k cash float to Sudath for materials.',
          messages: []
        },
        {
          sessionId: 'sess_2',
          startTime: '2026-06-01T12:00:00Z',
          endTime: '2026-06-01T12:15:00Z',
          participants: ['Amir', 'Rajiv'],
          messageCount: 1,
          messageIds: ['3'],
          formattedContent: '[2026-06-01] Amir: Pool chemicals delivered today.',
          messages: []
        }
      ]

      const bm25 = new BM25Index()
      bm25.buildIndex(mockSessions)

      const results = bm25.search('50k float Sudath')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].sessionId).toBe('sess_1')
    })
  })

  describe('CitationGate (Deterministic Anti-Hallucination Barrier)', () => {
    const rawCorpus = new Map<string, RawChatMessage>()
    rawCorpus.set('msg_101', {
      id: 'msg_101',
      sender: 'Indrajith Accountant',
      timestamp: '2026-05-10T11:20:00Z',
      message: 'Transfer completed. Sent 50,000 LKR float to Channa for cement.'
    })

    it('verifies exact factual citations with matching sender and amount', () => {
      const validClaim: FinancialMention = {
        messageId: 'msg_101',
        sender: 'Indrajith Accountant',
        timestampIso: '2026-05-10T11:20:00Z',
        amount: 50000,
        currency: 'LKR',
        transactionType: 'transfer',
        confidence: 0.95,
        sourceCitation: 'Sent 50,000 LKR float to Channa'
      }

      const check = CitationGate.verify(validClaim, rawCorpus)
      expect(check.verified).toBe(true)
    })

    it('hard-rejects hallucinated or uncorroborated amounts', () => {
      const hallucinatedAmount: FinancialMention = {
        messageId: 'msg_101',
        sender: 'Indrajith Accountant',
        timestampIso: '2026-05-10T11:20:00Z',
        amount: 999999, // Fake amount
        currency: 'LKR',
        transactionType: 'transfer',
        confidence: 0.9,
        sourceCitation: 'Sent 50,000 LKR float to Channa'
      }

      const check = CitationGate.verify(hallucinatedAmount, rawCorpus)
      expect(check.verified).toBe(false)
      expect(check.error).toContain('Uncorroborated amount')
    })

    it('hard-rejects fabricated source citations not found in raw text', () => {
      const fabricatedQuote: FinancialMention = {
        messageId: 'msg_101',
        sender: 'Indrajith Accountant',
        timestampIso: '2026-05-10T11:20:00Z',
        amount: 50000,
        currency: 'LKR',
        transactionType: 'transfer',
        confidence: 0.9,
        sourceCitation: 'This sentence was hallucinated by an LLM and does not exist'
      }

      const check = CitationGate.verify(fabricatedQuote, rawCorpus)
      expect(check.verified).toBe(false)
      expect(check.error).toContain('Fabricated quote')
    })
  })

  describe('ForensicReconciler & ActionIntent Bridge', () => {
    const rawCorpus = new Map<string, RawChatMessage>()
    rawCorpus.set('m_1', {
      id: 'm_1',
      sender: 'Indrajith Accountant',
      timestamp: '2026-05-10T10:00:00Z',
      message: 'Paid 15000 for lawn mower repair.'
    })
    rawCorpus.set('m_2', {
      id: 'm_2',
      sender: 'Sudath Manager Channa',
      timestamp: '2026-05-12T15:00:00Z',
      message: 'Received 50000 cash advance for paint.'
    })

    const chatClaims: FinancialMention[] = [
      {
        messageId: 'm_1',
        sender: 'Indrajith Accountant',
        timestampIso: '2026-05-10T10:00:00Z',
        amount: 15000,
        currency: 'LKR',
        transactionType: 'payment',
        confidence: 0.95,
        sourceCitation: 'Paid 15000 for lawn mower repair'
      },
      {
        messageId: 'm_2',
        sender: 'Sudath Manager Channa',
        timestampIso: '2026-05-12T15:00:00Z',
        amount: 50000,
        currency: 'LKR',
        transactionType: 'transfer',
        confidence: 0.92,
        sourceCitation: 'Received 50000 cash advance for paint'
      }
    ]

    const bookletsLedger: BookLetsExpenseRecord[] = [
      {
        id: 'exp_101',
        amount: 15000,
        currency: 'LKR',
        date: '2026-05-10T14:00:00Z',
        vendorName: 'Lawn Care Service',
        description: 'Mower repairs'
      }
    ]

    it('correctly reconciles matched and unrecorded cash floats', () => {
      const report = ForensicReconciler.reconcile(
        'proj_test',
        chatClaims,
        bookletsLedger,
        rawCorpus,
        2
      )

      expect(report.matchedCount).toBe(1)
      expect(report.unrecordedCount).toBe(1)
      expect(report.totalUnrecordedValue).toBe(50000)

      const unrecorded = report.transactions.filter(t => t.status === 'UNRECORDED_EXPENSE')
      const intentPayloads = BookLetsIntentBridge.batchCreateIntents(unrecorded, 'org_kolake')

      expect(intentPayloads.length).toBe(1)
      expect(intentPayloads[0].action).toBe('EXPENSE_RECORD_INTENT')
      expect(intentPayloads[0].payload.amount).toBe(50000)
      expect(intentPayloads[0].payload.sourceCitation).toBe('Received 50000 cash advance for paint')
    })
  })
})
