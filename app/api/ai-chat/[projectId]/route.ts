import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, doc, getDoc, orderBy } from 'firebase/firestore'

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params

    // Get project details
    const projectRef = doc(db, 'projects', projectId)
    const projectDoc = await getDoc(projectRef)

    if (!projectDoc.exists()) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const projectData = projectDoc.data()
    const project = {
      id: projectDoc.id,
      ...projectData
    } as any

    // Get recent messages for context
    const messagesRef = collection(db, 'messages')
    const messagesQuery = query(
      messagesRef,
      where('projectId', '==', projectId),
      orderBy('createdAt', 'desc')
    )

    const messagesSnapshot = await getDocs(messagesQuery)
    const recentMessages = messagesSnapshot.docs.slice(0, 100).map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Get AI conversation history
    const conversationsRef = collection(db, 'ai_conversations')
    const conversationsQuery = query(
      conversationsRef,
      where('projectId', '==', projectId),
      orderBy('createdAt', 'desc')
    )

    const conversationsSnapshot = await getDocs(conversationsQuery)
    const conversations = conversationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    }))

    return NextResponse.json({
      project,
      recentMessages: recentMessages.slice(0, 20), // Limit for performance
      conversations,
      context: {
        messageCount: project.messageCount || 0,
        participants: project.participants || [],
        dateRange: project.dateRange,
        keywords: project.analysis?.keywords || [],
        insights: project.analysis?.insights || []
      }
    })

  } catch (error) {
    console.error('Error fetching project chat data:', error)
    return NextResponse.json({ error: 'Failed to fetch project data' }, { status: 500 })
  }
} 