import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import PDFDocument from 'pdfkit'

export async function POST(request: NextRequest) {
  try {
    const { projectId, documentType = 'summary', format = 'pdf' } = await request.json()

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Get project data
    const projectRef = doc(db, 'projects', projectId)
    const projectDoc = await getDoc(projectRef)

    if (!projectDoc.exists()) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const project = { id: projectDoc.id, ...projectDoc.data() } as any

    // Get messages if needed
    let messages: any[] = []
    if (documentType === 'full_transcript' || documentType === 'detailed_analysis') {
      const messagesRef = collection(db, 'messages')
      const messagesQuery = query(messagesRef, where('projectId', '==', projectId))
      const querySnapshot = await getDocs(messagesQuery)
      messages = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    }

    let documentContent: any

    switch (format) {
      case 'pdf':
        documentContent = await generatePDF(project, messages, documentType)
        break
      case 'json':
        documentContent = generateJSON(project, messages, documentType)
        break
      case 'csv':
        documentContent = generateCSV(project, messages, documentType)
        break
      default:
        return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
    }

    const headers = new Headers()
    
    if (format === 'pdf') {
      headers.set('Content-Type', 'application/pdf')
      headers.set('Content-Disposition', `attachment; filename="${project.name}_${documentType}.pdf"`)
      return new NextResponse(documentContent, { headers })
    } else if (format === 'csv') {
      headers.set('Content-Type', 'text/csv')
      headers.set('Content-Disposition', `attachment; filename="${project.name}_${documentType}.csv"`)
      return new NextResponse(documentContent, { headers })
    } else {
      return NextResponse.json(documentContent)
    }

  } catch (error) {
    console.error('Error generating document:', error)
    return NextResponse.json({ error: 'Failed to generate document' }, { status: 500 })
  }
}

async function generatePDF(project: any, messages: any[], documentType: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument()
      const chunks: Buffer[] = []

      doc.on('data', chunk => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))

      // Header
      doc.fontSize(20).text(`WhatsApp Analysis Report: ${project.name}`, 50, 50)
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 80)

      let yPosition = 120

      // Project Overview
      doc.fontSize(16).text('Project Overview', 50, yPosition)
      yPosition += 30

      doc.fontSize(12)
      doc.text(`Messages: ${project.messageCount || 0}`, 50, yPosition)
      yPosition += 20
      doc.text(`Participants: ${project.participants?.length || 0} (${project.participants?.join(', ') || 'None'})`, 50, yPosition)
      yPosition += 20
      doc.text(`Date Range: ${project.dateRange?.start || 'Unknown'} to ${project.dateRange?.end || 'Unknown'}`, 50, yPosition)
      yPosition += 40

      // Analysis Results
      if (project.analysis) {
        doc.fontSize(16).text('Analysis Results', 50, yPosition)
        yPosition += 30

        if (project.analysis.keywords) {
          doc.fontSize(14).text('Top Keywords:', 50, yPosition)
          yPosition += 20
          doc.fontSize(12).text(project.analysis.keywords.slice(0, 10).join(', '), 50, yPosition)
          yPosition += 30
        }

        if (project.analysis.insights) {
          doc.fontSize(14).text('Key Insights:', 50, yPosition)
          yPosition += 20
          project.analysis.insights.forEach((insight: string) => {
            doc.fontSize(12).text(`• ${insight}`, 50, yPosition)
            yPosition += 20
          })
        }
      }

      // Add messages if detailed report
      if (documentType === 'detailed_analysis' && messages.length > 0) {
        yPosition += 20
        doc.fontSize(16).text('Message Sample', 50, yPosition)
        yPosition += 30

        messages.slice(0, 20).forEach(msg => {
          if (yPosition > 700) {
            doc.addPage()
            yPosition = 50
          }
          doc.fontSize(10).text(`[${msg.timestamp}] ${msg.sender}: ${msg.message}`, 50, yPosition)
          yPosition += 15
        })
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

function generateJSON(project: any, messages: any[], documentType: string) {
  const baseData = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      messageCount: project.messageCount,
      participants: project.participants,
      dateRange: project.dateRange,
      analysis: project.analysis
    },
    generatedAt: new Date().toISOString(),
    documentType
  }

  if (documentType === 'full_transcript') {
    return {
      ...baseData,
      messages: messages.map(msg => ({
        timestamp: msg.timestamp,
        sender: msg.sender,
        message: msg.message
      }))
    }
  }

  return baseData
}

function generateCSV(project: any, messages: any[], documentType: string): string {
  if (documentType === 'full_transcript' && messages.length > 0) {
    const headers = ['Timestamp', 'Sender', 'Message']
    const rows = messages.map(msg => [
      msg.timestamp,
      msg.sender,
      msg.message.replace(/"/g, '""') // Escape quotes
    ])
    
    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
  }

  // Summary CSV
  const summaryData = [
    ['Metric', 'Value'],
    ['Project Name', project.name],
    ['Total Messages', project.messageCount || 0],
    ['Participants', project.participants?.length || 0],
    ['Date Range Start', project.dateRange?.start || ''],
    ['Date Range End', project.dateRange?.end || ''],
    ['Top Keywords', project.analysis?.keywords?.slice(0, 5).join('; ') || '']
  ]

  return summaryData.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
} 