import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore'

// GET - List all projects
export async function GET() {
  try {
    const projectsCollection = collection(db, 'projects')
    const projectsSnapshot = await getDocs(projectsCollection)
    
    const projects = projectsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    return NextResponse.json(projects)
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

// POST - Create new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }

    const projectData = {
      name,
      description: description || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      messageCount: 0,
      participants: [],
      dateRange: null,
      analysis: null
    }

    const projectsCollection = collection(db, 'projects')
    const docRef = await addDoc(projectsCollection, projectData)

    return NextResponse.json({ 
      id: docRef.id, 
      ...projectData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating project:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
} 