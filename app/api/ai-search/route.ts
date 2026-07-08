/**
 * AI Search — Privacy-safe Text-to-SQL implementation.
 *
 * PRIVACY GUARANTEE: The LLM receives schema descriptions and user questions only.
 * Raw message content is NEVER passed to any external API.
 *
 * Flow: user question → LLM generates SQL → SQL validated → executed on Supabase
 *       → LLM summarises aggregate results → response
 */
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getServiceClient } from '@/lib/auth'
import { generateWithFallback } from '@/lib/llm'
import { validateGeneratedSQL, ALLOWED_TABLES } from '@/lib/sql-validator'

// Schema description — this is ALL the LLM ever sees about user data
const SCHEMA_CONTEXT = `
PostgreSQL schema for a WhatsApp / email chat analyser.
No message content is stored — only metadata and aggregates.

Tables:
- sessions(id UUID, user_id UUID, file_name TEXT, source_app TEXT, source_type TEXT,
    total_messages INT, date_range_start TIMESTAMPTZ, date_range_end TIMESTAMPTZ,
    processing_status TEXT)
- messages_meta(id UUID, session_id UUID, source_type TEXT, timestamp TIMESTAMPTZ,
    sender TEXT, recipient TEXT, word_count INT, sentiment_score NUMERIC(4,3),
    has_media BOOLEAN, is_system_message BOOLEAN)
- message_stats(session_id UUID, sender TEXT, message_count INT,
    avg_sentiment NUMERIC(4,3), avg_word_count NUMERIC(8,2),
    peak_hour INT, media_count INT)

session_id is always filtered using the parameterised placeholder $1.
`

export async function POST(request: NextRequest) {
  // Auth gate
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const { query, sessionId } = await request.json()

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    // Validate sessionId format to prevent injection
    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
    }

    // Verify the session belongs to this user
    const supabase = getServiceClient()
    const { data: session } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', authResult.user.id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // SQL generation with validation + retry (up to 3 attempts)
    let sql: string | null = null
    let lastError: string | null = null

    for (let attempt = 0; attempt < 3; attempt++) {
      const feedbackClause = lastError
        ? `\nPrevious attempt failed validation: "${lastError}". Correct the SQL.`
        : ''

      const { content } = await generateWithFallback(
        [
          {
            role: 'system',
            content: `You write PostgreSQL SELECT queries. ${SCHEMA_CONTEXT}
Return ONLY the SQL query. No explanation. No markdown fences.
Always filter: WHERE session_id = $1
Never use SELECT *. Only query aggregates or metadata.${feedbackClause}`,
          },
          { role: 'user', content: query },
        ],
        { max_tokens: 300, temperature: 0.1 }
      )

      const candidate = content.trim().replace(/```sql\n?|\n?```/g, '').trim()
      const validation = validateGeneratedSQL(candidate, ALLOWED_TABLES)

      if (validation.valid) {
        sql = candidate
        break
      }
      lastError = validation.reason
    }

    if (!sql) {
      return NextResponse.json(
        { error: 'Could not generate a safe query for this question. Try rephrasing.' },
        { status: 422 }
      )
    }

    // Execute via the hardened DB function — session_id passed as parameter
    const { data, error: dbError } = await supabase.rpc('execute_safe_query', {
      query_sql: sql,
      session_id_param: sessionId,
    })

    if (dbError) {
      console.error('[ai-search] DB error:', dbError.message)
      return NextResponse.json({ error: 'Query execution failed' }, { status: 500 })
    }

    // Summarise aggregate results — still no raw content
    const { content: answer, model } = await generateWithFallback(
      [
        {
          role: 'system',
          content: 'Summarise these database query results in plain English. Be concise and helpful.',
        },
        {
          role: 'user',
          content: `Question: ${query}\nResults: ${JSON.stringify(data)}`,
        },
      ],
      { max_tokens: 300, temperature: 0.3 }
    )

    return NextResponse.json({
      success: true,
      answer,
      data,
      results: data, // backwards compatibility alias for tests/clients
      model,
      sql, // returned for debugging — remove in production if desired
    })
  } catch (error: any) {
    console.error('[ai-search] error:', error.message)
    return NextResponse.json({ success: false, error: 'Analysis failed' }, { status: 500 })
  }
}
