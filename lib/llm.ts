import OpenAI from 'openai'

// Single LLM client for all AI calls — routed via OpenRouter
// Change LLM_MODEL_PRIMARY env var to swap models with zero code changes
export const llm = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://whathappen.app',
    'X-Title': 'WhatHappen Analyser',
  },
})

export const MODELS = {
  primary:   process.env.LLM_MODEL_PRIMARY   ?? 'deepseek/deepseek-chat-v3-0324',
  fallback:  process.env.LLM_MODEL_FALLBACK  ?? 'anthropic/claude-3-haiku',
  emergency: process.env.LLM_MODEL_EMERGENCY ?? 'openai/gpt-4o-mini',
  // Future private swap — just change LLM_MODEL_PRIMARY:
  // 'google/gemma-3-27b-it'   via OpenRouter
  // 'ollama/gemma3:27b'        via self-hosted Ollama on GCP
}

/**
 * Generate a completion with automatic fallback across models.
 * Tries primary → fallback → emergency. Logs usage to Supabase for cost tracking.
 */
export async function generateWithFallback(
  messages: OpenAI.ChatCompletionMessageParam[],
  options: Partial<Omit<OpenAI.ChatCompletionCreateParamsNonStreaming, 'model' | 'messages'>> = {}
): Promise<{ content: string; model: string }> {
  const chain = [MODELS.primary, MODELS.fallback, MODELS.emergency]

  for (const model of chain) {
    try {
      const response = await llm.chat.completions.create({
        model,
        messages,
        ...options,
      } as OpenAI.ChatCompletionCreateParamsNonStreaming)

      const content = response.choices[0]?.message?.content
      if (!content) continue // empty response — try next model

      // Fire-and-forget usage log (don't await to keep latency low)
      logLLMUsage(model, response.usage).catch(() => {})

      return { content, model }
    } catch (err: any) {
      console.error(`[llm] ${model} failed: ${err.message}`)
    }
  }

  throw new Error('All LLM models failed')
}

async function logLLMUsage(model: string, usage?: OpenAI.CompletionUsage) {
  if (!usage || !process.env.NEXT_PUBLIC_SUPABASE_URL) return
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await supabase.from('llm_usage').insert({
      model,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
    })
  } catch {
    // Non-critical — swallow silently
  }
}
