import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth'
import {
  requireProjectAccess,
  hasAnyProjectCredential,
  missingCredentialResponse,
} from '@/lib/api-auth'
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

async function safeDecryptField(field: string, passphrase?: string): Promise<string> {
  if (!passphrase || !field) return field
  try {
    const enc = JSON.parse(field)
    if (enc && typeof enc === 'object' && enc.ciphertext && enc.salt && enc.iv) {
      return await decryptText(enc.ciphertext, passphrase, enc.salt, enc.iv)
    }
  } catch (err: any) {
    if (err instanceof SyntaxError) {
      return field
    }
    throw new Error(`Decryption failed: ${err?.message || 'Invalid passphrase or tampered ciphertext'}`)
  }
  return field
}

export async function POST(request: NextRequest) {
  // RAJ-780: reject credential-less callers BEFORE parsing the body.
  if (!hasAnyProjectCredential(request)) return missingCredentialResponse()

  const supabase = getServiceClient()
  try {
    const { projectId, documentType = 'summary', format = 'pdf', passphrase } = await request.json()

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // RAJ-780: exports the full message transcript as a PDF. Was unauthenticated
    // while using the service-role client — the single highest-value data egress
    // route in the app.
    const authError = await requireProjectAccess(request, projectId)
    if (authError) return authError

    // Get project data
    const { data: dbProj, error: projError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle()

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
      
      try {
        messages = await Promise.all(
          (dbMessages || []).map(async (msg) => {
            const decryptedMessage = await safeDecryptField(msg.message, passphrase)
            const decryptedSender = await safeDecryptField(msg.sender, passphrase)

            return {
              id: msg.id,
              projectId: msg.project_id,
              sender: decryptedSender,
              message: decryptedMessage,
              timestamp: msg.timestamp
            }
          })
        )
      } catch (cryptoErr: any) {
        return NextResponse.json(
          { error: `Message decryption failed: ${cryptoErr.message}` },
          { status: 400 }
        )
      }
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

    // Adversarial review (GLM-5.2, 2026-08-10): project.name is only trimmed on
    // create, so a name containing a quote or a control character lands
    // unescaped in Content-Disposition. Node rejects literal CRLF so this is not
    // response splitting, but the quoting still breaks. Strip it at the sink.
    const safeName =
      String(project.name ?? 'project')
        .replace(/[^A-Za-z0-9._ -]/g, '_')
        .trim()
        .slice(0, 100) || 'project'

    const headers = new Headers()
    
    if (format === 'pdf') {
      headers.set('Content-Type', 'application/pdf')
      headers.set('Content-Disposition', `attachment; filename="${safeName}_${documentType}.pdf"`)
      return new NextResponse(documentContent, { headers })
    } else if (format === 'csv') {
      headers.set('Content-Type', 'text/csv')
      headers.set('Content-Disposition', `attachment; filename="${safeName}_${documentType}.csv"`)
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