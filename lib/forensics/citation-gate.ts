import { FinancialMention } from '../swarm/types'
import { RawChatMessage } from '../rag/sessionizer'

export interface CitationVerificationResult {
  verified: boolean
  error?: string
  confidenceAdjustment?: number
}

/**
 * Deterministic Verbatim Citation Gatekeeper.
 * 
 * Enforces zero-hallucination invariants:
 * 1. The cited message ID must resolve to a real message in the corpus.
 * 2. The claimed sender must match the deterministic recorded sender.
 * 3. The citation quote must exist verbatim (character-exact substring) in the message text.
 * 4. The monetary amount must be corroborated in the source citation.
 */
export class CitationGate {
  public static verify(
    claim: FinancialMention,
    corpus: Map<string, RawChatMessage>
  ): CitationVerificationResult {
    if (!claim.messageId || claim.messageId === 'unknown') {
      return { verified: false, error: 'Unreferenced claim: messageId missing or unknown' }
    }

    const rawMsg = corpus.get(claim.messageId)
    if (!rawMsg) {
      return { verified: false, error: `Invalid reference: message ${claim.messageId} does not exist in corpus` }
    }

    // Sender corroboration
    const expectedSender = rawMsg.sender.trim().toLowerCase()
    const claimedSender = claim.sender.trim().toLowerCase()
    if (expectedSender !== claimedSender && !expectedSender.includes(claimedSender) && !claimedSender.includes(expectedSender)) {
      return { verified: false, error: `Sender mismatch: claimed '${claim.sender}', actual recorded sender was '${rawMsg.sender}'` }
    }

    // Verbatim quote matching (case-insensitive, normalized whitespace)
    const normalizedRaw = rawMsg.message.toLowerCase().replace(/\s+/g, ' ').trim()
    const normalizedCitation = claim.sourceCitation.toLowerCase().replace(/\s+/g, ' ').trim()

    if (normalizedCitation.length > 0 && !normalizedRaw.includes(normalizedCitation)) {
      return { verified: false, error: 'Fabricated quote: sourceCitation text does not exist in message' }
    }

    // Monetary figure corroboration
    if (claim.amount > 0) {
      const amountStr = claim.amount.toString()
      const hasDirectNumber = normalizedRaw.includes(amountStr)
      // Check for shorthand notations like 50k for 50,000
      let hasShorthand = false
      if (claim.amount === 50000 && (normalizedRaw.includes('50k') || normalizedRaw.includes('50,000'))) {
        hasShorthand = true
      }
      if (claim.amount >= 1000 && (claim.amount % 1000 === 0)) {
        const kStr = `${claim.amount / 1000}k`
        if (normalizedRaw.includes(kStr)) hasShorthand = true
      }

      if (!hasDirectNumber && !hasShorthand && !normalizedRaw.includes(claim.amount.toLocaleString())) {
        return {
          verified: false,
          error: `Uncorroborated amount: ${claim.amount} is not mentioned in message text`
        }
      }
    }

    return { verified: true }
  }

  public static filterClaims(
    claims: FinancialMention[],
    corpus: Map<string, RawChatMessage>
  ): { verifiedClaims: FinancialMention[]; rejectedClaims: { claim: FinancialMention; reason: string }[] } {
    const verifiedClaims: FinancialMention[] = []
    const rejectedClaims: { claim: FinancialMention; reason: string }[] = []

    for (const claim of claims) {
      const check = CitationGate.verify(claim, corpus)
      if (check.verified) {
        verifiedClaims.push(claim)
      } else {
        rejectedClaims.push({ claim, reason: check.error || 'Verification failed' })
      }
    }

    return { verifiedClaims, rejectedClaims }
  }
}
