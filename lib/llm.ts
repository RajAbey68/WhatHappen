import OpenAI from 'openai'

/**
 * LLM client — supports two modes:
 *
 * 1. OpenRouter (recommended for production): set OPENROUTER_API_KEY
 *    → full 3-model fallback chain: DeepSeek → Claude Haiku → GPT-4o-mini
 *
 * 2. DeepSeek direct (default if no OpenRouter key): set DEEPSEEK_API_KEY
 *    → single model, no fallback, ~same cost as via OpenRouter minus markup
 *
 * Client is created lazily on first use so Next.js build-time page-data
 * collection does NOT throw when env vars are absent.
 */

function getUseOpenRouter() {
  return !!process.env.OPENROUTER_API_KEY
}

let _llm: OpenAI | null = null

function getLLM(): OpenAI {
  if (_llm) return _llm
  const useOpenRouter = getUseOpenRouter()
  _llm = useOpenRouter
    ? new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY!,
        defaultHeaders: {
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://whathappen.app',
          'X-Title': 'WhatHappen Analyser',
        },
      })
    : new OpenAI({
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: process.env.DEEPSEEK_API_KEY ?? 'not-set',
      })
  return _llm
}

function getModels() {
  const useOpenRouter = getUseOpenRouter()
  return useOpenRouter
    ? {
        primary:   process.env.LLM_MODEL_PRIMARY   ?? 'deepseek/deepseek-chat-v3-0324',
        fallback:  process.env.LLM_MODEL_FALLBACK  ?? 'anthropic/claude-3-haiku',
        emergency: process.env.LLM_MODEL_EMERGENCY ?? 'openai/gpt-4o-mini',
      }
    : {
        primary:   'deepseek-chat',
        fallback:  'deepseek-chat',
        emergency: 'deepseek-chat',
      }
}

/**
 * Generate a completion with automatic fallback.
 * With OpenRouter: tries primary → fallback → emergency.
 * With DeepSeek direct: single model only.
 */
export async function generateWithFallback(
  messages: OpenAI.ChatCompletionMessageParam[],
  options: Partial<Omit<OpenAI.ChatCompletionCreateParamsNonStreaming, 'model' | 'messages'>> = {}
): Promise<{ content: string; model: string }> {
  const MODELS = getModels()
  const useOpenRouter = getUseOpenRouter()
  const chain = useOpenRouter
    ? [MODELS.primary, MODELS.fallback, MODELS.emergency]
    : [MODELS.primary]

  for (const model of chain) {
    try {
      const response = await getLLM().chat.completions.create({
        model,
        messages,
        ...options,
      } as OpenAI.ChatCompletionCreateParamsNonStreaming)

      const content = response.choices[0]?.message?.content
      if (!content) continue

      logLLMUsage(model, response.usage).catch(() => {})
      return { content, model }
    } catch (err: any) {
      console.error(`[llm] ${model} failed: ${err.message}`)
    }
  }

  throw new Error('LLM request failed — all models exhausted')
}

async function logLLMUsage(model: string, usage?: OpenAI.CompletionUsage) {
  if (!usage || !process.env.NEXT_PUBLIC_SUPABASE_URL) return
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await sb.from('llm_usage').insert({
      model,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
    })
  } catch { /* non-critical */ }
}
