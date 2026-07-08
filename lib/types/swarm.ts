import { z } from 'zod'

// Ensure structured output from Map agents
export const MapResultSchema = z.object({
  extractedData: z.string().min(1, 'Map output cannot be empty')
})

export type MapResult = z.infer<typeof MapResultSchema>

// Structured outputs for financial forensic analysis
export const ReduceForensicSchema = z.object({
  totalFinancialMentions: z.number().default(0),
  uniqueAmounts: z.number().default(0),
  totalValue: z.number().default(0),
  averageAmount: z.number().default(0),
  keyTerms: z.array(z.string()).default([]),
  mentions: z.array(z.object({
    messageId: z.any().optional(),
    sender: z.string().optional(),
    timestamp: z.string().optional(),
    amounts: z.array(z.string()).optional(),
    payments: z.array(z.string()).optional(),
    terms: z.array(z.string()).optional(),
    fullMessage: z.string().optional()
  })).default([]),
  amounts: z.array(z.number()).default([])
}).passthrough()

export type ReduceForensic = z.infer<typeof ReduceForensicSchema>

export const SwarmConfigSchema = z.object({
  timeoutMs: z.number().default(30000)
})

export type SwarmConfig = z.infer<typeof SwarmConfigSchema>
