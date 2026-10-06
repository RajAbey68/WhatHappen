import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess, hasAnyProjectCredential, missingCredentialResponse } from '@/lib/api-auth'
import { commitGoldenQA, logFeedback, getLexicon, saveLexicon } from '@/lib/rag/learning'

export async function POST(request: NextRequest) {
  try {
    if (!hasAnyProjectCredential(request)) {
      return missingCredentialResponse()
    }

    const body = await request.json()
    const { projectId, queryText, responseText, feedbackType, userNotes, citedMessageIds } = body

    if (!projectId || !queryText) {
      return NextResponse.json({ error: 'Missing projectId or queryText' }, { status: 400 })
    }

    const authCheck = await requireProjectAccess(request, projectId)
    if (authCheck instanceof NextResponse) return authCheck

    // Log the feedback
    const feedback = logFeedback(projectId, {
      projectId,
      rawQuery: queryText,
      rawResponse: responseText,
      feedbackType: feedbackType || 'confirmed',
      userNotes
    })

    let goldenEntry = null

    // If user confirmed or provided verified response, commit to Golden Q&A Memory
    if (feedbackType === 'confirmed' || feedbackType === 'verified') {
      const finalResponse = userNotes && userNotes.trim().length > 0 ? userNotes : responseText
      goldenEntry = await commitGoldenQA(projectId, queryText, finalResponse, citedMessageIds || [])
      console.log(`[Learning RAG] Committed new Golden Q&A exemplar for query: "${queryText}"`)
    }

    return NextResponse.json({
      success: true,
      feedbackId: feedback.id,
      goldenSaved: !!goldenEntry,
      goldenId: goldenEntry?.id
    })
  } catch (error: any) {
    console.error('[Learning RAG] Feedback error:', error)
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    const lexicon = getLexicon(projectId)
    return NextResponse.json({ lexicon })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
