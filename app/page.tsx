'use client'

import { useState, useEffect } from 'react'
import { ProjectSelector } from '@/components/project-selector'
import { FileUpload } from '@/components/file-upload'
import { AIChatInterface } from '@/components/ai-chat-interface'
import { DatabaseViewer } from '@/components/database-viewer'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Project } from '@/lib/supabase'
import { Upload, MessageSquare, BarChart3, FileText, Bot, Database, Key, Shield, RefreshCw, Clock, Eye } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { decryptText } from '@/lib/crypto'
import {
  setPassphrase as storePassphrase,
  getPassphrase as readPassphrase,
  clearPassphrase as dropPassphrase,
  ensureProjectToken,
  projectAuthHeaders,
} from '@/lib/session-store'
import { BottomSheet, BottomSheetContent, BottomSheetHeader, BottomSheetTitle } from '@/components/ui/bottom-sheet'
import { ReportViewerModal } from '@/components/report-viewer-modal'

// Strip path separators / control chars and bound length so a project name
// can't produce a malformed or unsafe download filename.
function safeFileName(name: string): string {
  return (name || 'project')
    .replace(/[/\\?%*:|"<>\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 100)
    || 'project'
}

export default function Home() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [processedData, setProcessedData] = useState<any>(null)
  const [isGeneratingDoc, setIsGeneratingDoc] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('upload')

  // Zero-Knowledge Passphrase states
  const [passphrase, setPassphrase] = useState<string>('')
  const [showPassphrasePrompt, setShowPassphrasePrompt] = useState(false)
  const [tempPassphrase, setTempPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [passphraseError, setPassphraseError] = useState('')
  const [isNewProjectPassphrase, setIsNewProjectPassphrase] = useState(false)
  const [isVerifyingPassphrase, setIsVerifyingPassphrase] = useState(false)

  // Client-side decrypted messages data
  const [decryptedData, setDecryptedData] = useState<any>(null)
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [decryptProgress, setDecryptProgress] = useState({ current: 0, total: 0 })
  const [decryptedResponseTimes, setDecryptedResponseTimes] = useState<Record<string, number> | null>(null)
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // On-screen Report Preview state
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean
    title: string
    subtitle: string
    documentType: string
  }>({
    isOpen: false,
    title: '',
    subtitle: '',
    documentType: 'summary'
  })

  // Auto-restore active project (last project, single migrated project, or Ko Lake project)
  useEffect(() => {
    const restoreProject = async () => {
      if (typeof window === 'undefined') return
      const lastProjectId = localStorage.getItem('whathappen-last-project-id')

      try {
        const res = await fetch('/api/projects')
        if (res.ok) {
          const projects: Project[] = await res.json()
          if (!projects || projects.length === 0) return

          // 1. Check last active project from localStorage
          let target = lastProjectId ? projects.find((p) => p.id === lastProjectId) : null

          // 2. If no last project stored, check for Ko Lake project or single migrated project
          if (!target) {
            target = projects.find((p) => /ko\s*lake/i.test(p.name)) || (projects.length === 1 ? projects[0] : null)
          }

          if (target) {
            handleProjectSelect(target)
          }
        }
      } catch (e) {
        console.error('Failed to auto-restore project:', e)
      }
    }

    restoreProject()
  }, [])

  // Automatically decrypt response times participant keys when project or passphrase changes
  useEffect(() => {
    const decryptTimes = async () => {
      const times = selectedProject?.analysis?.averageResponseTimes
      if (!times || typeof times !== 'object') {
        setDecryptedResponseTimes(null)
        return
      }

      const decrypted: Record<string, number> = {}
      for (const [key, seconds] of Object.entries(times)) {
        let displayName = key
        if (passphrase) {
          try {
            const enc = JSON.parse(key)
            if (enc.ciphertext && enc.salt && enc.iv) {
              displayName = await decryptText(enc.ciphertext, passphrase, enc.salt, enc.iv)
            }
          } catch (e) {
            // Keep plaintext or formatted name
          }
        }
        decrypted[displayName] = seconds as number
      }
      setDecryptedResponseTimes(decrypted)
    }

    decryptTimes()
  }, [selectedProject?.analysis?.averageResponseTimes, passphrase])

  // Handle tab changes with mobile bottom sheet redirection
  const handleTabChange = (value: string) => {
    if (value === 'ai-chat' && typeof window !== 'undefined' && window.innerWidth < 640) {
      setIsMobileChatOpen(true)
    } else {
      setActiveTab(value)
    }
  }

  // Load and decrypt messages from database locally on the client without freezing the main thread
  const loadAndDecryptMessages = async (projectId: string, currentPassphrase: string) => {
    setIsDecrypting(true)
    try {
      const response = await fetch(`/api/ai-chat/${projectId}`, {
        headers: {
          // RAJ-747: short-lived signed token carries authorization.
          ...(await projectAuthHeaders(projectId)),
        }
      })
      if (response.ok) {
        const result = await response.json()
        const recentMessages = result.recentMessages || []
        const total = recentMessages.length
        setDecryptProgress({ current: 0, total })

        // Process in non-blocking batches of 100 to yield to the browser's render loop
        const CHUNK_SIZE = 100
        const decrypted: any[] = []

        for (let i = 0; i < recentMessages.length; i += CHUNK_SIZE) {
          const chunk = recentMessages.slice(i, i + CHUNK_SIZE)
          const decryptedChunk = await Promise.all(
            chunk.map(async (msg: any) => {
              let decryptedMessage = msg.message
              let decryptedSender = msg.sender

              try {
                const messageEnc = JSON.parse(msg.message)
                if (messageEnc.ciphertext && messageEnc.salt && messageEnc.iv) {
                  decryptedMessage = await decryptText(
                    messageEnc.ciphertext,
                    currentPassphrase,
                    messageEnc.salt,
                    messageEnc.iv
                  )
                }
              } catch (e) {}

              try {
                const senderEnc = JSON.parse(msg.sender)
                if (senderEnc.ciphertext && senderEnc.salt && senderEnc.iv) {
                  decryptedSender = await decryptText(
                    senderEnc.ciphertext,
                    currentPassphrase,
                    senderEnc.salt,
                    senderEnc.iv
                  )
                }
              } catch (e) {}

              return {
                ...msg,
                sender: decryptedSender,
                message: decryptedMessage
              }
            })
          )
          decrypted.push(...decryptedChunk)
          setDecryptProgress({ current: decrypted.length, total })

          // Yield to browser UI thread
          await new Promise(resolve => setTimeout(resolve, 0))
        }

        const constructedData = {
          fileName: result.project?.name || 'Project Chats',
          fileSize: 0,
          processedAt: result.project?.updatedAt,
          totalMessages: result.project?.messageCount || decrypted.length,
          messages: decrypted,
          analysis: result.project?.analysis
        }

        setDecryptedData(constructedData)
        setProcessedData(constructedData)
      }
    } catch (error) {
      console.error('Error loading or decrypting messages:', error)
    } finally {
      setIsDecrypting(false)
    }
  }

  /**
   * RAJ-781: `GET /api/projects` is unauthenticated, so it no longer returns
   * `participants` (real names) or `analysis` (message-derived insights). Five
   * places in the UI read `selectedProject.participants`, so without this they
   * would all silently render 0 and the participants panel would vanish.
   *
   * The fix is not to put the PII back in the anonymous list — it is to fetch
   * the full record from `GET /api/projects/[id]`, which IS gated by
   * requireProjectAccess, once the passphrase has been proven. Same data, but
   * only for a caller who has earned it.
   */
  const hydrateProjectDetail = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        headers: { ...(await projectAuthHeaders(projectId)) },
      })
      if (!res.ok) return
      const { project: full } = await res.json()
      if (!full) return
      setSelectedProject((prev) =>
        prev && prev.id === projectId ? { ...prev, ...full } : prev
      )
    } catch {
      // Non-fatal: the picker's fields are already displayed.
    }
  }

  const handleProjectSelect = async (project: Project | null) => {
    setDecryptedData(null)
    setProcessedData(null)
    setActiveTab('upload')

    if (!project) {
      setSelectedProject(null)
      setPassphrase('')
      if (typeof window !== 'undefined') {
        localStorage.removeItem('whathappen-last-project-id')
      }
      return
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('whathappen-last-project-id', project.id)
    }

    // RAJ-746: read from the in-memory store, never sessionStorage.
    const cached = readPassphrase(project.id)
    if (cached) {
      // RAJ-747 rework: re-prove passphrase knowledge to (re)mint a token.
      // If the server is unconfigured or the cached passphrase is stale,
      // do NOT reveal the project — show the gate instead.
      setIsVerifyingPassphrase(true)
      try {
        const token = await ensureProjectToken(project.id)
        if (!token) {
          // Can't prove — don't set the project; force the user through the prompt.
          dropPassphrase(project.id)
          setSelectedProject(project) // set so the Dialog has context
          setTempPassphrase('')
          setConfirmPassphrase('')
          setPassphraseError('')
          setIsNewProjectPassphrase(project.messageCount === 0)
          setShowPassphrasePrompt(true)
        } else {
          setSelectedProject(project)
          setPassphrase(cached)
          void hydrateProjectDetail(project.id)
          loadAndDecryptMessages(project.id, cached)
        }
      } catch {
        dropPassphrase(project.id)
        setSelectedProject(project) // set so the Dialog has context
        setTempPassphrase('')
        setConfirmPassphrase('')
        setPassphraseError('Verification failed. Please re-enter your passphrase.')
        setIsNewProjectPassphrase(project.messageCount === 0)
        setShowPassphrasePrompt(true)
      } finally {
        setIsVerifyingPassphrase(false)
      }
    } else {
      setSelectedProject(project) // set so the Dialog has context
      setTempPassphrase('')
      setConfirmPassphrase('')
      setPassphraseError('')
      setIsNewProjectPassphrase(project.messageCount === 0)
      setShowPassphrasePrompt(true)
    }
  }

  const handlePassphraseSubmit = async () => {
    if (!tempPassphrase.trim()) {
      setPassphraseError('Passphrase is required')
      return
    }

    if (isNewProjectPassphrase && tempPassphrase !== confirmPassphrase) {
      setPassphraseError('Passphrases do not match')
      return
    }

    if (!selectedProject) return

    setIsVerifyingPassphrase(true)
    setPassphraseError('')

    try {
      // RAJ-746: keep the raw passphrase in memory only (XSS cannot recover it
      // from web storage after a reload, and it is never persisted).
      storePassphrase(selectedProject.id, tempPassphrase)

      // RAJ-747: prove passphrase knowledge to the server BEFORE opening the gate.
      // The old code fired ensureProjectToken as fire-and-forget and dismissed
      // the prompt unconditionally — a wrong passphrase (or an unconfigured
      // server) silently let the user in, failing later with a cryptic 401 at
      // upload time. Now we await the handshake and block on failure.
      const token = await ensureProjectToken(selectedProject.id)

      if (!token) {
        // Token minting failed: either the passphrase is wrong, or the server
        // is not configured (WHATSAPP_PASSPHRASE_HASH unset). Either way, do
        // NOT dismiss the gate or reveal the project/dropzone.
        setPassphraseError(
          'Incorrect passphrase, or server verification is unavailable. ' +
          'Please check your passphrase and try again.'
        )
        dropPassphrase(selectedProject.id)
        return
      }

      // Token minted — passphrase is proven. Safe to open the gate.
      setPassphrase(tempPassphrase)
      setShowPassphrasePrompt(false)

      // RAJ-781: hydrate the full project record now that we have auth.
      void hydrateProjectDetail(selectedProject.id)

      if (selectedProject.messageCount > 0) {
        loadAndDecryptMessages(selectedProject.id, tempPassphrase)
      }
    } catch {
      setPassphraseError('Verification failed. Please try again.')
      dropPassphrase(selectedProject.id)
    } finally {
      setIsVerifyingPassphrase(false)
    }
  }

  const handlePassphraseCancel = () => {
    setShowPassphrasePrompt(false)
    if (selectedProject) dropPassphrase(selectedProject.id)
    setSelectedProject(null)
    setPassphrase('')
  }

  // In memory dynamic analysis triggered from client using passphrase
  const handleRunAnalysis = async (analysisType: string = 'comprehensive') => {
    if (!selectedProject) return
    setIsAnalyzing(true)
    try {
      const response = await fetch('/api/analyze-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // RAJ-747: authorization now travels as a short-lived signed token
          // rather than relying on the passphrase as a credential.
          ...(await projectAuthHeaders(selectedProject.id)),
        },
        body: JSON.stringify({
          projectId: selectedProject.id,
          analysisType,
          // Still required as the AES-GCM decryption key for in-memory decrypt;
          // it is not used for authorization.
          passphrase: passphrase || undefined
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success && result.analysis) {
          const updated = {
            ...selectedProject,
            analysis: result.analysis,
            updatedAt: new Date().toISOString()
          }
          setSelectedProject(updated)
          
          // Force refresh decrypted view
          if (passphrase) {
            await loadAndDecryptMessages(selectedProject.id, passphrase)
          }
          
          alert('AI Analysis completed successfully!')
        } else {
          throw new Error(result.error || 'Analysis failed')
        }
      } else {
        throw new Error('Analysis request failed')
      }
    } catch (error) {
      console.error('Analysis error:', error)
      alert(error instanceof Error ? error.message : 'Analysis failed. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleFileProcessed = (data: any) => {
    // Decrypt data is loaded directly from local parsing output
    setDecryptedData(data)
    setProcessedData(data)
    if (selectedProject) {
      const updatedProject = {
        ...selectedProject,
        messageCount: data.totalMessages || 0,
        participants: data.participants?.map((p: any) => p.name || p) || [],
        analysis: data.analysis || data,
        dateRange: data.analysis?.dateRange || data.dateRange,
        updatedAt: new Date().toISOString()
      }
      setSelectedProject(updatedProject)
    }
  }

  const handleDownloadDocument = async (documentType: string, format: string) => {
    if (!selectedProject) return
    const loadingKey = `${documentType}_${format}`
    setIsGeneratingDoc(loadingKey)
    try {
      const response = await fetch('/api/generate-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // RAJ-747: short-lived signed token carries authorization.
          ...(await projectAuthHeaders(selectedProject.id)),
        },
        body: JSON.stringify({
          projectId: selectedProject.id,
          documentType,
          format,
          passphrase: passphrase || undefined /* Decrypt in server memory */
        }),
      })

      if (!response.ok) {
        let serverError = `Request failed (${response.status})`
        try {
          const errBody = await response.json()
          if (errBody?.error) serverError = errBody.error
        } catch {}
        throw new Error(serverError)
      }

      const blob = format === 'json'
        ? new Blob([JSON.stringify(await response.json(), null, 2)], { type: 'application/json' })
        : await response.blob()

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeFileName(selectedProject.name)}_${documentType}.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading document:', error)
      const reason = error instanceof Error ? error.message : 'Unknown error'
      alert(`Could not download document: ${reason}`)
    } finally {
      setIsGeneratingDoc(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 pb-24 sm:pb-8">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-indigo-500 bg-clip-text text-transparent mb-4">
            WhatHappen
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
            Cloud-Hosted, Mobile-First, Zero-Knowledge WhatsApp Analyzer. Private-by-design chat analytics on GCP.
          </p>
        </div>
        
        {/* Project Selector */}
        <div className="mb-8">
          <ProjectSelector 
            onProjectSelect={handleProjectSelect}
            selectedProject={selectedProject}
          />
        </div>
        
        {/* Main Interface */}
        {selectedProject && passphrase ? (
          <div className="space-y-6">
            {/* Project Overview */}
            <Card className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 shadow-md rounded-2xl">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-2xl">{selectedProject.name}</CardTitle>
                      {passphrase && (
                        <Badge variant="outline" className="flex items-center gap-1 text-xs text-green-300 bg-green-950/40 border-green-800/50">
                          <Shield className="h-3 w-3" /> Zero-Knowledge Key Loaded
                        </Badge>
                      )}
                      {isDecrypting && (
                        <Badge variant="outline" className="flex items-center gap-1 text-xs text-blue-300 bg-blue-950/40 border-blue-800/50 animate-pulse">
                          <RefreshCw className="h-3 w-3 animate-spin" /> Decrypting {decryptProgress.current.toLocaleString()} / {decryptProgress.total.toLocaleString()}...
                        </Badge>
                      )}
                    </div>
                    {selectedProject.description && (
                      <CardDescription className="text-base mt-1">
                        {selectedProject.description}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {selectedProject.messageCount > 0 && (
                      <Badge className="bg-green-500 hover:bg-green-600">
                        {selectedProject.messageCount.toLocaleString()} messages
                      </Badge>
                    )}
                    {selectedProject.analysis && (
                      <Badge className="bg-blue-500 hover:bg-blue-600">
                        Analyzed
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              {selectedProject.messageCount > 0 && (
                <CardContent className="px-4 sm:px-6 pb-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-blue-950/40 border border-blue-900/30 rounded-xl">
                      <div className="text-2xl font-bold text-blue-400">
                        {selectedProject.messageCount.toLocaleString()}
                      </div>
                      <div className="text-sm text-blue-300">Total Messages</div>
                    </div>
                    <div className="text-center p-3 bg-green-950/40 border border-green-900/30 rounded-xl">
                      <div className="text-2xl font-bold text-green-400">
                        {selectedProject.participants?.length || 0}
                      </div>
                      <div className="text-sm text-green-300">Participants</div>
                    </div>
                    <div className="text-center p-3 bg-purple-950/40 border border-purple-900/30 rounded-xl">
                      <div className="text-2xl font-bold text-purple-400">
                        {selectedProject.analysis?.keywords?.length || 0}
                      </div>
                      <div className="text-sm text-purple-300">Keywords</div>
                    </div>
                    <div className="text-center p-3 bg-orange-950/40 border border-orange-900/30 rounded-xl">
                      <div className="text-2xl font-bold text-orange-400">
                        {selectedProject.dateRange?.start ? 
                          Math.ceil((new Date(selectedProject.dateRange.end).getTime() - new Date(selectedProject.dateRange.start).getTime()) / (1000 * 60 * 60 * 24)) 
                          : 0}
                      </div>
                      <div className="text-sm text-orange-300">Days Span</div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Tabbed Interface */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
              {/* Desktop Tab bar (hidden on mobile) */}
              <div className="hidden sm:block">
                <TabsList className="grid w-full grid-cols-5 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 h-auto p-2 rounded-2xl shadow-md">
                  <TabsTrigger 
                    value="upload" 
                    className="flex flex-col items-center space-y-1 h-16 data-[state=active]:bg-blue-500 data-[state=active]:text-white rounded-xl"
                  >
                    <Upload className="h-5 w-5" />
                    <span className="text-sm font-medium">Upload & Process</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="chat-reader" 
                    className="flex flex-col items-center space-y-1 h-16 data-[state=active]:bg-teal-500 data-[state=active]:text-white rounded-xl"
                    disabled={!selectedProject.messageCount}
                  >
                    <Database className="h-5 w-5" />
                    <span className="text-sm font-medium">Chat Reader</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="ai-chat" 
                    className="flex flex-col items-center space-y-1 h-16 data-[state=active]:bg-purple-500 data-[state=active]:text-white rounded-xl"
                    disabled={!selectedProject.messageCount}
                  >
                    <Bot className="h-5 w-5" />
                    <span className="text-sm font-medium">AI Chat</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="analysis" 
                    className="flex flex-col items-center space-y-1 h-16 data-[state=active]:bg-green-500 data-[state=active]:text-white rounded-xl"
                    disabled={!selectedProject.messageCount}
                  >
                    <BarChart3 className="h-5 w-5" />
                    <span className="text-sm font-medium">Analysis</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="documents" 
                    className="flex flex-col items-center space-y-1 h-16 data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-xl"
                    disabled={!selectedProject.messageCount}
                  >
                    <FileText className="h-5 w-5" />
                    <span className="text-sm font-medium">Documents</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Mobile Bottom Navigation Bar (fixed bottom, hidden on desktop) */}
              <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg px-4 py-2">
                <TabsList className="grid grid-cols-5 h-16 bg-transparent border-0 gap-1 p-0">
                  <TabsTrigger 
                    value="upload" 
                    className="flex flex-col items-center justify-center space-y-0.5 h-12 text-slate-500 data-[state=active]:text-blue-600 bg-transparent border-0 data-[state=active]:bg-blue-50/50 rounded-xl"
                  >
                    <Upload className="h-5 w-5" />
                    <span className="text-[10px] font-medium">Upload</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="chat-reader" 
                    className="flex flex-col items-center justify-center space-y-0.5 h-12 text-slate-500 data-[state=active]:text-teal-600 bg-transparent border-0 data-[state=active]:bg-teal-50/50 rounded-xl"
                    disabled={!selectedProject.messageCount}
                  >
                    <Database className="h-5 w-5" />
                    <span className="text-[10px] font-medium">Reader</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="ai-chat" 
                    className="flex flex-col items-center justify-center space-y-0.5 h-12 text-slate-500 data-[state=active]:text-purple-600 bg-transparent border-0 data-[state=active]:bg-purple-50/50 rounded-xl"
                    disabled={!selectedProject.messageCount}
                  >
                    <Bot className="h-5 w-5" />
                    <span className="text-[10px] font-medium">AI Chat</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="analysis" 
                    className="flex flex-col items-center justify-center space-y-0.5 h-12 text-slate-500 data-[state=active]:text-green-600 bg-transparent border-0 data-[state=active]:bg-green-50/50 rounded-xl"
                    disabled={!selectedProject.messageCount}
                  >
                    <BarChart3 className="h-5 w-5" />
                    <span className="text-[10px] font-medium">Insights</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="documents" 
                    className="flex flex-col items-center justify-center space-y-0.5 h-12 text-slate-500 data-[state=active]:text-orange-600 bg-transparent border-0 data-[state=active]:bg-orange-50/50 rounded-xl"
                    disabled={!selectedProject.messageCount}
                  >
                    <FileText className="h-5 w-5" />
                    <span className="text-[10px] font-medium">Docs</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Upload & Process Tab */}
              <TabsContent value="upload" className="space-y-6">
                <FileUpload 
                  onFileProcessed={handleFileProcessed}
                  projectId={selectedProject.id}
                  passphrase={passphrase}
                />
              </TabsContent>

              {/* Chat Reader Tab */}
              <TabsContent value="chat-reader" className="space-y-6">
                {selectedProject.messageCount > 0 ? (
                  <DatabaseViewer data={decryptedData} />
                ) : (
                  <Card className="rounded-2xl shadow-sm">
                    <CardContent className="text-center py-12">
                      <Database className="h-16 w-16 mx-auto text-slate-400 mb-4" />
                      <h3 className="text-xl font-semibold mb-2">No Messages Loaded</h3>
                      <p className="text-slate-600">
                        Upload and process WhatsApp chat files to read messages.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* AI Chat Tab (Rendered on desktop; mobile goes to BottomSheet) */}
              <TabsContent value="ai-chat" className="space-y-6 hidden sm:block">
                {selectedProject.messageCount > 0 ? (
                  <AIChatInterface selectedProject={selectedProject} passphrase={passphrase} />
                ) : (
                  <Card className="rounded-2xl shadow-sm">
                    <CardContent className="text-center py-12">
                      <MessageSquare className="h-16 w-16 mx-auto text-slate-400 mb-4" />
                      <h3 className="text-xl font-semibold mb-2">No Chat Data</h3>
                      <p className="text-slate-600">
                        Upload and process WhatsApp chat files to start AI conversations.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Analysis Tab */}
              <TabsContent value="analysis" className="space-y-6">
                {selectedProject.messageCount > 0 ? (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-800">Dynamic Chat Analysis</h3>
                        <p className="text-sm text-slate-600">Securely processed in memory on serverless endpoints.</p>
                      </div>
                      <Button
                        onClick={() => handleRunAnalysis('comprehensive')}
                        disabled={isAnalyzing}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl"
                      >
                        {isAnalyzing ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Analyzing in Memory...
                          </>
                        ) : 'Run/Refresh AI Analysis'}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <BarChart3 className="h-5 w-5 mr-2 text-green-500" />
                            Sentiment Analysis
                          </CardTitle>
                          <CardDescription>Emotional tone and mood patterns</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {selectedProject.analysis?.sentiment?.percentages ? (
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span>Positive</span>
                                <span className="font-bold text-green-600">{selectedProject.analysis.sentiment.percentages.positive}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Neutral</span>
                                <span className="font-bold text-slate-600">{selectedProject.analysis.sentiment.percentages.neutral}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Negative</span>
                                <span className="font-bold text-red-600">{selectedProject.analysis.sentiment.percentages.negative}%</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-slate-600 text-center py-4">
                              No sentiment results. Run AI analysis.
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <MessageSquare className="h-5 w-5 mr-2 text-purple-500" />
                            Activity Patterns
                          </CardTitle>
                          <CardDescription>Timeline statistics and messages</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {selectedProject.analysis?.timeline?.insights ? (
                            <div className="space-y-2 text-sm text-slate-600">
                              <div><strong>Total Days Active:</strong> {selectedProject.analysis.timeline.insights.totalDays} days</div>
                              <div><strong>Average Messages/Day:</strong> {selectedProject.analysis.timeline.insights.averageMessagesPerDay}</div>
                              {selectedProject.analysis.timeline.insights.mostActiveHour && (
                                <div><strong>Peak Hour:</strong> {selectedProject.analysis.timeline.insights.mostActiveHour[0]}</div>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-600 text-center py-4">
                              No activity insights. Run AI analysis.
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <Clock className="h-5 w-5 mr-2 text-blue-500" />
                            Response Time Analysis
                          </CardTitle>
                          <CardDescription>Average reply speed per participant</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {decryptedResponseTimes || selectedProject.analysis?.averageResponseTimes ? (
                            <div className="space-y-2 text-sm text-slate-600">
                              {Object.entries(decryptedResponseTimes || selectedProject.analysis?.averageResponseTimes || {}).map(([participant, seconds]: [string, any]) => {
                                const m = Math.floor(seconds / 60);
                                const s = seconds % 60;
                                const timeStr = m > 0 ? `${m}m ${s}s` : `${s}s`;
                                return (
                                  <div key={participant} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-0">
                                    <span className="font-medium text-slate-700">{participant}</span>
                                    <span className="font-bold text-blue-600 font-mono">{timeStr}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-600 text-center py-4">
                              No response times. Run AI analysis.
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <Database className="h-5 w-5 mr-2 text-orange-500" />
                            Top Keywords
                          </CardTitle>
                          <CardDescription>Most frequently mentioned topics</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {selectedProject.analysis?.keywords?.slice(0, 10).map((keyword: string) => (
                              <Badge key={keyword} variant="outline" className="rounded-lg">
                                {keyword}
                              </Badge>
                            )) || (
                              <p className="text-sm text-slate-600 text-center w-full py-4">Run analysis to see keywords</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : (
                  <Card className="rounded-2xl shadow-sm">
                    <CardContent className="text-center py-12">
                      <BarChart3 className="h-16 w-16 mx-auto text-slate-400 mb-4" />
                      <h3 className="text-xl font-semibold mb-2">No Analysis Data</h3>
                      <p className="text-slate-600">
                        Upload and process WhatsApp chat files to view analysis.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="space-y-6">
                {selectedProject.messageCount > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="rounded-2xl shadow-sm">
                      <CardHeader>
                        <CardTitle>Legal Report</CardTitle>
                        <CardDescription>Comprehensive legal document with analysis</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                            <li>Complete message transcript</li>
                            <li>Participant verification</li>
                            <li>Timeline analysis</li>
                            <li>Legal formatting</li>
                          </ul>
                          <div className="space-y-2">
                            <button 
                              onClick={() => setPreviewModal({
                                isOpen: true,
                                title: 'Legal & Evidentiary Report',
                                subtitle: 'Chronological transcript and participant verification',
                                documentType: 'detailed_analysis'
                              })}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-xl transition-colors text-sm font-semibold"
                            >
                              <Eye className="h-4 w-4" />
                              View Report on Screen
                            </button>
                            <button 
                              onClick={() => handleDownloadDocument('detailed_analysis', 'pdf')}
                              disabled={isGeneratingDoc !== null}
                              aria-busy={isGeneratingDoc === 'detailed_analysis_pdf'}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {isGeneratingDoc === 'detailed_analysis_pdf' ? 'Generating...' : 'Convert to PDF'}
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-2xl shadow-sm bg-slate-900/60 border-slate-800">
                      <CardHeader>
                        <CardTitle className="text-white">Analysis Summary</CardTitle>
                        <CardDescription className="text-slate-400">Executive summary with key insights</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <ul className="text-sm text-slate-400 list-disc list-inside space-y-1">
                            <li>Key statistics & metrics</li>
                            <li>Sentiment & stress overview</li>
                            <li>Activity & temporal patterns</li>
                            <li>Top discussion highlights</li>
                          </ul>
                          <div className="space-y-2">
                            <button 
                              onClick={() => setPreviewModal({
                                isOpen: true,
                                title: 'Executive Analysis Summary',
                                subtitle: 'Operational metrics, sentiment, and activity trends',
                                documentType: 'summary'
                              })}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30 rounded-xl transition-colors text-sm font-semibold"
                            >
                              <Eye className="h-4 w-4" />
                              View Summary on Screen
                            </button>
                            <button 
                              onClick={() => handleDownloadDocument('summary', 'pdf')}
                              disabled={isGeneratingDoc !== null}
                              aria-busy={isGeneratingDoc === 'summary_pdf'}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {isGeneratingDoc === 'summary_pdf' ? 'Generating...' : 'Convert to PDF'}
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-2xl shadow-sm bg-slate-900/60 border-slate-800">
                      <CardHeader>
                        <CardTitle className="text-white">Raw Data Export</CardTitle>
                        <CardDescription className="text-slate-400">Complete data in multiple formats</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <ul className="text-sm text-slate-400 list-disc list-inside space-y-1">
                            <li>View interactive table in Chat Reader</li>
                            <li>JSON raw export</li>
                            <li>CSV spreadsheet format</li>
                            <li>Metadata & timestamps included</li>
                          </ul>
                          <div className="space-y-2">
                            <button 
                              onClick={() => setActiveTab('chat-reader')}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 rounded-xl transition-colors text-sm font-semibold"
                            >
                              <Database className="h-4 w-4" />
                              Browse Data on Screen
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                              <button 
                                onClick={() => handleDownloadDocument('summary', 'json')}
                                disabled={isGeneratingDoc !== null}
                                aria-busy={isGeneratingDoc === 'summary_json'}
                                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-center"
                              >
                                {isGeneratingDoc === 'summary_json' ? '...' : 'Export JSON'}
                              </button>
                              <button 
                                onClick={() => handleDownloadDocument('summary', 'csv')}
                                disabled={isGeneratingDoc !== null}
                                aria-busy={isGeneratingDoc === 'summary_csv'}
                                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-center"
                              >
                                {isGeneratingDoc === 'summary_csv' ? '...' : 'Export CSV'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Card className="rounded-2xl shadow-sm">
                    <CardContent className="text-center py-12">
                      <FileText className="h-16 w-16 mx-auto text-slate-400 mb-4" />
                      <h3 className="text-xl font-semibold mb-2">No Documents Available</h3>
                      <p className="text-slate-600">
                        Upload and process WhatsApp chat files to generate documents.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="text-center py-16">
            <Card className="bg-white/50 backdrop-blur-sm border border-white/20 max-w-4xl mx-auto rounded-3xl shadow-sm">
              <CardContent className="p-8 sm:p-12">
                <h3 className="text-3xl font-semibold text-slate-700 mb-6">
                  Complete WhatsApp Analysis Platform
                </h3>
                <p className="text-slate-600 mb-8 text-lg">
                  Create a project to start analyzing WhatsApp chats with AI-powered insights.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-6 rounded-2xl">
                    <Upload className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                    <h4 className="font-semibold mb-2 text-slate-800">Complete Processing</h4>
                    <p className="text-xs text-slate-600">
                      Parse ALL messages without truncation from any WhatsApp export format.
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-2xl">
                    <Bot className="h-12 w-12 text-purple-500 mx-auto mb-4" />
                    <h4 className="font-semibold mb-2 text-slate-800">AI Chat Interface</h4>
                    <p className="text-xs text-slate-600">
                      ChatGPT-style conversations with full access to your chat data.
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-green-50 to-blue-50 p-6 rounded-2xl">
                    <BarChart3 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h4 className="font-semibold mb-2 text-slate-800">Advanced Analysis</h4>
                    <p className="text-xs text-slate-600">
                      Sentiment, financial, timeline, and comprehensive insights.
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-orange-50 to-yellow-50 p-6 rounded-2xl">
                    <FileText className="h-12 w-12 text-orange-500 mx-auto mb-4" />
                    <h4 className="font-semibold mb-2 text-slate-800">Legal Documents</h4>
                    <p className="text-xs text-slate-600">
                      Professional reports and legal documents with PDFKit.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Zero-Knowledge Project Passphrase Dialog Modal */}
      <Dialog open={showPassphrasePrompt} onOpenChange={(open) => { if (!open) handlePassphraseCancel() }}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Key className="h-5 w-5 text-blue-500" />
              {isNewProjectPassphrase ? 'Configure Zero-Knowledge Key' : 'Enter Passphrase'}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              {isNewProjectPassphrase 
                ? 'Choose a passphrase to encrypt your conversations. All messages are encrypted locally before leaving your device.'
                : 'All chat logs in this project are encrypted. Please enter the passphrase to decrypt them in memory.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="passphrase">Project Passphrase</Label>
              <Input
                id="passphrase"
                type="password"
                placeholder="Enter passphrase"
                value={tempPassphrase}
                onChange={(e) => setTempPassphrase(e.target.value)}
                className="rounded-xl"
              />
            </div>

            {isNewProjectPassphrase && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassphrase">Confirm Passphrase</Label>
                <Input
                  id="confirmPassphrase"
                  type="password"
                  placeholder="Repeat passphrase"
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            )}

            {passphraseError && (
              <div className="text-sm font-semibold text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                {passphraseError}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2.5">
              <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Security Notice:</strong> WhatHappen uses client-side AES-GCM cryptography. Your passphrase is never sent to our servers. If forgotten, your chat history cannot be decrypted or recovered.
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handlePassphraseCancel} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handlePassphraseSubmit} disabled={isVerifyingPassphrase} className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl">
              {isVerifyingPassphrase ? 'Verifying…' : isNewProjectPassphrase ? 'Configure Key' : 'Unlock Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile Sliding Bottom Sheet for AI Chat */}
      <BottomSheet open={isMobileChatOpen} onOpenChange={setIsMobileChatOpen}>
        <BottomSheetContent className="h-[80vh] flex flex-col p-4">
          <BottomSheetHeader className="mb-2">
            <BottomSheetTitle className="text-center font-bold">AI Chat Assistant</BottomSheetTitle>
          </BottomSheetHeader>
          <div className="flex-1 overflow-hidden">
            {selectedProject && <AIChatInterface selectedProject={selectedProject} passphrase={passphrase} />}
          </div>
        </BottomSheetContent>
      </BottomSheet>

      {/* On-Screen Report & Analysis Viewer Modal */}
      {selectedProject && (
        <ReportViewerModal
          isOpen={previewModal.isOpen}
          onClose={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))}
          title={previewModal.title}
          subtitle={previewModal.subtitle}
          documentType={previewModal.documentType}
          project={selectedProject}
          messages={decryptedData?.messages || []}
          onDownload={handleDownloadDocument}
          isDownloading={isGeneratingDoc !== null}
        />
      )}
    </div>
  )
}