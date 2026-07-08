import { generateWithFallback } from '../llm'
import { AgentConfig } from '@/lib/types/agent'
import { ReduceForensicSchema } from '@/lib/types/swarm'

export interface ChatMessage {
  sender: string
  message: string
  timestamp: string
}

export interface SwarmAnalysisResult {
  success: boolean
  ledger: any
  sentimentTimeline: any
  timelineMilestones: any
  finalSynthesis: string
}

export class SwarmManager {
  private messages: ChatMessage[]
  private config: AgentConfig
  private timeoutMs: number

  constructor(messages: ChatMessage[], config: AgentConfig, options?: { timeoutMs?: number }) {
    this.messages = messages
    this.config = config
    this.timeoutMs = options?.timeoutMs ?? 30000
  }

  /**
   * Helper method to race a promise with a timeout and utilize an AbortController.
   * This uses Promise.race to guarantee that even if the underlying LLM call hangs
   * and ignores the AbortSignal, the system rejects properly.
   */
  private async executeWithTimeout<T>(
    fn: (signal?: AbortSignal) => Promise<T>,
    timeoutMs: number = this.timeoutMs
  ): Promise<T> {
    const controller = new AbortController()
    
    let timer: NodeJS.Timeout | null = null
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error(`LLM Request timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })

    try {
      const result = await Promise.race([
        fn(controller.signal),
        timeoutPromise
      ])
      if (timer) clearTimeout(timer)
      return result
    } catch (err: any) {
      if (timer) clearTimeout(timer)
      throw err
    }
  }

  /**
   * Splits a massive chat backup into smaller chunks for parallel processing.
   */
  private chunkMessages(chunkSize: number = 200): ChatMessage[][] {
    const chunks: ChatMessage[][] = []
    for (let i = 0; i < this.messages.length; i += chunkSize) {
      chunks.push(this.messages.slice(i, i + chunkSize))
    }
    return chunks
  }

  /**
   * Map Phase: Executes parallel extraction over chat chunks with timeout protection.
   */
  public async executeMapPhase(): Promise<{ financialDrafts: string[], sentimentDrafts: string[] }> {
    const chunks = this.chunkMessages(200)
    console.log(`[Swarm] Ingesting ${this.messages.length} messages. Map Phase split into ${chunks.length} parallel subtasks.`)

    const mapTasks = chunks.map(async (chunk, index) => {
      const prompt = `Analyze the following WhatsApp chat chunk and extract:
1. Any monetary amounts, payment confirmations, bank transfers, or debts.
2. Any significant emotional escalations, disputes, or arguments.

Context: You are operating under ${this.config.jurisdiction} jurisdiction regulations, governed by ${this.config.regulator}.

Chat Chunk #${index + 1}:
${chunk.map(m => `[${m.timestamp}] ${m.sender}: ${m.message}`).join('\n')}`

      return this.executeWithTimeout(async (signal) => {
        const response = await generateWithFallback([
          { role: 'system', content: 'You are an expert Map-Phase extraction agent. Be factual, extract exact figures, and never invent data.' },
          { role: 'user', content: prompt }
        ], { temperature: 0.1, signal } as any)

        if (!response || !response.content) {
          throw new Error('LLM returned an empty or invalid response content')
        }

        return response.content
      })
    })

    const rawDrafts = await Promise.all(mapTasks)
    
    return {
      financialDrafts: rawDrafts.map(d => `[Draft Segment] ${d}`),
      sentimentDrafts: rawDrafts.map(d => `[Draft Segment] ${d}`)
    }
  }

  /**
   * Reduce Phase: Aggregates chunk drafts via specialized experts.
   * Employs Zod schema parsing and timeout protection.
   */
  public async executeReducePhase(drafts: { financialDrafts: string[], sentimentDrafts: string[] }): Promise<SwarmAnalysisResult> {
    console.log('[Swarm] Entering Reduce Phase. Spawning Expert Agents.')

    const forensicTask = this.executeWithTimeout(async (signal) => {
      const response = await generateWithFallback([
        { 
          role: 'system', 
          content: `You are the ${this.config.expertId} Expert. Compile all draft segments into a clean, structured JSON ledger. Adhere to ${this.config.jurisdiction} and ${this.config.regulator} standards.` 
        },
        { role: 'user', content: drafts.financialDrafts.join('\n\n') }
      ], { response_format: { type: 'json_object' }, signal } as any)

      if (!response || !response.content) {
        throw new Error('Forensic LLM returned an empty response')
      }
      return response
    })

    const mediatorTask = this.executeWithTimeout(async (signal) => {
      const response = await generateWithFallback([
        { 
          role: 'system', 
          content: 'You are the Relationship Mediator Expert. Compile all emotional escalation segments into a structured timeline showing arguments, tone progression, and resolution efforts.' 
        },
        { role: 'user', content: drafts.sentimentDrafts.join('\n\n') }
      ], { signal } as any)

      if (!response || !response.content) {
        throw new Error('Mediator LLM returned an empty response')
      }
      return response
    })

    const [forensicRes, mediatorRes] = await Promise.all([forensicTask, mediatorTask])

    let parsedLedger = {}
    try {
      const rawLedger = JSON.parse(forensicRes.content)
      const validation = ReduceForensicSchema.safeParse(rawLedger)
      if (validation.success) {
        parsedLedger = validation.data
      } else {
        throw new Error(`LLM output schema validation failed: ${validation.error.message}`)
      }
    } catch (e: any) {
      console.warn('[Swarm] Failed to parse/validate forensic JSON output:', e.message)
      throw new Error(`Forensic validation error: ${e.message}`)
    }

    const synthesisPrompt = `You are the Lead Swarm Synthesizer (${this.config.expertId} Persona). Compile a master executive analysis report in markdown.
    
--- Forensic Ledger ---
${forensicRes.content}

--- Emotional Escalation Timeline ---
${mediatorRes.content}

Ensure your report complies with ${this.config.jurisdiction} jurisdiction and the ${this.config.regulator} regulatory framework. Provide a factual and objective synthesis.`

    const finalSynthesis = await this.executeWithTimeout(async (signal) => {
      const response = await generateWithFallback([
        { role: 'system', content: 'You are the Lead Aggregator. Synthesize the expert reports into a beautifully formatted, objective executive analysis.' },
        { role: 'user', content: synthesisPrompt }
      ], { signal } as any)

      if (!response || !response.content) {
        throw new Error('Synthesizer LLM returned an empty response')
      }
      return response
    })

    return {
      success: true,
      ledger: parsedLedger,
      sentimentTimeline: mediatorRes.content,
      timelineMilestones: [],
      finalSynthesis: finalSynthesis.content
    }
  }

  /**
   * Orchestrates the complete MapReduce swarm pipeline.
   */
  public async analyze(): Promise<SwarmAnalysisResult> {
    const drafts = await this.executeMapPhase()
    return await this.executeReducePhase(drafts)
  }
}
