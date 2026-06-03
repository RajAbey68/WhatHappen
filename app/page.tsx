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
import { Upload, MessageSquare, BarChart3, FileText, Bot, Database, Key, Shield, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { decryptText } from '@/lib/crypto'
import { BottomSheet, BottomSheetContent, BottomSheetHeader, BottomSheetTitle } from '@/components/ui/bottom-sheet'

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

  // Client-side decrypted messages data
  const [decryptedData, setDecryptedData] = useState<any>(null)
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Handle tab changes with mobile bottom sheet redirection
  const handleTabChange = (value: string) => {
    if (value === 'ai-chat' && typeof window !== 'undefined' && window.innerWidth < 640) {
      setIsMobileChatOpen(true)
    } else {
      setActiveTab(value)
    }
  }

  // Load and decrypt messages from database locally on the client
  const loadAndDecryptMessages = async (projectId: string, currentPassphrase: string) => {
    try {
      const response = await fetch(`/api/ai-chat/${projectId}`)
      if (response.ok) {
        const result = await response.json()
        const recentMessages = result.recentMessages || []
        
        // Decrypt messages locally in the client browser
        const decrypted = await Promise.all(
          recentMessages.map(async (msg: any) => {
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
            } catch (e) {
              // Plaintext fallback
            }

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
            } catch (e) {
              // Plaintext fallback
            }

            return {
              ...msg,
              sender: decryptedSender,
              message: decryptedMessage
            }
          })
        )

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
    }
  }

  const handleProjectSelect = (project: Project | null) => {
    setSelectedProject(project)
    setDecryptedData(null)
    setProcessedData(null)
    setActiveTab('upload')
    
    if (!project) {
      setPassphrase('')
      return
    }

    const cached = sessionStorage.getItem(`passphrase-${project.id}`)
    if (cached) {
      setPassphrase(cached)
      loadAndDecryptMessages(project.id, cached)
    } else {
      setTempPassphrase('')
      setConfirmPassphrase('')
      setPassphraseError('')
      setIsNewProjectPassphrase(project.messageCount === 0)
      setShowPassphrasePrompt(true)
    }
  }

  const handlePassphraseSubmit = () => {
    if (!tempPassphrase.trim()) {
      setPassphraseError('Passphrase is required')
      return
    }

    if (isNewProjectPassphrase && tempPassphrase !== confirmPassphrase) {
      setPassphraseError('Passphrases do not match')
      return
    }

    if (selectedProject) {
      sessionStorage.setItem(`passphrase-${selectedProject.id}`, tempPassphrase)
      setPassphrase(tempPassphrase)
      setShowPassphrasePrompt(false)
      
      if (selectedProject.messageCount > 0) {
        loadAndDecryptMessages(selectedProject.id, tempPassphrase)
      }
    }
  }

  const handlePassphraseCancel = () => {
    setShowPassphrasePrompt(false)
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          analysisType,
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 pb-24 sm:pb-8">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent mb-4">
            WhatHappen
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
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
        {selectedProject ? (
          <div className="space-y-6">
            {/* Project Overview */}
            <Card className="bg-white/80 backdrop-blur-sm border border-white/20 shadow-sm rounded-2xl">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-2xl">{selectedProject.name}</CardTitle>
                      {passphrase && (
                        <Badge variant="outline" className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border-green-200">
                          <Shield className="h-3 w-3" /> Zero-Knowledge Key Loaded
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
                    <div className="text-center p-3 bg-blue-50 rounded-xl">
                      <div className="text-2xl font-bold text-blue-600">
                        {selectedProject.messageCount.toLocaleString()}
                      </div>
                      <div className="text-sm text-blue-700">Total Messages</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-xl">
                      <div className="text-2xl font-bold text-green-600">
                        {selectedProject.participants?.length || 0}
                      </div>
                      <div className="text-sm text-green-700">Participants</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-xl">
                      <div className="text-2xl font-bold text-purple-600">
                        {selectedProject.analysis?.keywords?.length || 0}
                      </div>
                      <div className="text-sm text-purple-700">Keywords</div>
                    </div>
                    <div className="text-center p-3 bg-orange-50 rounded-xl">
                      <div className="text-2xl font-bold text-orange-600">
                        {selectedProject.dateRange?.start ? 
                          Math.ceil((new Date(selectedProject.dateRange.end).getTime() - new Date(selectedProject.dateRange.start).getTime()) / (1000 * 60 * 60 * 24)) 
                          : 0}
                      </div>
                      <div className="text-sm text-orange-700">Days Span</div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Tabbed Interface */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
              {/* Desktop Tab bar (hidden on mobile) */}
              <div className="hidden sm:block">
                <TabsList className="grid w-full grid-cols-5 bg-white/80 backdrop-blur-sm h-auto p-2 rounded-2xl shadow-sm">
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
                  <AIChatInterface selectedProject={selectedProject} />
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
                          <button 
                            onClick={() => handleDownloadDocument('detailed_analysis', 'pdf')}
                            disabled={isGeneratingDoc !== null}
                            aria-busy={isGeneratingDoc === 'detailed_analysis_pdf'}
                            className="w-full px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                          >
                            {isGeneratingDoc === 'detailed_analysis_pdf' ? 'Generating...' : 'Generate Legal PDF'}
                          </button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-2xl shadow-sm">
                      <CardHeader>
                        <CardTitle>Analysis Summary</CardTitle>
                        <CardDescription>Executive summary with key insights</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                            <li>Key statistics</li>
                            <li>Sentiment overview</li>
                            <li>Activity patterns</li>
                            <li>Important highlights</li>
                          </ul>
                          <button 
                            onClick={() => handleDownloadDocument('summary', 'pdf')}
                            disabled={isGeneratingDoc !== null}
                            aria-busy={isGeneratingDoc === 'summary_pdf'}
                            className="w-full px-4 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                          >
                            {isGeneratingDoc === 'summary_pdf' ? 'Generating...' : 'Generate Summary PDF'}
                          </button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-2xl shadow-sm">
                      <CardHeader>
                        <CardTitle>Raw Data Export</CardTitle>
                        <CardDescription>Complete data in multiple formats</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                            <li>JSON format</li>
                            <li>CSV spreadsheet</li>
                            <li>Full message data</li>
                            <li>Metadata included</li>
                          </ul>
                          <div className="space-y-2">
                            <button 
                              onClick={() => handleDownloadDocument('summary', 'json')}
                              disabled={isGeneratingDoc !== null}
                              aria-busy={isGeneratingDoc === 'summary_json'}
                              className="w-full px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                              {isGeneratingDoc === 'summary_json' ? 'Generating...' : 'Export JSON'}
                            </button>
                            <button 
                              onClick={() => handleDownloadDocument('summary', 'csv')}
                              disabled={isGeneratingDoc !== null}
                              aria-busy={isGeneratingDoc === 'summary_csv'}
                              className="w-full px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                              {isGeneratingDoc === 'summary_csv' ? 'Generating...' : 'Export CSV'}
                            </button>
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
            <Button onClick={handlePassphraseSubmit} className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl">
              {isNewProjectPassphrase ? 'Configure Key' : 'Unlock Project'}
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
            {selectedProject && <AIChatInterface selectedProject={selectedProject} />}
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  )
}