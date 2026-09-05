import { RawChatMessage } from '../rag/sessionizer'

export interface ParsedCitation {
  rawLine: string
  timestamp?: string
  sender?: string
  quote: string
}

export interface VerificationAuditReport {
  compliant: boolean
  totalCitationsFound: number
  validCitationsCount: number
  hallucinatedCount: number
  hallucinations: {
    citation: ParsedCitation
    reason: string
  }[]
  tamperScore: number // 0.0 = completely fabricated, 1.0 = 100% verified ground-truth
}

/**
 * Inherent Runtime Verification Barrier (The Output Guardrail).
 * Intercepts LLM outputs before they leave the API to ensure no citations are fabricated.
 */
export class OperationalTruthHarness {
  /**
   * Parse citations from Section 1 of the CoT response:
   * Format: - [Timestamp] Sender: "Exact verbatim message text"
   */
  public static parseCitations(responseText: string): ParsedCitation[] {
    const citations: ParsedCitation[] = []
    const lines = responseText.split('\n')
    
    // Regex matching standard forensic citation pattern
    // e.g.: - [2026-05-10T10:00:00Z] Indrajith: "Sent 50k cash float"
    const citationRegex = /-\s*\[(.*?)\]\s*(.*?):\s*["“](.*?)["”]/

    for (const line of lines) {
      const match = line.match(citationRegex)
      if (match) {
        citations.push({
          rawLine: line.trim(),
          timestamp: match[1]?.trim(),
          sender: match[2]?.trim(),
          quote: match[3]?.trim()
        })
      }
    }

    return citations
  }

  /**
   * Evaluates response compliance against the actual verified message corpus.
   */
  public static verifyResponse(
    responseText: string,
    rawCorpus: RawChatMessage[]
  ): VerificationAuditReport {
    const citations = OperationalTruthHarness.parseCitations(responseText)
    
    // If no citations are present, check if it explicitly stated "No record found"
    if (citations.length === 0) {
      const statedNoRecord = responseText.toLowerCase().includes('no record found') ||
                             responseText.toLowerCase().includes('sandbox mode')
      return {
        compliant: true,
        totalCitationsFound: 0,
        validCitationsCount: 0,
        hallucinatedCount: 0,
        hallucinations: [],
        tamperScore: statedNoRecord ? 1.0 : 0.8
      }
    }

    const corpusTextMap = new Map<string, string>()
    for (const msg of rawCorpus) {
      const normMsg = msg.message.toLowerCase().replace(/\s+/g, ' ').trim()
      const normSender = msg.sender.toLowerCase().trim()
      corpusTextMap.set(normMsg, normSender)
    }

    const hallucinations: { citation: ParsedCitation; reason: string }[] = []
    let validCount = 0

    for (const citation of citations) {
      const normQuote = citation.quote.toLowerCase().replace(/\s+/g, ' ').trim()
      
      // Check if quote exists verbatim anywhere in the raw corpus
      let foundInCorpus = false
      let senderMatched = false

      for (const [msgText, recordedSender] of corpusTextMap.entries()) {
        if (msgText.includes(normQuote)) {
          foundInCorpus = true
          if (!citation.sender || recordedSender.includes(citation.sender.toLowerCase()) || citation.sender.toLowerCase().includes(recordedSender)) {
            senderMatched = true
            break
          }
        }
      }

      if (!foundInCorpus) {
        hallucinations.push({
          citation,
          reason: 'Fabricated quote: Text does not exist anywhere in the message transcript.'
        })
      } else if (!senderMatched) {
        hallucinations.push({
          citation,
          reason: `Sender misattribution: Quote exists, but was not spoken by claimed sender '${citation.sender}'.`
        })
      } else {
        validCount++
      }
    }

    const tamperScore = citations.length > 0 ? validCount / citations.length : 1.0
    const compliant = hallucinations.length === 0

    return {
      compliant,
      totalCitationsFound: citations.length,
      validCitationsCount: validCount,
      hallucinatedCount: hallucinations.length,
      hallucinations,
      tamperScore
    }
  }

  /**
   * Sanitizes non-compliant responses before reaching user.
   * Redacts unverified quotes and appends an explicit audit flag.
   */
  public static enforce(
    responseText: string,
    rawCorpus: RawChatMessage[]
  ): { sanitizedText: string; audit: VerificationAuditReport } {
    const audit = OperationalTruthHarness.verifyResponse(responseText, rawCorpus)
    if (audit.compliant) {
      return { sanitizedText: responseText, audit }
    }

    let sanitized = responseText
    for (const h of audit.hallucinations) {
      sanitized = sanitized.replace(
        h.citation.rawLine,
        `⚠️ [REDACTED BY OPERATIONAL HARNESS - UNCORROBORATED CLAIM: "${h.citation.quote}"]`
      )
    }

    sanitized += `\n\n> 🛡️ **Operational Truth Audit Flag:** ${audit.hallucinatedCount} citation(s) failed verbatim corroboration against the source transcript and were redacted.`

    return { sanitizedText: sanitized, audit }
  }
}
