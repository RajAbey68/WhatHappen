import { ForensicReconciler, BookLetsExpenseRecord } from '@/lib/forensics/reconciler'
import { FinancialMention } from '@/lib/swarm/types'
import { RawChatMessage } from '@/lib/rag/sessionizer'
import { BookLetsIntentBridge } from '@/lib/integrations/booklets/intent-bridge'

describe('ForensicReconciler & BookLetsIntentBridge', () => {
  const projectId = '7ba94f4c-fb4e-4ee4-bc90-19984c5a8b59'

  const rawCorpus = new Map<string, RawChatMessage>([
    [
      'msg_1',
      {
        id: 'msg_1',
        sender: 'Sudath Manager Channa',
        timestamp: '2026-05-02T10:00:00.000Z',
        message: 'Paid 50000 LKR for lawn repair float to Channa today'
      }
    ],
    [
      'msg_2',
      {
        id: 'msg_2',
        sender: 'Indrajith Accountant Sheran Atapattu',
        timestamp: '2026-05-05T14:30:00.000Z',
        message: 'Disbursed 25000 LKR for generator diesel delivery'
      }
    ]
  ])

  const chatClaims: FinancialMention[] = [
    {
      amount: 50000,
      currency: 'LKR',
      sender: 'Sudath Manager Channa',
      timestampIso: '2026-05-02T10:00:00.000Z',
      sourceCitation: 'Paid 50000 LKR for lawn repair float to Channa today',
      messageId: 'msg_1',
      confidence: 0.95
    },
    {
      amount: 25000,
      currency: 'LKR',
      sender: 'Indrajith Accountant Sheran Atapattu',
      timestampIso: '2026-05-05T14:30:00.000Z',
      sourceCitation: 'Disbursed 25000 LKR for generator diesel delivery',
      messageId: 'msg_2',
      confidence: 0.92
    }
  ]

  const bookletsLedger: BookLetsExpenseRecord[] = [
    // Matches msg_1 within 1 day
    {
      id: 'exp_booklets_001',
      amount: 50000,
      currency: 'LKR',
      vendorName: 'Channa Lawn Chamila',
      date: '2026-05-03T09:00:00.000Z',
      description: 'Lawn maintenance float payment'
    },
    // Orphan BookLets expense (no chat mention)
    {
      id: 'exp_booklets_orphan',
      amount: 12000,
      currency: 'LKR',
      vendorName: 'Local Hardware',
      date: '2026-05-04T12:00:00.000Z',
      description: 'Plumbing fittings'
    }
  ]

  it('correctly categorizes MATCHED, UNRECORDED_EXPENSE, and ORPHAN_ENTRY', () => {
    const report = ForensicReconciler.reconcile(projectId, chatClaims, bookletsLedger, rawCorpus, 3)

    expect(report.projectId).toBe(projectId)
    expect(report.matchedCount).toBe(1)
    expect(report.unrecordedCount).toBe(1)
    expect(report.orphanCount).toBe(1)

    const matched = report.transactions.find(t => t.status === 'MATCHED')
    expect(matched).toBeDefined()
    expect(matched?.bookletsRecord?.id).toBe('exp_booklets_001')
    expect(matched?.chatClaim?.amount).toBe(50000)

    const unrecorded = report.transactions.find(t => t.status === 'UNRECORDED_EXPENSE')
    expect(unrecorded).toBeDefined()
    expect(unrecorded?.chatClaim?.amount).toBe(25000)
    expect(unrecorded?.verifiedCitation).toBe('Disbursed 25000 LKR for generator diesel delivery')

    const orphan = report.transactions.find(t => t.status === 'ORPHAN_ENTRY')
    expect(orphan).toBeDefined()
    expect(orphan?.bookletsRecord?.id).toBe('exp_booklets_orphan')
  })

  it('generates ActionIntentPayloads for unrecorded claims via BookLetsIntentBridge', () => {
    const report = ForensicReconciler.reconcile(projectId, chatClaims, bookletsLedger, rawCorpus, 3)
    const unrecordedTxs = report.transactions.filter(t => t.status === 'UNRECORDED_EXPENSE')

    const intents = BookLetsIntentBridge.batchCreateIntents(unrecordedTxs, 'org_kolake_villa')
    expect(intents.length).toBe(1)

    const intent = intents[0]
    expect(intent.action).toBe('EXPENSE_RECORD_INTENT')
    expect(intent.makerIdentity).toBe('WhatHappen:ForensicAnalyst')
    expect(intent.payload.amount).toBe(25000)
    expect(intent.payload.currency).toBe('LKR')
    expect(intent.payload.sourceCitation).toBe('Disbursed 25000 LKR for generator diesel delivery')
  })
})
