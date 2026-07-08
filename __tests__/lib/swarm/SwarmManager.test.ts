import { SwarmManager, ChatMessage } from '@/lib/swarm/SwarmManager'
import { AgentConfig } from '@/lib/types/agent'
import * as llmModule from '@/lib/llm'

jest.mock('@/lib/llm', () => ({
  generateWithFallback: jest.fn()
}))

describe('SwarmManager - Happy Path & Resilience Testing', () => {
  const mockConfig: AgentConfig = {
    jurisdiction: 'UK',
    regulator: 'FCA',
    expertId: 'LEGAL_COUNSEL'
  }

  const mockMessages: ChatMessage[] = Array.from({ length: 450 }).map((_, i) => ({
    sender: i % 2 === 0 ? 'Alice' : 'Bob',
    message: `Message ${i}`,
    timestamp: new Date().toISOString()
  }))

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ─── HAPPY PATHS ───────────────────────────────────────────────────────────

  it('should chunk messages correctly during executeMapPhase', async () => {
    const generateWithFallbackMock = llmModule.generateWithFallback as jest.Mock
    generateWithFallbackMock.mockResolvedValue({ content: 'Extracted financial data' })

    const manager = new SwarmManager(mockMessages, mockConfig)
    const drafts = await manager.executeMapPhase()

    expect(generateWithFallbackMock).toHaveBeenCalledTimes(3)
    expect(drafts.financialDrafts).toHaveLength(3)
    expect(drafts.sentimentDrafts).toHaveLength(3)
  })

  it('should pass drafts to executeReducePhase and return synthesis', async () => {
    const generateWithFallbackMock = llmModule.generateWithFallback as jest.Mock
    
    // Satisfy ReduceForensicSchema structure in the happy path
    const validForensicJson = JSON.stringify({
      totalFinancialMentions: 2,
      uniqueAmounts: 1,
      totalValue: 100.0,
      averageAmount: 100.0,
      keyTerms: ['pay', 'owe'],
      mentions: [
        { sender: 'Alice', message: 'I owe you 100 dollars' }
      ],
      amounts: [100.0]
    })

    generateWithFallbackMock
      .mockResolvedValueOnce({ content: validForensicJson }) // Forensic Expert
      .mockResolvedValueOnce({ content: 'Argument escalated at 5pm' }) // Mediator Expert
      .mockResolvedValueOnce({ content: '# Final Executive Report\nAll transactions validated.' }) // Synthesizer

    const manager = new SwarmManager([], mockConfig)
    const result = await manager.executeReducePhase({
      financialDrafts: ['Draft 1', 'Draft 2'],
      sentimentDrafts: ['Sentiment 1', 'Sentiment 2']
    })

    expect(generateWithFallbackMock).toHaveBeenCalledTimes(3)
    expect(result.success).toBe(true)
    expect(result.ledger.totalValue).toBe(100.0)
    expect(result.sentimentTimeline).toBe('Argument escalated at 5pm')
    expect(result.finalSynthesis).toContain('Final Executive Report')
  })

  // ─── RESILIENCE FAILURE STATES ─────────────────────────────────────────────

  it('Test 1: Timeout Handling - should safely abort requests exceeding the timeout budget', async () => {
    const generateWithFallbackMock = llmModule.generateWithFallback as jest.Mock
    
    // Simulate hanging promise
    generateWithFallbackMock.mockImplementation(() => new Promise(() => {
      // Never resolves
    }))

    const manager = new SwarmManager(mockMessages, mockConfig, { timeoutMs: 10 })
    
    // Let real timeout fire automatically (extremely fast - 10ms)
    await expect(manager.executeMapPhase()).rejects.toThrow('LLM Request timed out after 10ms')
  })

  it('Test 2: Schema Violation (Prompt Injection) - should catch and reject empty or hallucinated responses', async () => {
    const generateWithFallbackMock = llmModule.generateWithFallback as jest.Mock

    // Mock an invalid JSON payload that violates ReduceForensicSchema constraints
    // (e.g. structured incorrectly or contains completely mismatching properties without required fallback arrays)
    const malformedForensicJson = JSON.stringify({
      unexpectedInjectedKey: "DROP TABLE projects;",
      totalFinancialMentions: "THIS SHOULD BE A NUMBER" // Type mismatch violating Zod expectations
    })

    generateWithFallbackMock
      .mockResolvedValueOnce({ content: malformedForensicJson }) // Forensic Expert
      .mockResolvedValueOnce({ content: 'Argument escalated at 5pm' }) // Mediator Expert

    const manager = new SwarmManager([], mockConfig)
    
    const reducePromise = manager.executeReducePhase({
      financialDrafts: ['Draft 1'],
      sentimentDrafts: ['Sentiment 1']
    })

    await expect(reducePromise).rejects.toThrow('LLM output schema validation failed')
  })

  it('Test 3: HTTP Error Propagation - should correctly propagate 429 and 503 errors up the stack', async () => {
    const generateWithFallbackMock = llmModule.generateWithFallback as jest.Mock

    // Simulate standard openrouter / gateway failures
    generateWithFallbackMock.mockRejectedValue(new Error('OpenRouter API error: 429 Too Many Requests'))

    const manager = new SwarmManager([], mockConfig)

    const reducePromise = manager.executeReducePhase({
      financialDrafts: ['Draft 1'],
      sentimentDrafts: ['Sentiment 1']
    })

    await expect(reducePromise).rejects.toThrow('OpenRouter API error: 429 Too Many Requests')
  })
})
