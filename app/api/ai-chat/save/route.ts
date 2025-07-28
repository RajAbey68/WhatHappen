import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, addDoc, doc, updateDoc, serverTimestamp, query, where, getDocs, orderBy } from 'firebase/firestore'

export async function POST(request: NextRequest) {
  try {
    const { projectId, messages } = await request.json()

    if (!projectId || !messages) {
      return NextResponse.json({ error: 'Project ID and messages are required' }, { status: 400 })
    }

    // Save the conversation
    const conversationData = {
      projectId,
      messages: messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      })),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }

    const docRef = await addDoc(collection(db, 'ai_conversations'), conversationData)

    return NextResponse.json({
      success: true,
      conversationId: docRef.id,
      message: 'Conversation saved successfully'
    })

  } catch (error) {
    console.error('Error saving AI conversation:', error)
    return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Get all conversations for this project
    const conversationsRef = collection(db, 'ai_conversations')
    const q = query(
      conversationsRef, 
      where('projectId', '==', projectId),
      orderBy('createdAt', 'desc')
    )
    
    const querySnapshot = await getDocs(q)
    const conversations = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    }))

    return NextResponse.json({ conversations })

  } catch (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
} 