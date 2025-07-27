import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads')
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
    }

    // Save the uploaded file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const filename = `upload_${Date.now()}_${file.name}`
    const filepath = path.join(uploadsDir, filename)
    
    fs.writeFileSync(filepath, buffer)

    // Process the file using Python script
    const pythonScript = path.join(process.cwd(), 'analyze_script.py')
    
    try {
      const { stdout, stderr } = await execAsync(`python3 "${pythonScript}" "${filepath}"`)
      
      if (stderr) {
        console.error('Python script stderr:', stderr)
      }

      const result = JSON.parse(stdout)

      // Clean up uploaded file
      fs.unlinkSync(filepath)

      return NextResponse.json(result)
    } catch (error) {
      console.error('Error executing Python script:', error)
      
      // Fallback: basic text analysis
      const content = fs.readFileSync(filepath, 'utf-8')
      const lines = content.split('\n').filter(line => line.trim())
      
      // Simple message count analysis
      let messageCount = 0
      const participants = new Set<string>()
      
      for (const line of lines) {
        // Look for WhatsApp message pattern: [date, time] sender: message
        const match = line.match(/^\[.+?\]\s*(.+?):\s*(.+)$/)
        if (match) {
          messageCount++
          participants.add(match[1].trim())
        }
      }

      // Clean up uploaded file
      fs.unlinkSync(filepath)

      const result = {
        totalMessages: messageCount,
        participants: participants.size,
        daysActive: Math.ceil(messageCount / 10), // Rough estimate
        avgPerDay: participants.size > 0 ? Math.round(messageCount / Math.max(1, Math.ceil(messageCount / 10))) : 0,
        analysis: 'Basic analysis (Python processing failed)',
        error: 'Advanced analysis unavailable'
      }

      return NextResponse.json(result)
    }
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Failed to process file' },
      { status: 500 }
    )
  }
} 