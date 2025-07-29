import { NextRequest, NextResponse } from 'next/server'
import { OpenAI } from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const { query, projectId, context } = await request.json()

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Build context for AI from chat data
    const systemPrompt = `You are an AI assistant specialized in analyzing WhatsApp chat data. 
    You have access to the following chat analysis context:
    - Project ID: ${projectId}
    - Chat participants: ${context?.participants?.join(', ') || 'Unknown'}
    - Total messages: ${context?.messageCount || 'Unknown'}
    - Date range: ${context?.dateRange || 'Unknown'}
    - Key topics: ${context?.keywords?.slice(0, 10).join(', ') || 'None identified'}
    
    Provide helpful insights and answer questions about this WhatsApp chat data. 
    Focus on patterns, relationships, and meaningful observations.
    If asked about financial information, be particularly thorough in your analysis.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    })

    const response = completion.choices[0]?.message?.content || 'No response generated'

    return NextResponse.json({
      response,
      usage: completion.usage,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('AI Chat Query Error:', error)
    return NextResponse.json({ 
      error: 'Failed to process AI query',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 