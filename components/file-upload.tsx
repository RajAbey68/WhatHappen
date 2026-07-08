'use client'

import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Upload, File, CheckCircle, XCircle, Loader2, FileText, Archive, Code, Sparkles } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { encryptText, encryptTextBatch } from '@/lib/crypto'
import JSZip from 'jszip'
import { AgentBuilder } from './agent-builder'
import { AgentConfig } from '@/lib/types/agent'
import { AgentDashboard } from './agent-dashboard'

async function stripVideosFromZip(file: File): Promise<File> {
  const zip = new JSZip()
  const loadedZip = await zip.loadAsync(file)
  const newZip = new JSZip()
  
  let videoFilesRemoved = 0
  let originalFileCount = 0
  let totalDecompressedBytes = 0
  
  const MAX_ZIP_ENTRIES = 1000
  const MAX_TOTAL_DECOMPRESSED = 200 * 1024 * 1024 // 200MB
  
  const entries = Object.entries(loadedZip.files)
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP archive has too many entries (${entries.length}). Maximum allowed: ${MAX_ZIP_ENTRIES}.`)
  }
  
  const videoExtensions = ['.mp4', '.mov', '.avi', '.3gp', '.mkv', '.webm', '.ogg']
  
  for (const [relativePath, zipEntry] of entries) {
    if (zipEntry.dir) continue
    originalFileCount++
    
    const isVideo = videoExtensions.some(ext => relativePath.toLowerCase().endsWith(ext))
    if (isVideo) {
      videoFilesRemoved++
      continue
    }
    
    const content = await zipEntry.async('blob')
    totalDecompressedBytes += content.size
    
    if (totalDecompressedBytes > MAX_TOTAL_DECOMPRESSED) {
      throw new Error(`ZIP archive decompresses to too much data. Maximum allowed: ${MAX_TOTAL_DECOMPRESSED / 1024 / 1024} MB.`)
    }
    
    newZip.file(relativePath, content)
  }
  
  if (videoFilesRemoved === 0) {
    return file
  }
  
  console.log(`[ZIP strip] Removed ${videoFilesRemoved} video file(s) of ${originalFileCount} total files.`)
  const newZipBlob = await newZip.generateAsync({ type: 'blob' })
  return new globalThis.File([newZipBlob], file.name, { type: file.type })
}

interface FileUploadProps {
  onFileProcessed: (data: any) => void
  projectId: string
  passphrase?: string
}

interface UploadedFile {
  file: File
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  error?: string
  data?: any
  processingStep?: string
}

// Files larger than this go through the GCS signed-URL path (upload-url API)
const GCS_THRESHOLD = 10 * 1024 * 1024 // 10 MB — matches process-file limit
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500 MB hard cap

export function FileUpload({ onFileProcessed, projectId, passphrase }: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [aggregatedData, setAggregatedData] = useState<any>(null)
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    expertId: 'GENERAL_ANALYST',
    jurisdiction: 'UK',
    regulator: 'NONE'
  })
  const abortControllerRef = useRef<AbortController | null>(null)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => ({
      file,
      status: 'pending' as const,
      progress: 0
    }))
    
    setUploadedFiles(prev => [...prev, ...newFiles])
    processFiles(newFiles)
  }, [projectId, passphrase])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip'],
      'application/json': ['.json'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/pdf': ['.pdf'],
      'text/csv': ['.csv']
    },
    multiple: true,
    maxSize: MAX_FILE_SIZE,
    onDropRejected: (rejectedFiles) => {
      rejectedFiles.forEach((rejected) => {
        toast({
          title: "File too large",
          description: `${rejected.file.name} exceeds the 500MB limit (${(rejected.file.size / 1024 / 1024).toFixed(1)} MB).`,
          variant: "destructive",
        })
      })
    }
  })

  const updateProgress = (file: File, progress: number) => {
    setUploadedFiles(prev => 
      prev.map(f => 
        f.file === file 
          ? { ...f, progress }
          : f
      )
    )
  }

  const processFiles = async (files: UploadedFile[]) => {
    setIsProcessing(true)
    abortControllerRef.current = new AbortController()
    const { signal } = abortControllerRef.current
    
    let authHeader: Record<string, string> = {}
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        authHeader = { 'Authorization': `Bearer ${session.access_token}` }
      }
    } catch (e) {
      console.error('Error fetching Supabase session:', e)
    }
    
    const uploadPromises = files.map(async (uploadedFile) => {
      try {
        setUploadedFiles(prev => 
          prev.map(f => 
            f.file === uploadedFile.file 
              ? { ...f, status: 'processing', progress: 5 }
              : f
          )
        )

        let currentFile = uploadedFile.file

        const isTextOrJson = currentFile.name.endsWith('.txt') || currentFile.name.endsWith('.json')
        let resultData: any

        if (isTextOrJson) {
          const fileContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(new Error('Failed to read file'))
            reader.readAsText(currentFile)
          })

          updateProgress(uploadedFile.file, 10)

          resultData = await new Promise((resolve, reject) => {
            const worker = new Worker('/workers/parser.js')
            
            worker.onmessage = (e) => {
              const { type, percent, data, error } = e.data
              if (type === 'progress') {
                updateProgress(uploadedFile.file, 10 + Math.round(percent * 0.85))
              } else if (type === 'complete') {
                worker.terminate()
                resolve(data)
              } else if (type === 'error') {
                worker.terminate()
                reject(new Error(error))
              }
            }

            worker.onerror = (err) => {
              worker.terminate()
              reject(err)
            }

            worker.postMessage({ fileContent, fileName: currentFile.name })
          })
        } else {
          const MAX_LOCAL_SIZE = 10 * 1024 * 1024 // 10MB
          if (currentFile.size > MAX_LOCAL_SIZE) {
            const urlRes = await fetch('/api/upload-url', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                ...authHeader
              },
              body: JSON.stringify({
                fileName: currentFile.name,
                fileSize: currentFile.size,
                mimeType: currentFile.type || 'application/octet-stream',
                sourceApp: 'whathappen',
                agentConfig
              })
            })

            if (!urlRes.ok) {
              const errData = await urlRes.json().catch(() => ({}))
              throw new Error(errData.error || `Failed to fetch upload URL (${urlRes.status})`)
            }

            const { sessionId, uploadUrl } = await urlRes.json()
            const isLocalFallback = uploadUrl.startsWith('/api/') || uploadUrl.includes('process-file')

            if (isLocalFallback) {
              const formData = new FormData()
              formData.append('file', currentFile)

              setUploadedFiles(prev => 
                prev.map(f => 
                  f.file === uploadedFile.file ? { ...f, progress: 30 } : f
                )
              )

              const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { ...authHeader },
                body: formData,
              })

              const result = await response.json()

              if (!response.ok || !result.success) {
                throw new Error(result.error || `Upload failed: ${response.statusText}`)
              }

              resultData = result.data
            } else {
              setUploadedFiles(prev => 
                prev.map(f => 
                  f.file === uploadedFile.file ? { ...f, progress: 20 } : f
                )
              )

              const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                  'Content-Type': currentFile.type || 'application/octet-stream',
                },
                body: currentFile,
              })

              if (!uploadResponse.ok) {
                throw new Error(`Direct upload to storage failed (${uploadResponse.status})`)
              }

              setUploadedFiles(prev => 
                prev.map(f => 
                  f.file === uploadedFile.file ? { ...f, progress: 60 } : f
                )
              )

              fetch(`/api/process-file?sessionId=${sessionId}`, {
                method: 'POST',
                headers: { ...authHeader },
              }).catch(err => {
                console.error('Failed to trigger background processing:', err)
              })

              const { supabase } = await import('@/lib/supabase')

              let isDone = false
              let attempts = 0
              let consecutiveErrors = 0
              while (!isDone && attempts < 60) {
                await new Promise(resolve => setTimeout(resolve, 2000))
                attempts++

                const { data: session, error: pollError } = await supabase
                  .from('sessions')
                  .select('processing_status, processing_error, total_messages, date_range_start, date_range_end')
                  .eq('id', sessionId)
                  .single()

                if (pollError) {
                  console.error('Polling error:', pollError.message)
                  consecutiveErrors++
                  if (consecutiveErrors >= 5) {
                    throw new Error(`Database connection failed: ${pollError.message}`)
                  }
                  continue
                }
                consecutiveErrors = 0

                if (session.processing_status === 'processing' && session.processing_error) {
                  setUploadedFiles(prev => 
                    prev.map(f => 
                      f.file === uploadedFile.file 
                        ? { ...f, processingStep: session.processing_error }
                        : f
                    )
                  )
                }

                if (session.processing_status === 'complete') {
                  isDone = true
                  resultData = {
                    fileId: sessionId,
                    chatId: sessionId,
                    fileName: currentFile.name,
                    fileSize: currentFile.size,
                    processedAt: new Date().toISOString(),
                    totalMessages: session.total_messages || 0,
                    participants: [],
                    messages: [],
                    analysis: {
                      totalMessages: session.total_messages || 0,
                      participants: [],
                      dateRange: {
                        start: session.date_range_start,
                        end: session.date_range_end,
                      },
                      messagesByParticipant: {},
                      averageSentiment: 0,
                      topWords: [],
                      dailyMessageCounts: [],
                      hourlyDistribution: {},
                      mediaMessages: 0,
                      textMessages: 0,
                      averageMessageLength: 0
                    },
                    sentimentAnalysis: { byParticipant: {}, average: 0 },
                    timeAnalysis: { dailyDistribution: {}, hourlyDistribution: {} },
                    wordFrequency: {}
                  }
                }

                if (session.processing_status === 'failed') {
                  throw new Error(session.processing_error || 'Processing failed on the server')
                }
              }

              if (!isDone) {
                throw new Error('Processing timed out. Please check session history later.')
              }
            }
          } else {
            const formData = new FormData()
            formData.append('file', currentFile)

            const response = await fetch('/api/process-file', {
              method: 'POST',
              headers: { ...authHeader },
              body: formData,
            })

            const result = await response.json()

            if (!response.ok || !result.success) {
              throw new Error(result.error || `Upload failed: ${response.statusText}`)
            }

            resultData = result.data
          }
        }

        // Encrypt messages if passphrase is provided (batch — derives key ONCE)
        let finalMessages = resultData.messages || []
        if (passphrase && finalMessages.length > 0) {
          updateProgress(uploadedFile.file, 95)
          
          // Collect all texts to encrypt (sender + message per row)
          const senders = finalMessages.map((msg: any) => msg.sender || 'Unknown')
          const messages = finalMessages.map((msg: any) => msg.message || '')

          // Two batch calls — each derives PBKDF2 key only once
          const [encSenders, encMessages] = await Promise.all([
            encryptTextBatch(senders, passphrase),
            encryptTextBatch(messages, passphrase),
          ])

          finalMessages = finalMessages.map((msg: any, i: number) => ({
            ...msg,
            sender: JSON.stringify(encSenders[i]),
            message: JSON.stringify(encMessages[i]),
          }))
        }

        const completeResponse = await fetch('/api/process-whatsapp-complete', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...authHeader
          },
          body: JSON.stringify({
            projectId: projectId,
            chatData: resultData,
            messages: finalMessages
          }),
          signal,
        })

        if (!completeResponse.ok) {
          const errRes = await completeResponse.json().catch(() => ({}))
          throw new Error(errRes.error || 'Failed to save chat data to database')
        }

        setUploadedFiles(prev => 
          prev.map(f => 
            f.file === uploadedFile.file 
              ? { ...f, status: 'completed', progress: 100, data: resultData }
              : f
          )
        )

        toast({
          title: "✨ File processed successfully",
          description: `${uploadedFile.file.name} has been analyzed.`,
        })

        return resultData

      } catch (error) {
        if (signal.aborted) {
          setUploadedFiles(prev => 
            prev.map(f => 
              f.file === uploadedFile.file 
                ? { ...f, status: 'error', progress: 0, error: 'Upload cancelled' }
                : f
            )
          )
          return null
        }

        setUploadedFiles(prev => 
          prev.map(f => 
            f.file === uploadedFile.file 
              ? { 
                  ...f, 
                  status: 'error', 
                  progress: 0, 
                  error: error instanceof Error ? error.message : 'Unknown error'
                }
              : f
          )
        )

        toast({
          title: "Upload failed",
          description: `Failed to process ${uploadedFile.file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: "destructive",
        })
        return null
      }
    })

    const results = await Promise.all(uploadPromises)
    const processedResults = results.filter(r => r !== null)

    if (processedResults.length > 1) {
      const aggregated = aggregateMultipleFiles(processedResults)
      setAggregatedData(aggregated)
      
      toast({
        title: "✨ Multi-file analysis complete",
        description: `Successfully processed and aggregated ${processedResults.length} files.`,
      })

      if (onFileProcessed) {
        onFileProcessed(aggregated)
      }
    } else if (processedResults.length === 1) {
      if (onFileProcessed) {
        onFileProcessed(processedResults[0])
      }
    }

    setIsProcessing(false)
    abortControllerRef.current = null
  }

  /**
   * Upload large files via GCS signed URL:
   * 1. POST /api/upload-url to get a signed write URL + sessionId
   * 2. PUT the file directly to GCS
   * 3. Poll /api/process-file?sessionId=... for processing status (or trigger async)
   */
  const uploadViaGCS = async (file: File, signal: AbortSignal): Promise<any> => {
    // Step 1: Request a signed upload URL
    const urlResponse = await fetch('/api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
      }),
      signal,
    })

    if (!urlResponse.ok) {
      const err = await urlResponse.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to get upload URL')
    }

    const { sessionId, uploadUrl, gcsPath } = await urlResponse.json()
    updateProgress(file, 15)

    // Step 2: Upload directly to GCS (or local dev fallback)
    if (gcsPath) {
      // Real GCS upload with progress tracking via XMLHttpRequest
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = 15 + Math.round((e.loaded / e.total) * 70) // 15% → 85%
            updateProgress(file, percent)
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`GCS upload failed: ${xhr.statusText}`))
        }

        xhr.onerror = () => reject(new Error('GCS upload network error'))
        xhr.onabort = () => reject(new Error('Upload cancelled'))
        signal.addEventListener('abort', () => xhr.abort())

        xhr.send(file)
      })
    } else {
      // Local dev fallback: POST to /api/process-file with sessionId
      const formData = new FormData()
      formData.append('file', file)
      formData.append('sessionId', sessionId)

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Upload failed')
      }

      const result = await response.json()
      if (!result.success) throw new Error(result.error || 'Processing failed')
      return result.data
    }

    updateProgress(file, 90)

    // Step 3: Trigger server-side processing of the uploaded GCS file
    // The process-file route reads from GCS when sessionId is provided
    const processResponse = await fetch('/api/process-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, gcsPath, fileName: file.name }),
      signal,
    })

    if (!processResponse.ok) {
      const err = await processResponse.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to process uploaded file')
    }

    const processResult = await processResponse.json()
    if (!processResult.success) throw new Error(processResult.error || 'Processing failed')
    return processResult.data
  }

  const cancelProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  const aggregateMultipleFiles = (results: any[]) => {
    const aggregated = {
      fileIds: results.map(r => r.fileId),
      chatIds: results.map(r => r.chatId),
      fileName: `Aggregated Analysis (${results.length} files)`,
      fileSize: results.reduce((sum, r) => sum + r.fileSize, 0),
      processedAt: new Date().toISOString(),
      totalMessages: results.reduce((sum, r) => sum + r.totalMessages, 0),
      participants: [] as Array<{ name: string }>,
      messages: [] as any[],
      analysis: {
        totalMessages: 0,
        participants: [] as string[],
        dateRange: { start: null as Date | null, end: null as Date | null },
        messagesByParticipant: {} as Record<string, number>,
        averageSentiment: 0,
        topWords: [] as Array<{ word: string; count: number }>,
        dailyMessageCounts: [] as any[],
        hourlyDistribution: {} as Record<string, number>,
        mediaMessages: 0,
        textMessages: 0,
        averageMessageLength: 0
      },
      sentimentAnalysis: {
        byParticipant: {} as Record<string, number>,
        average: 0
      },
      timeAnalysis: {
        dailyDistribution: {} as Record<string, number>,
        hourlyDistribution: {} as Record<string, number>
      },
      wordFrequency: {} as Record<string, number>
    }

    // Aggregate participants
    const allParticipants = new Set<string>()
    results.forEach(result => {
      result.participants.forEach((p: any) => {
        allParticipants.add(p.name)
      })
    })
    aggregated.participants = Array.from(allParticipants).map(name => ({ name }))

    // Aggregate messages (limited to first 50 from each file)
    results.forEach(result => {
      aggregated.messages.push(...result.messages.slice(0, 50))
    })

    // Aggregate analysis data
    let totalSentiment = 0
    let sentimentCount = 0
    const combinedWordFreq: any = {}
    const combinedMessagesByParticipant: any = {}
    const combinedHourlyDist: any = {}
    let allDates: Date[] = []

    results.forEach(result => {
      // Total messages
      aggregated.analysis.totalMessages += result.totalMessages

      // Participants and messages by participant
      Object.entries(result.analysis.messagesByParticipant || {}).forEach(([name, count]) => {
        combinedMessagesByParticipant[name] = (combinedMessagesByParticipant[name] || 0) + (count as number)
      })

      // Sentiment
      if (result.analysis.averageSentiment) {
        totalSentiment += result.analysis.averageSentiment * result.totalMessages
        sentimentCount += result.totalMessages
      }

      // Word frequency
      Object.entries(result.wordFrequency || {}).forEach(([word, count]) => {
        combinedWordFreq[word] = (combinedWordFreq[word] || 0) + (count as number)
      })

      // Hourly distribution
      Object.entries(result.timeAnalysis.hourlyDistribution || {}).forEach(([hour, count]) => {
        combinedHourlyDist[hour] = (combinedHourlyDist[hour] || 0) + (count as number)
      })

      // Media and text messages
      aggregated.analysis.mediaMessages += result.analysis.mediaMessages || 0
      aggregated.analysis.textMessages += result.analysis.textMessages || 0

      // Date range
      if (result.analysis.dateRange) {
        allDates.push(new Date(result.analysis.dateRange.start))
        allDates.push(new Date(result.analysis.dateRange.end))
      }
    })

    // Finalize aggregated data
    aggregated.analysis.participants = Array.from(allParticipants)
    aggregated.analysis.messagesByParticipant = combinedMessagesByParticipant
    aggregated.analysis.averageSentiment = sentimentCount > 0 ? totalSentiment / sentimentCount : 0
    aggregated.analysis.hourlyDistribution = combinedHourlyDist
    
    // Top words (top 20 from combined frequency)
    aggregated.analysis.topWords = Object.entries(combinedWordFreq)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 20)
      .map(([word, count]) => ({ word, count: count as number }))

    aggregated.wordFrequency = combinedWordFreq
    aggregated.timeAnalysis.hourlyDistribution = combinedHourlyDist

    // Date range
    if (allDates.length > 0) {
      allDates.sort((a, b) => a.getTime() - b.getTime())
      aggregated.analysis.dateRange = {
        start: allDates[0],
        end: allDates[allDates.length - 1]
      }
    }

    // Average message length
    aggregated.analysis.averageMessageLength = aggregated.analysis.textMessages > 0 
      ? aggregated.analysis.totalMessages / aggregated.analysis.textMessages 
      : 0

    return aggregated
  }

  const removeFile = (fileToRemove: File) => {
    setUploadedFiles(prev => prev.filter(f => f.file !== fileToRemove))
  }

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.txt')) return <FileText className="h-5 w-5 text-blue-500" />
    if (fileName.endsWith('.zip')) return <Archive className="h-5 w-5 text-purple-500" />
    if (fileName.endsWith('.json')) return <Code className="h-5 w-5 text-green-500" />
    return <File className="h-5 w-5 text-gray-500" />
  }

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'processing':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      default:
        return <File className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusBadge = (status: UploadedFile['status']) => {
    const variants = {
      pending: { variant: 'secondary' as const, label: 'Pending', color: 'bg-slate-100 text-slate-700' },
      processing: { variant: 'default' as const, label: 'Processing', color: 'bg-blue-100 text-blue-700' },
      completed: { variant: 'default' as const, label: 'Completed', color: 'bg-green-100 text-green-700' },
      error: { variant: 'destructive' as const, label: 'Error', color: 'bg-red-100 text-red-700' }
    }

    const config = variants[status]
    return (
      <Badge className={`text-xs px-2 py-1 ${config.color} border-0`}>
        {config.label}
      </Badge>
    )
  }

  return (
    <div className="space-y-8">
      <AgentBuilder 
        disabled={isProcessing} 
        onConfigChange={(config) => setAgentConfig(config)} 
      />

      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={`relative group cursor-pointer transition-all duration-300 ${
          isDragActive 
            ? 'scale-105' 
            : 'hover:scale-[1.02]'
        }`}
      >
        <input {...getInputProps()} />
        <div className={`
          relative border-2 border-dashed rounded-3xl p-12 text-center transition-all duration-300
          ${isDragActive 
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 shadow-lg' 
            : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
          }
        `}>
          <div className="flex flex-col items-center space-y-6">
            <div className={`
              relative p-6 rounded-full transition-all duration-300
              ${isDragActive 
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 shadow-xl scale-110' 
                : 'bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 group-hover:from-blue-500 group-hover:to-purple-600 group-hover:shadow-lg'
              }
            `}>
              <Upload className={`h-12 w-12 transition-colors duration-300 ${
                isDragActive ? 'text-white' : 'text-slate-600 dark:text-slate-300 group-hover:text-white'
              }`} />
              <div className="absolute -top-2 -right-2 p-1 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 animate-pulse">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
            </div>
            
            <div className="space-y-3">
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white">
                {isDragActive ? 'Drop your files here!' : 'Drag & Drop Your Chats'}
              </h3>
              <p className="text-lg text-slate-600 dark:text-slate-300 max-w-md">
                {isDragActive 
                  ? 'Release to start the magic ✨' 
                  : 'Or click to browse and select your WhatsApp export files'
                }
              </p>
            </div>

            {/* Supported Formats */}
            <div className="flex flex-wrap justify-center gap-3 pt-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 rounded-full shadow-sm border border-slate-200 dark:border-slate-700">
                <FileText className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">.txt files</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 rounded-full shadow-sm border border-slate-200 dark:border-slate-700">
                <Archive className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">.zip archives</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 rounded-full shadow-sm border border-slate-200 dark:border-slate-700">
                <Code className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">.json data</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* File Processing Status */}
      {uploadedFiles.length > 0 && (
        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-xl rounded-2xl overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600">
                <File className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                  Processing Files
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {uploadedFiles.filter(f => f.status === 'completed').length} of {uploadedFiles.length} files completed
                </p>
              </div>
              {isProcessing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelProcessing}
                  className="text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              )}
            </div>
            
            <div className="space-y-4">
              {uploadedFiles.map((uploadedFile, index) => (
                <div key={index} className="group p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600 hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getFileIcon(uploadedFile.file.name)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 dark:text-white truncate">
                          {uploadedFile.file.name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {getStatusBadge(uploadedFile.status)}
                      {getStatusIcon(uploadedFile.status)}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(uploadedFile.file)}
                        disabled={uploadedFile.status === 'processing'}
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {uploadedFile.status === 'processing' && (
                    <div className="space-y-2">
                      <Progress 
                        value={uploadedFile.progress} 
                        className="h-2 bg-slate-200 dark:bg-slate-600"
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                        {uploadedFile.progress}% - {uploadedFile.processingStep || 'Analyzing with AI...'}
                      </p>
                    </div>
                  )}
                  
                  {uploadedFile.error && (
                    <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {uploadedFile.error}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {isProcessing && (
              <div className="mt-6 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    AI is analyzing your conversations...
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Agent Monitoring Dashboard */}
      {uploadedFiles.length > 0 && <AgentDashboard />}
    </div>
  )
}