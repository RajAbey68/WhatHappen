import { z } from 'zod'

/**
 * Epistemic Schema Tiers (Per Claude Fable 5.1 & GPT-5.6 Architectural Review)
 * 
 * Strict separation between:
 * Tier 1: Source Artifacts (Raw bytes, immutable hashes)
 * Tier 2: Extracted Deterministic Facts (Timestamps, senders)
 * Tier 3: Probabilistic AI Inferences (Sentiment scores, estimated debts, chronology projections)
 */

// Tier 1: Source Artifact Verification
export const SourceArtifactSchema = z.object({
  sourceId: z.string(),
  sha256Hash: z.string(),
  receivedAt: z.string(),
  byteSize: z.number(),
  sourceType: z.enum(['whatsapp_zip', 'raw_txt', 'gcs_blob']),
})
export type SourceArtifact = z.infer<typeof SourceArtifactSchema>

// Tier 2: Extracted Deterministic Fact
export const DeterministicFactSchema = z.object({
  messageId: z.string(),
  timestampIso: z.string(),
  sender: z.string(),
  rawByteHash: z.string(),
})
export type DeterministicFact = z.infer<typeof DeterministicFactSchema>

// Tier 3: Probabilistic Financial Mention
export const FinancialMentionSchema = z.object({
  messageId: z.string(),
  sender: z.string(),
  timestampIso: z.string(),
  amount: z.number(),
  currency: z.string().default('GBP'),
  transactionType: z.enum(['payment', 'transfer', 'debt_obligation', 'dispute', 'unspecified']),
  confidence: z.number().min(0).max(1),
  sourceCitation: z.string(), // Quote/snippet used as proof
})
export type FinancialMention = z.infer<typeof FinancialMentionSchema>

// Tier 3: Probabilistic Sentiment Arc Point
export const SentimentPointSchema = z.object({
  timestampIso: z.string(),
  sender: z.string(),
  frictionScore: z.number().min(0).max(10), // 0 = peaceful, 10 = acute dispute
  tone: z.enum(['cooperative', 'neutral', 'passive_aggressive', 'confrontational', 'conciliatory']),
  escalationTrigger: z.string().optional(),
  confidence: z.number().min(0).max(1),
  sourceCitation: z.string(),
})
export type SentimentPoint = z.infer<typeof SentimentPointSchema>

// Tier 3: Chronology Event Mapping
export const ChronologyEventSchema = z.object({
  normalizedIsoDate: z.string(),
  rawDateMention: z.string(),
  eventDescription: z.string(),
  confidence: z.number().min(0).max(1),
  sourceMessageId: z.string(),
  temporalOrderingCertainty: z.enum(['exact', 'inferred', 'approximate']),
})
export type ChronologyEvent = z.infer<typeof ChronologyEventSchema>

// Aggregated MoE Swarm Dossier
export const SwarmDossierSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  batchHash: z.string(),
  generatedAt: z.string(),
  modelVersions: z.record(z.string()),
  tier1: z.object({
    sourceArtifactHash: z.string(),
    totalMessages: z.number(),
  }),
  tier2: z.object({
    participantIdentities: z.array(z.string()),
    startTimeIso: z.string(),
    endTimeIso: z.string(),
  }),
  tier3: z.object({
    financialLedger: z.array(FinancialMentionSchema),
    sentimentArc: z.array(SentimentPointSchema),
    chronology: z.array(ChronologyEventSchema),
    executiveSynthesisMarkdown: z.string(),
  }),
})
export type SwarmDossier = z.infer<typeof SwarmDossierSchema>
