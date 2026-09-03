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

let _llm: OpenAI | null = null

function getLLM(): OpenAI {
  if (_llm) return _llm
  // 100% Local Inference on Hermes-Dev (Zero External Cloud Egress for Legal Compliance)
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1'
  _llm = new OpenAI({
    baseURL: ollamaUrl,
    apiKey: 'ollama-local-key',
  })
  return _llm
}

function getModels() {
  const defaultModel = process.env.OLLAMA_MODEL || 'gemma3:4b'
  return {
    primary:   defaultModel,
    fallback:  defaultModel,
    emergency: defaultModel,
  }
}

/**
 * Generate a completion with automatic fallback.
 * With OpenRouter: tries primary → fallback → emergency.
 * With DeepSeek direct: single model only.
 */
export async function generateWithFallback(
  messages: OpenAI.ChatCompletionMessageParam[],
  options: Partial<Omit<OpenAI.ChatCompletionCreateParamsNonStreaming, 'model' | 'messages'>> = {},
  requestOptions?: import('openai/core').RequestOptions
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
      } as OpenAI.ChatCompletionCreateParamsNonStreaming, requestOptions)

      const content = response.choices[0]?.message?.content
      if (!content) continue

      logLLMUsage(model, response.usage).catch(() => {})
      return { content, model }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('LLM request timed out or was aborted.')
      }
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
