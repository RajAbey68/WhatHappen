import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectRef = doc(db, 'projects', params.id)
    const projectDoc = await getDoc(projectRef)

    if (!projectDoc.exists()) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const project = {
      id: projectDoc.id,
      ...projectDoc.data(),
      createdAt: projectDoc.data()?.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      updatedAt: projectDoc.data()?.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    }

    return NextResponse.json({ project })
  } catch (error) {
    console.error('Error fetching project:', error)
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const projectRef = doc(db, 'projects', params.id)

    const updateData = {
      ...body,
      updatedAt: serverTimestamp()
    }

    await updateDoc(projectRef, updateData)

    return NextResponse.json({ 
      message: 'Project updated successfully',
      id: params.id
    })
  } catch (error) {
    console.error('Error updating project:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectRef = doc(db, 'projects', params.id)
    await deleteDoc(projectRef)

    return NextResponse.json({ message: 'Project deleted successfully' })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
} 