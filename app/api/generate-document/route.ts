import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import { decryptText } from '@/lib/crypto'
import PDFDocument from 'pdfkit'

function mapDbProject(dbProj: any) {
  if (!dbProj) return null
  return {
    id: dbProj.id,
    name: dbProj.name,
    description: dbProj.description || undefined,
    messageCount: dbProj.message_count || 0,
    participants: dbProj.participants || [],
    dateRange: dbProj.date_range || undefined,
    analysis: dbProj.analysis || undefined,
    createdAt: dbProj.created_at,
    updatedAt: dbProj.updated_at
  }
}

export async function POST(request: NextRequest) {
  const supabase = getServiceClient()
  try {
    const { projectId, documentType = 'summary', format = 'pdf', passphrase } = await request.json()

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Get project data
    const { data: dbProj, error: projError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (projError || !dbProj) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const project = mapDbProject(dbProj) as any

    // Get messages if needed
    let messages: any[] = []
    if (documentType === 'full_transcript' || documentType === 'detailed_analysis') {
      const { data: dbMessages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('project_id', projectId)

      if (msgError) throw msgError
      
      messages = await Promise.all(
        (dbMessages || []).map(async (msg) => {
          let decryptedMessage = msg.message
          let decryptedSender = msg.sender

          if (passphrase) {
            try {
              const messageEnc = JSON.parse(msg.message)
              if (messageEnc.ciphertext && messageEnc.salt && messageEnc.iv) {
                decryptedMessage = await decryptText(
                  messageEnc.ciphertext,
                  passphrase,
                  messageEnc.salt,
                  messageEnc.iv
                )
              }
            } catch (e) {
              // Treat as plaintext fallback
            }

            try {
              const senderEnc = JSON.parse(msg.sender)
              if (senderEnc.ciphertext && senderEnc.salt && senderEnc.iv) {
                decryptedSender = await decryptText(
                  senderEnc.ciphertext,
                  passphrase,
                  senderEnc.salt,
                  senderEnc.iv
                )
              }
            } catch (e) {
              // Treat as plaintext fallback
            }
          }

          return {
            id: msg.id,
            projectId: msg.project_id,
            sender: decryptedSender,
            message: decryptedMessage,
            timestamp: msg.timestamp
          }
        })
      )
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