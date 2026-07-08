import { z } from 'zod'

export const AgentConfigSchema = z.object({
  expertId: z.enum(['GENERAL_ANALYST', 'COUNTERPARTY_EXPERT', 'LEGAL_COUNSEL', 'FINANCIAL_AUDITOR']),
  jurisdiction: z.enum(['UK', 'EU', 'US', 'GLOBAL']),
  regulator: z.enum(['NONE', 'SRA', 'FCA', 'HIPAA', 'GDPR']),
})

export type AgentConfig = z.infer<typeof AgentConfigSchema>

export interface Agent {
  id: string
  name: string
  description?: string
  createdAt: string
}

export interface AgentVersion {
  id: string
  agentId: string
  version: number
  config: AgentConfig
  createdAt: string
}

export interface ProjectAgent {
  projectId: string
  agentVersionId: string
}

export interface AuditLog {
  id: string
  projectId: string
  agentId: string
  inputHash: string
  outputHash: string
  complianceCheck: string
  model: string
  tokensUsed: number
  latencyMs: number
  createdAt: string
}
