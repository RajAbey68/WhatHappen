import { ReconciledTransaction } from '../forensics/reconciler'

export interface ActionIntentPayload {
  action: 'EXPENSE_RECORD_INTENT'
  organizationId?: string
  makerIdentity: string
  confidence: number
  payload: {
    amount: number
    currency: string
    vendorName?: string
    timestamp: string
    sourceCitation: string
    auditNotes: string
  }
}

/**
 * Bridges WhatHappen forensic discoveries directly to BookLets ActionIntentQueue.
 * 
 * Enforces 4-eyes governance: Claims are staged with citation evidence,
 * requiring an accountant's approval before posting to the general ledger.
 */
export class BookLetsIntentBridge {
  public static createExpenseIntent(
    transaction: ReconciledTransaction,
    organizationId?: string
  ): ActionIntentPayload | null {
    if (transaction.status !== 'UNRECORDED_EXPENSE' || !transaction.chatClaim) {
      return null
    }

    const claim = transaction.chatClaim

    return {
      action: 'EXPENSE_RECORD_INTENT',
      organizationId,
      makerIdentity: 'WhatHappen:ForensicAnalyst',
      confidence: claim.confidence ?? 0.85,
      payload: {
        amount: claim.amount,
        currency: claim.currency || 'LKR',
        vendorName: claim.sender,
        timestamp: claim.timestampIso,
        sourceCitation: claim.sourceCitation,
        auditNotes: transaction.discrepancyNotes || 'Unrecorded cash float or expense detected from WhatsApp forensics.'
      }
    }
  }

  public static batchCreateIntents(
    unrecordedTransactions: ReconciledTransaction[],
    organizationId?: string
  ): ActionIntentPayload[] {
    const intents: ActionIntentPayload[] = []
    for (const t of unrecordedTransactions) {
      const intent = BookLetsIntentBridge.createExpenseIntent(t, organizationId)
      if (intent) intents.push(intent)
    }
    return intents
  }
}
