import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

let openai: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openai
}

interface SearchRequest {
  query: string
  chatData?: any
  options?: {
    searchType?: 'semantic' | 'keyword' | 'financial' | 'sentiment'
    limit?: number
    includeContext?: boolean
  }
}

interface FinancialAnalysisResult {
  financialMentions: Array<{
    message: string
    sender: string
    timestamp: Date
    amount?: string
    context: string
    relevanceScore: number
  }>
  keyFindings: string[]
  summary: string
  totalFinancialMessages: number
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchRequest = await request.json()
    const { query, chatData, options = {} } = body

    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    // Enhanced financial analysis based on memory
    if (options?.searchType === 'financial' || isFinancialQuery(query)) {
      const financialAnalysis = await performFinancialAnalysis(query, chatData)
      return NextResponse.json({
        type: 'financial_analysis',
        query,
        result: financialAnalysis,
        timestamp: new Date().toISOString()
      })
    }

    // Semantic search using AI
    if (options?.searchType === 'semantic' || !options?.searchType) {
      const semanticResults = await performSemanticSearch(query, chatData, options)
      return NextResponse.json({
        type: 'semantic_search',
        query,
        results: semanticResults,
        timestamp: new Date().toISOString()
      })
    }

    // Keyword search
    if (options?.searchType === 'keyword') {
      const keywordResults = performKeywordSearch(query, chatData, options)
      return NextResponse.json({
        type: 'keyword_search',
        query,
        results: keywordResults,
        timestamp: new Date().toISOString()
      })
    }

    // Sentiment analysis
    if (options?.searchType === 'sentiment') {
      const sentimentResults = await performSentimentAnalysis(query, chatData)
      return NextResponse.json({
        type: 'sentiment_analysis',
        query,
        results: sentimentResults,
        timestamp: new Date().toISOString()
      })
    }

    return NextResponse.json(
      { error: 'Invalid search type' },
      { status: 400 }
    )

  } catch (error) {
    console.error('AI search error:', error)
    return NextResponse.json(
      { error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

function isFinancialQuery(query: string): boolean {
  const financialKeywords = [
    'payment', 'money', 'dollar', '$', 'upfront', 'pay', 'cost', 'price',
    'invoice', 'bill', 'expense', 'budget', 'financial', 'transaction',
    '24000', '24,000', '24x1000', 'twenty-four thousand'
  ]
  
  const lowerQuery = query.toLowerCase()
  return financialKeywords.some(keyword => lowerQuery.includes(keyword))
}

async function performFinancialAnalysis(query: string, chatData: any): Promise<FinancialAnalysisResult> {
  if (!chatData || !chatData.messages) {
    return {
      financialMentions: [],
      keyFindings: ['No chat data available for financial analysis'],
      summary: 'No data to analyze',
      totalFinancialMessages: 0
    }
  }

  const messages = chatData.messages || []
  
  // Enhanced keyword search with fuzzy matching for financial terms
  const financialKeywords = [
    'payment', 'money', 'dollar', 'dollars', '$', 'upfront', 'pay', 'paid',
    'cost', 'price', 'invoice', 'bill', 'expense', 'budget', 'financial',
    'transaction', '24000', '24,000', '24x1000', 'twenty-four thousand',
    'twenty four thousand', '24k', 'cash', 'fund', 'amount', 'sum'
  ]

  // Search through the most recent messages first (based on memory of the issue)
  const recentMessages = messages.slice(-10000) // Get last 10,000 messages
  
  const financialMentions = []
  
  for (const message of recentMessages) {
    if (!message.message || typeof message.message !== 'string') continue
    
    const messageText = message.message.toLowerCase()
    const hasFinancialKeyword = financialKeywords.some(keyword => 
      messageText.includes(keyword.toLowerCase())
    )
    
    if (hasFinancialKeyword) {
      // Calculate relevance score
      let relevanceScore = 0
      for (const keyword of financialKeywords) {
        if (messageText.includes(keyword.toLowerCase())) {
          relevanceScore += 1
        }
      }
      
      // Special scoring for $24,000 related content
      if (messageText.includes('24000') || messageText.includes('24,000') || 
          messageText.includes('24x1000') || messageText.includes('upfront')) {
        relevanceScore += 5
      }
      
      financialMentions.push({
        message: message.message,
        sender: message.sender || 'Unknown',
        timestamp: new Date(message.timestamp),
        context: `Message from ${message.sender}`,
        relevanceScore
      })
    }
  }

  // Sort by relevance score and timestamp (most recent first)
  financialMentions.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore
    }
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })

  // Generate AI-powered analysis
  let summary = ''
  let keyFindings: string[] = []

  if (financialMentions.length > 0) {
    try {
      const contextMessages = financialMentions.slice(0, 10).map(m => 
        `${m.sender}: ${m.message}`
      ).join('\n')

      const openaiClient = getOpenAI()
      if (!openaiClient) {
        throw new Error('OpenAI API key not configured')
      }
      
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are analyzing WhatsApp chat messages for financial content. Focus on payment discussions, amounts mentioned, and financial commitments. Be specific about amounts and context."
          },
          {
            role: "user",
            content: `Analyze these financial-related messages and provide key findings and a summary:\n\n${contextMessages}\n\nQuery: ${query}`
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      })

      const analysis = completion.choices[0]?.message?.content || 'Analysis unavailable'
      
      // Extract key findings and summary from AI response
      const lines = analysis.split('\n').filter(line => line.trim())
      keyFindings = lines.slice(0, 5)
      summary = lines.join(' ')

    } catch (aiError) {
      console.error('AI analysis error:', aiError)
      keyFindings = [
        `Found ${financialMentions.length} financial-related messages`,
        'AI analysis unavailable - using keyword-based results'
      ]
      summary = `Analysis of ${financialMentions.length} financial messages found in the chat.`
    }
  } else {
    keyFindings = ['No financial-related messages found in the chat data']
    summary = 'No financial content detected in the provided chat messages.'
  }

  return {
    financialMentions: financialMentions.slice(0, 50), // Return top 50 results
    keyFindings,
    summary,
    totalFinancialMessages: financialMentions.length
  }
}

async function performSemanticSearch(query: string, chatData: any, options: any) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }

  if (!chatData || !chatData.messages) {
    return {
      results: [],
      summary: 'No chat data available for search'
    }
  }

  const messages = chatData.messages || []
  const limit = options.limit || 10

  // Use AI to find semantically relevant messages
  try {
    const contextMessages = messages.slice(0, 100).map((m: any) => 
      `${m.sender}: ${m.message}`
    ).join('\n')

    const openaiClient = getOpenAI()
    if (!openaiClient) {
      throw new Error('OpenAI API key not configured')
    }
    
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are helping search through WhatsApp chat messages. Find messages that are semantically related to the user's query and explain the relevance."
        },
        {
          role: "user",
          content: `Find messages related to: "${query}"\n\nChat messages:\n${contextMessages}`
        }
      ],
      max_tokens: 800,
      temperature: 0.3
    })

    const response = completion.choices[0]?.message?.content || 'No relevant messages found'
    
    return {
      results: messages.slice(0, limit),
      summary: response,
      totalSearched: messages.length
    }

  } catch (error) {
    console.error('Semantic search error:', error)
    // Fallback to keyword search
    return performKeywordSearch(query, chatData, options)
  }
}

function performKeywordSearch(query: string, chatData: any, options: any) {
  if (!chatData || !chatData.messages) {
    return {
      results: [],
      summary: 'No chat data available for search'
    }
  }

  const messages = chatData.messages || []
  const keywords = query.toLowerCase().split(' ')
  const limit = options.limit || 20

  const matchingMessages = messages.filter((message: any) => {
    if (!message.message || typeof message.message !== 'string') return false
    
    const messageText = message.message.toLowerCase()
    return keywords.some(keyword => messageText.includes(keyword))
  })

  return {
    results: matchingMessages.slice(0, limit),
    summary: `Found ${matchingMessages.length} messages containing keywords: ${keywords.join(', ')}`,
    totalMatches: matchingMessages.length
  }
}

async function performSentimentAnalysis(query: string, chatData: any) {
  if (!chatData || !chatData.messages) {
    return {
      results: [],
      summary: 'No chat data available for sentiment analysis'
    }
  }

  const messages = chatData.messages || []
  const sentimentMessages = messages.filter((m: any) => m.sentiment)

  // Group by sentiment
  const positive = sentimentMessages.filter((m: any) => m.sentiment.score > 0)
  const negative = sentimentMessages.filter((m: any) => m.sentiment.score < 0)
  const neutral = sentimentMessages.filter((m: any) => m.sentiment.score === 0)

  return {
    results: {
      positive: positive.slice(0, 10),
      negative: negative.slice(0, 10),
      neutral: neutral.slice(0, 10)
    },
    summary: `Sentiment analysis: ${positive.length} positive, ${negative.length} negative, ${neutral.length} neutral messages`,
    totalAnalyzed: sentimentMessages.length
  }
} 