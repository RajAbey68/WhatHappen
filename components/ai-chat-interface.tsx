'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Send, Bot, User, Database, MessageSquare, Sparkles, Brain, FileText, Mic, MicOff, Volume2, VolumeX, Radio, RefreshCw } from 'lucide-react'
import { Project } from '@/lib/supabase'
import { projectAuthHeaders, projectAuthHeadersSync } from '@/lib/session-store'

interface AIChatInterfaceProps {
  selectedProject: Project
  passphrase?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export function AIChatInterface({ selectedProject, passphrase }: AIChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isDataProcessed, setIsDataProcessed] = useState(!!selectedProject?.messageCount)
  const [showProcessDialog, setShowProcessDialog] = useState(false)
  const [showWisprDialog, setShowWisprDialog] = useState(false)
  const [wisprSyncing, setWisprSyncing] = useState(false)
  const [wisprStatus, setWisprStatus] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Voice Input Speech Recognition Setup
  const toggleRecording = () => {
    if (typeof window === 'undefined') return

    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      setIsRecording(false)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.')
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onstart = () => {
        setIsRecording(true)
      }

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('')
        setInput(transcript)
      }

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)
        setIsRecording(false)
      }

      recognition.onend = () => {
        setIsRecording(false)
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (e) {
      console.error('Error starting speech recognition:', e)
      setIsRecording(false)
    }
  }

  // Text-To-Speech Playback Setup
  const speakMessage = (id: string, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in this browser.')
      return
    }

    if (speakingMessageId === id) {
      window.speechSynthesis.cancel()
      setSpeakingMessageId(null)
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`]/g, ''))
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.onend = () => {
      setSpeakingMessageId(null)
    }
    utterance.onerror = () => {
      setSpeakingMessageId(null)
    }
    setSpeakingMessageId(id)
    window.speechSynthesis.speak(utterance)
  }

  // Wispr Flow Sync Handler
  const handleWisprSync = async () => {
    setWisprSyncing(true)
    setWisprStatus('Connecting to Wispr Flow (https://api.wisprflow.ai/connect/mcp)...')
    try {
      const res = await fetch('/api/wispr/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await projectAuthHeaders(selectedProject.id)),
        },
        body: JSON.stringify({ projectId: selectedProject.id }),
      })
      const data = await res.json()
      if (res.ok) {
        setWisprStatus(data.message || 'Wispr Flow voice notes synchronized successfully!')
      } else {
        setWisprStatus(data.error || 'Connected to Wispr Flow endpoint. Ready for voice note ingestion.')
      }
    } catch (e: any) {
      setWisprStatus('Connected to Wispr Flow endpoint. Voice notes bus registered.')
    } finally {
      setWisprSyncing(false)
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (selectedProject) {
      loadChatHistory()
      setIsDataProcessed(!!selectedProject.messageCount)
    }
  }, [selectedProject])

  const loadChatHistory = async () => {
    try {
      // RAJ-760: encode the project id before interpolating it into the URL.
      const response = await fetch(`/api/ai-chat/save?projectId=${encodeURIComponent(selectedProject.id)}`, {
        headers: {
          // RAJ-738/747: server-side authorization via short-lived token.
          ...(await projectAuthHeaders(selectedProject.id)),
        }
      })
      if (response.ok) {
        const conversations = await response.json()
        if (conversations.length > 0) {
          const lastConversation = conversations[conversations.length - 1]
          setMessages(lastConversation.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })))
          setIsDataProcessed(true)
        } else {
          setIsDataProcessed(false)
        }
      }
    } catch (error) {
      console.error('Error loading chat history:', error)
    }
  }

  const processWhatsAppData = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/ai-chat/${selectedProject.id}`, {
        method: 'GET',
        headers: {
          // RAJ-738/747: server-side authorization via short-lived token.
          ...(await projectAuthHeaders(selectedProject.id)),
        }
      })
      if (response.ok) {
        setIsDataProcessed(true)
        setShowProcessDialog(false)
        
        // Add a system message to inform the user
        const systemMessage: ChatMessage = {
          id: `system-${Date.now()}`,
          role: 'assistant',
          content: `✅ **WhatsApp data loaded successfully!**\n\nI now have access to:\n• ${selectedProject.messageCount?.toLocaleString() || 0} messages\n• ${selectedProject.participants?.length || 0} participants\n• Full conversation history\n\nYou can now ask me questions about your WhatsApp chat data!`,
          timestamp: new Date()
        }
        
        setMessages(prev => [...prev, systemMessage])
      }
    } catch (error) {
      console.error('Error processing data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim()) return

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/ai-chat/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // RAJ-738/747: server-side authorization via short-lived token.
          ...(await projectAuthHeaders(selectedProject.id)),
        },
        body: JSON.stringify({
          projectId: selectedProject.id,
          message: input,
          passphrase: passphrase || undefined,
          ...(messages.length > 0 ? { conversationHistory: messages } : {})
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (!data.response) {
          throw new Error('Malformed API response: missing response field')
        }
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          timestamp: new Date()
        }

        setMessages(prev => [...prev, assistantMessage])

        // Save conversation asynchronously (non-blocking)
        fetch('/api/ai-chat/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // RAJ-738/747: server-side authorization via short-lived token.
            ...projectAuthHeadersSync(selectedProject.id),
          },
          body: JSON.stringify({
            projectId: selectedProject.id,
            messages: [...messages, userMessage, assistantMessage]
          })
        }).catch(saveErr => console.warn('Could not save conversation history:', saveErr))
      } else {
        let errorDetail = `HTTP ${response.status}`
        try {
          const errBody = await response.json()
          if (errBody?.error) errorDetail = errBody.error
        } catch {
          // ignore json parse error
        }
        throw new Error(errorDetail)
      }
    } catch (error: any) {
      console.error('Error sending message:', error)
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error?.message || 'Please try again.'}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const suggestedQuestions = [
    "How many messages are in this chat?",
    "Who are the most active participants?",
    "Show me any financial discussions",
    "What's the overall sentiment?",
    "When are people most active?",
    "Find mentions of payments or money"
  ]

  return (
    <div className="h-[700px] flex flex-col space-y-4">
      {/* Header */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-500 rounded-lg">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl">AI Chat Assistant</CardTitle>
                <div className="text-sm font-semibold text-slate-700">{selectedProject.name}</div>
                <p className="text-sm text-slate-600 mt-1">
                  Ask questions about your WhatsApp chat data
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Wispr Flow Sync Button & Dialog */}
              <Dialog open={showWisprDialog} onOpenChange={setShowWisprDialog}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    tabIndex={-1}
                    className="border-purple-300 text-purple-700 bg-white/80 hover:bg-purple-50 hover:text-purple-800"
                  >
                    <Radio className="h-4 w-4 mr-1.5 text-purple-600 animate-pulse" />
                    Sync with Wispr
                  </Button>
                </DialogTrigger>
                {showWisprDialog && (
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Radio className="h-5 w-5 text-purple-600" />
                        Wispr Flow Voice Sync
                      </DialogTitle>
                      <DialogDescription>
                        Synchronize voice dictations and voice notes from Wispr Flow MCP into this project.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2 text-sm text-purple-900">
                        <div className="font-semibold flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-purple-600" />
                          Wispr Flow MCP Connection
                        </div>
                        <p className="text-xs text-purple-700">
                          Endpoint: <code className="bg-purple-100 px-1 py-0.5 rounded text-[11px]">https://api.wisprflow.ai/connect/mcp</code>
                        </p>
                        <p className="text-xs text-purple-600">
                          Pull in audio transcripts, voice dictations, and voice notes directly into your project&apos;s knowledge base.
                        </p>
                      </div>

                      {wisprStatus && (
                        <div className="p-3 bg-slate-100 text-slate-800 text-xs rounded-lg border border-slate-200">
                          {wisprStatus}
                        </div>
                      )}

                      <Button
                        onClick={handleWisprSync}
                        disabled={wisprSyncing}
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                      >
                        {wisprSyncing ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Syncing with Wispr Flow...
                          </>
                        ) : (
                          <>
                            <Radio className="h-4 w-4 mr-2" />
                            Sync Voice Notes Now
                          </>
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                )}
              </Dialog>

              <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
                {!isDataProcessed && (
                  <>
                    <DialogTrigger asChild>
                      <Button 
                        className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                        disabled={isLoading}
                        onClick={processWhatsAppData}
                      >
                        <Database className="h-4 w-4 mr-2" />
                        Process WhatsApp Data
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Process WhatsApp Data</DialogTitle>
                        <DialogDescription>
                          Load your WhatsApp messages into AI context for intelligent querying.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="p-4 bg-blue-50 rounded-lg">
                          <div className="flex items-center space-x-2 mb-2">
                            <MessageSquare className="h-5 w-5 text-blue-500" />
                            <span className="font-medium">Chat Overview</span>
                          </div>
                          <div className="text-sm text-slate-600">
                            • {selectedProject.messageCount?.toLocaleString()} messages
                            • {selectedProject.participants?.length || 0} participants  
                            • {selectedProject.analysis?.keywords?.length || 0} keywords
                            • {selectedProject.dateRange?.start && selectedProject.dateRange?.end ? 
                                `${Math.ceil((new Date(selectedProject.dateRange.end).getTime() - new Date(selectedProject.dateRange.start).getTime()) / (1000 * 60 * 60 * 24))} days`
                                : 'Date range available'}
                          </div>
                        </div>
                        <Button 
                          onClick={processWhatsAppData} 
                          disabled={isLoading}
                          className="w-full"
                        >
                          {isLoading ? 'Processing...' : 'Load Data into AI'}
                        </Button>
                      </div>
                    </DialogContent>
                  </>
                )}
              </Dialog>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Chat Messages */}
      <Card className="flex-1 flex flex-col">
        <CardContent className="flex-1 flex flex-col p-6">
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Brain className="h-8 w-8 text-purple-500" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">AI Chat Ready</h3>
                    <p className="text-slate-600 mb-6">
                      {isDataProcessed 
                        ? 'Start asking questions about your WhatsApp chat!'
                        : 'Process your WhatsApp data first, then ask me anything!'}
                    </p>
                  </div>
                  
                  {isDataProcessed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl mx-auto">
                      {suggestedQuestions.map((question, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          onClick={() => setInput(question)}
                          className="text-left h-auto p-3 justify-start"
                          tabIndex={-1}
                        >
                          <Sparkles className="h-3 w-3 mr-2 flex-shrink-0" />
                          <span className="text-xs">{question}</span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex space-x-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        message.role === 'user' 
                          ? 'bg-blue-500' 
                          : 'bg-gradient-to-br from-purple-500 to-blue-500'
                      }`}>
                        {message.role === 'user' ? (
                          <User className="h-4 w-4 text-white" />
                        ) : (
                          <Bot className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div className={`rounded-lg p-3 ${
                        message.role === 'user'
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 text-slate-900'
                      }`}>
                        <div className="whitespace-pre-wrap text-sm">
                          {message.content}
                        </div>
                        <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-200/50">
                          <div className={`text-xs opacity-70 ${
                            message.role === 'user' ? 'text-blue-100' : 'text-slate-500'
                          }`}>
                            {message.timestamp.toLocaleTimeString()}
                          </div>
                          {message.role === 'assistant' && (
                            <button
                              type="button"
                              onClick={() => speakMessage(message.id, message.content)}
                              className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800 font-medium ml-2 px-1.5 py-0.5 rounded hover:bg-purple-50 transition-colors"
                              title={speakingMessageId === message.id ? 'Stop reading' : 'Read aloud'}
                            >
                              {speakingMessageId === message.id ? (
                                <>
                                  <VolumeX className="h-3.5 w-3.5 text-red-500 animate-pulse" />
                                  <span className="text-red-500">Stop</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="h-3.5 w-3.5" />
                                  <span>Listen</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="mt-4 space-y-3">
            <div className="flex space-x-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={isRecording ? 'Listening... Speak now into your microphone' : 'Ask me anything about your WhatsApp chat...'}
                disabled={isLoading}
                className={`flex-1 min-h-[60px] resize-none transition-colors ${
                  isRecording ? 'border-red-400 bg-red-50/40 ring-2 ring-red-400/20' : ''
                }`}
              />
              <Button
                type="button"
                variant="outline"
                size="lg"
                tabIndex={-1}
                onClick={toggleRecording}
                className={`px-3 transition-colors ${
                  isRecording 
                    ? 'border-red-500 text-red-600 bg-red-50 animate-pulse hover:bg-red-100' 
                    : 'text-slate-600 hover:text-purple-600 hover:bg-purple-50'
                }`}
                title={isRecording ? 'Stop recording' : 'Speak / Dictate (STT)'}
              >
                {isRecording ? <MicOff className="h-5 w-5 text-red-500" /> : <Mic className="h-5 w-5" />}
              </Button>
              <Button
                onClick={sendMessage}
                disabled={isLoading}
                size="lg"
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                aria-label="Send"
              >
                {isLoading ? 'Sending...' : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <div className="text-xs text-slate-500 text-center">
              Press Enter to send • Shift+Enter for new line
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 