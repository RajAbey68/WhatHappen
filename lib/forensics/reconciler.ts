import { FinancialMention } from '../swarm/types'
import { CitationGate } from './citation-gate'
import { RawChatMessage } from '../rag/sessionizer'

export interface BookLetsExpenseRecord {
  id: string
  amount: number
  currency: string
  vendorName?: string
  date: string
  description?: string
}

export interface ReconciledTransaction {
  status: 'MATCHED' | 'UNRECORDED_EXPENSE' | 'ORPHAN_ENTRY'
  chatClaim?: FinancialMention
  bookletsRecord?: BookLetsExpenseRecord
  discrepancyNotes?: string
  verifiedCitation?: string
}

export interface ReconciliationReport {
  projectId: string
  generatedAt: string
  totalChatClaims: number
  totalBookLetsEntries: number
  matchedCount: number
  unrecordedCount: number
  orphanCount: number
  totalUnrecordedValue: number
  transactions: ReconciledTransaction[]
}

/**
 * Reconciles unstructured WhatsApp chat claims against BookLets double-entry ledger rows.
 */
export class ForensicReconciler {
  public static reconcile(
    projectId: string,
    chatClaims: FinancialMention[],
    bookletsExpenses: BookLetsExpenseRecord[],
    rawCorpus: Map<string, RawChatMessage>,
    toleranceDays: number = 3
  ): ReconciliationReport {
    // 1. Pass all chat claims through deterministic CitationGate
    const { verifiedClaims } = CitationGate.filterClaims(chatClaims, rawCorpus)

    const transactions: ReconciledTransaction[] = []
    const matchedBookletIds = new Set<string>()

    // 2. Match verified claims against BookLets entries
    for (const claim of verifiedClaims) {
      const claimDate = new Date(claim.timestampIso).getTime()
      const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000

      // Find potential matches by amount & temporal window
      const matchedExpense = bookletsExpenses.find(exp => {
        if (matchedBookletIds.has(exp.id)) return false
        
        const expDate = new Date(exp.date).getTime()
        const dateDiff = Math.abs(claimDate - expDate)
        const amountMatch = Math.abs(exp.amount - claim.amount) < 0.01

        return amountMatch && dateDiff <= toleranceMs
      })

      if (matchedExpense) {
        matchedBookletIds.add(matchedExpense.id)
        transactions.push({
          status: 'MATCHED',
          chatClaim: claim,
          bookletsRecord: matchedExpense,
          verifiedCitation: claim.sourceCitation,
          discrepancyNotes: 'Corroborated by WhatsApp conversation with verbatim citation.'
        })
      } else {
        transactions.push({
          status: 'UNRECORDED_EXPENSE',
          chatClaim: claim,
          verifiedCitation: claim.sourceCitation,
          discrepancyNotes: 'Disbursement/advance mentioned in chat, but no matching BookLets ledger entry found in date window.'
        })
      }
    }

    // 3. Identify Orphan BookLets entries (entries without chat mentions)
    for (const exp of bookletsExpenses) {
      if (!matchedBookletIds.has(exp.id)) {
        transactions.push({
          status: 'ORPHAN_ENTRY',
          bookletsRecord: exp,
          discrepancyNotes: 'BookLets expense recorded without matching WhatsApp confirmation.'
        })
      }
    }

    const matchedCount = transactions.filter(t => t.status === 'MATCHED').length
    const unrecordedCount = transactions.filter(t => t.status === 'UNRECORDED_EXPENSE').length
    const orphanCount = transactions.filter(t => t.status === 'ORPHAN_ENTRY').length
    const totalUnrecordedValue = transactions
      .filter(t => t.status === 'UNRECORDED_EXPENSE' && t.chatClaim)
      .reduce((sum, t) => sum + (t.chatClaim?.amount || 0), 0)

    return {
      projectId,
      generatedAt: new Date().toISOString(),
      totalChatClaims: verifiedClaims.length,
      totalBookLetsEntries: bookletsExpenses.length,
      matchedCount,
      unrecordedCount,
      orphanCount,
      totalUnrecordedValue,
      transactions
    }
  }
}
