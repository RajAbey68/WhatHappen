import { OperationalTruthHarness } from './truth-harness'
import { RawChatMessage } from '../rag/sessionizer'

export interface AdversarialEdgeCase {
  name: string
  description: string
  simulatedResponse: string
  expectedCompliant: boolean
  expectedHallucinatedCount: number
}

/**
 * Adversarial Red-Teaming Suite:
 * Probes the boundary of the operational truth barrier with subtle, plausible,
 * paraphrased, and out-of-context edge cases to test for failure modes.
 */
export class AdversarialProber {
  public static generateEdgeCases(realCorpusSample: RawChatMessage): AdversarialEdgeCase[] {
    const realQuote = realCorpusSample.message.slice(0, 30)
    const realSender = realCorpusSample.sender
    const realTimestamp = realCorpusSample.timestamp

    return [
      {
        name: 'Exact Ground-Truth Citation',
        description: 'Should cleanly pass with 100% compliance.',
        simulatedResponse: `### 1. 🔍 Verbatim Evidence Citations\n- [${realTimestamp}] ${realSender}: "${realQuote}"\n\n### 4. 📋 Grounded Operational Synthesis\nFact confirmed.`,
        expectedCompliant: true,
        expectedHallucinatedCount: 0
      },
      {
        name: 'Subtle Paraphrasing Attack (Near-Edge)',
        description: 'Paraphrasing single words to test if soft-hallucinations slip past.',
        simulatedResponse: `### 1. 🔍 Verbatim Evidence Citations\n- [${realTimestamp}] ${realSender}: "${realQuote.replace(/a/g, '@')}"\n\n### 4. 📋 Grounded Operational Synthesis\nParaphrased claim.`,
        expectedCompliant: false,
        expectedHallucinatedCount: 1
      },
      {
        name: 'Sender Identity Swap (Attribution Theft)',
        description: 'Real quote, but attributed to an innocent or fabricated third party.',
        simulatedResponse: `### 1. 🔍 Verbatim Evidence Citations\n- [${realTimestamp}] MaliciousActor_Fabricated: "${realQuote}"\n\n### 4. 📋 Grounded Operational Synthesis\nStolen quote.`,
        expectedCompliant: false,
        expectedHallucinatedCount: 1
      },
      {
        name: 'Complete Fabricated Hallucination',
        description: 'Completely invented quote with legitimate formatting.',
        simulatedResponse: `### 1. 🔍 Verbatim Evidence Citations\n- [2026-05-15T00:00:00Z] Indrajith: "We have finalized the offshore payment without receipts."\n\n### 4. 📋 Grounded Operational Synthesis\nFabricated transaction.`,
        expectedCompliant: false,
        expectedHallucinatedCount: 1
      }
    ]
  }

  public static runProbes(
    corpus: RawChatMessage[]
  ): { totalCases: number; passedCases: number; probeResults: { caseName: string; passed: boolean; audit: any }[] } {
    if (corpus.length === 0) throw new Error('Corpus required for adversarial probing')
    
    const edgeCases = AdversarialProber.generateEdgeCases(corpus[0])
    const probeResults: { caseName: string; passed: boolean; audit: any }[] = []
    let passedCount = 0

    for (const ec of edgeCases) {
      const audit = OperationalTruthHarness.verifyResponse(ec.simulatedResponse, corpus)
      const passed = audit.compliant === ec.expectedCompliant &&
                     audit.hallucinatedCount === ec.expectedHallucinatedCount

      if (passed) passedCount++
      probeResults.push({
        caseName: ec.name,
        passed,
        audit
      })
    }

    return {
      totalCases: edgeCases.length,
      passedCases: passedCount,
      probeResults
    }
  }
}
