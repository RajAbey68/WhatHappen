process.env.MOCK_APIS = 'true'
process.env.OPENROUTER_API_KEY = ''
process.env.DEEPSEEK_API_KEY = 'mock-deepseek-key'

const mockResponses = new Map<string, string>()

async function main() {
  // Step 1: Import OpenAI, create a dummy client to get the Completions prototype
  const OpenAI = (await import('openai')).default
  const dummy = new OpenAI({ apiKey: 'test' })
  const CompletionsProto = Object.getPrototypeOf(dummy.chat.completions)

  // Step 2: Patch the prototype's create method
  CompletionsProto.create = async function(this: any, params: any, options?: any) {
    const entry = mockResponses.get(params?.model)
    if (entry) return JSON.parse(entry)
    throw new Error(`No mock for model ${params?.model}`)
  }

  // Step 3: Register mocks
  mockResponses.set('deepseek-chat', JSON.stringify({
    id: 'mock-1', object: 'chat.completion', created: Math.floor(Date.now() / 1000),
    model: 'deepseek-chat',
    choices: [{ index: 0, message: { role: 'assistant', content: 'DeepSeek mock works!' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
  }))

  mockResponses.set('deepseek/deepseek-chat-v3-0324', JSON.stringify({
    id: 'mock-2', object: 'chat.completion', created: Math.floor(Date.now() / 1000),
    model: 'deepseek/deepseek-chat-v3-0324',
    choices: [{ index: 0, message: { role: 'assistant', content: 'OpenRouter primary!' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
  }))

  mockResponses.set('anthropic/claude-3-haiku', JSON.stringify({
    id: 'mock-3', object: 'chat.completion', created: Math.floor(Date.now() / 1000),
    model: 'anthropic/claude-3-haiku',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Fallback response!' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
  }))

  // Step 4: Now import llm module — its internal client uses patched prototype
  const { generateWithFallback } = await import('../../lib/llm')

  // Test 1: DeepSeek direct mode (no OpenRouter key)
  process.env.OPENROUTER_API_KEY = ''
  const result1 = await generateWithFallback(
    [{ role: 'user', content: 'Say hello' }],
    { max_tokens: 50, temperature: 0.1 }
  )
  console.log('Test 1 (DeepSeek direct):', JSON.stringify(result1))

  // Test 2: OpenRouter mode with fallback
  process.env.OPENROUTER_API_KEY = 'mock-or-key'
  const result2 = await generateWithFallback(
    [{ role: 'user', content: 'Say hello' }],
    { max_tokens: 50, temperature: 0.1 }
  )
  console.log('Test 2 (OpenRouter):', JSON.stringify(result2))

  // Test 3: Primary fails, fallback works
  mockResponses.delete('deepseek/deepseek-chat-v3-0324')
  const result3 = await generateWithFallback(
    [{ role: 'user', content: 'Say hello' }],
    { max_tokens: 50, temperature: 0.1 }
  )
  console.log('Test 3 (Fallback):', JSON.stringify(result3))

  // Test 4: All exhausted
  mockResponses.clear()
  try {
    await generateWithFallback(
      [{ role: 'user', content: 'test' }],
      { max_tokens: 10 }
    )
    console.log('Test 4: SHOULD HAVE THROWN')
  } catch (e: any) {
    console.log('Test 4 (Exhausted):', e.message)
  }
}
main().catch(e => console.error('ERROR:', e.message))
