'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Upload, FileText, MessageSquare, BarChart3, Users, TrendingUp, Download, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Project } from '@/lib/firebase'

interface WhatsAppAnalyzerProps {
  selectedProject: Project
}

interface AnalysisResult {
  totalMessages: number
  participants: string[]
  dateRange: { start: string; end: string }
  topSenders: { name: string; count: number }[]
  messagesByDay: { date: string; count: number }[]
  keywords: string[]
  sentimentAnalysis: {
    positive: number
    negative: number
    neutral: number
  }
  financialTerms: string[]
}

export function WhatsAppAnalyzer({ selectedProject }: WhatsAppAnalyzerProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file || !selectedProject) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('projectId', selectedProject.id)

      const response = await fetch('/api/process-whatsapp-complete', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        setAnalysis(result.analysis)
        // Refresh the page to show updated project data
        window.location.reload()
      } else {
        throw new Error('Upload failed')
      }
    } catch (error) {
      console.error('Error uploading file:', error)
      alert('Error uploading file. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }, [selectedProject])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/zip': ['.zip']
    },
    multiple: false
  })

  const runAdvancedAnalysis = async (analysisType: string) => {
    if (!selectedProject) return
    
    setIsAnalyzing(true)
    try {
      const response = await fetch('/api/analyze-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          analysisType
        })
      })

      if (response.ok) {
        const result = await response.json()
        setAnalysis(result.analysis)
        alert(`${analysisType} analysis completed successfully!`)
      }
    } catch (error) {
      console.error('Analysis error:', error)
      alert('Analysis failed. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const generateDocument = async (format: string, documentType: string) => {
    if (!selectedProject) return

    try {
      const response = await fetch('/api/generate-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          format,
          documentType
        })
      })

      if (response.ok) {
        if (format === 'pdf' || format === 'csv') {
          // Download file
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${selectedProject.name}_${documentType}.${format}`
          document.body.appendChild(a)
          a.click()
          window.URL.revokeObjectURL(url)
          document.body.removeChild(a)
        } else {
          // JSON response
          const data = await response.json()
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${selectedProject.name}_${documentType}.json`
          document.body.appendChild(a)
          a.click()
          window.URL.revokeObjectURL(url)
          document.body.removeChild(a)
        }
      }
    } catch (error) {
      console.error('Document generation error:', error)
      alert('Document generation failed. Please try again.')
    }
  }

  return (
    <div className="space-y-8">
      {/* Upload Section */}
      {selectedProject.messageCount === 0 && (
        <Card className="border-2 border-dashed border-blue-200 bg-gradient-to-br from-blue-50 to-purple-50">
          <CardContent className="p-8">
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-300",
                isDragActive ? "border-blue-400 bg-blue-100/50 scale-105" : "border-blue-300 hover:border-blue-400 hover:bg-blue-50/50"
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-16 w-16 mx-auto mb-4 text-blue-500" />
              <h3 className="text-2xl font-semibold mb-2 text-blue-900">
                {isDragActive ? 'Drop your chat file here' : 'Upload WhatsApp Chat Export'}
              </h3>
              <p className="text-blue-700 mb-6 max-w-md mx-auto">
                Drag and drop your .txt chat export file, or click to browse. 
                Your data will be processed and stored securely for analysis.
              </p>
              <Button variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100">
                <FileText className="h-4 w-4 mr-2" />
                Choose File
              </Button>
            </div>
            
            {isUploading && (
              <div className="mt-6 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-blue-700 font-medium">Processing your chat file...</p>
                <p className="text-sm text-blue-600">This may take a few moments for large files</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Analysis Tools */}
      {selectedProject.messageCount > 0 && (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-white/80 backdrop-blur-sm">
            <TabsTrigger value="overview" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              Overview
            </TabsTrigger>
            <TabsTrigger value="analysis" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
              Advanced Analysis
            </TabsTrigger>
            <TabsTrigger value="ai-chat" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
              AI Chat
            </TabsTrigger>
            <TabsTrigger value="export" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
              Export
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-slate-500 data-[state=active]:text-white">
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center text-blue-800">
                    <MessageSquare className="h-5 w-5 mr-2" />
                    Total Messages
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">
                    {selectedProject.messageCount.toLocaleString()}
                  </div>
                  <p className="text-sm text-blue-700 mt-1">
                    Across {selectedProject.participants?.length || 0} participants
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center text-green-800">
                    <Users className="h-5 w-5 mr-2" />
                    Participants
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">
                    {selectedProject.participants?.length || 0}
                  </div>
                  <p className="text-sm text-green-700 mt-1">
                    Active chat members
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center text-purple-800">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Analysis Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-purple-600">
                    {selectedProject.analysis ? '✓' : '○'}
                  </div>
                  <p className="text-sm text-purple-700 mt-1">
                    {selectedProject.analysis ? 'Analyzed' : 'Ready to analyze'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {selectedProject.participants && selectedProject.participants.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Chat Participants</CardTitle>
                  <CardDescription>All members found in this chat</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {selectedProject.participants.map((participant, index) => (
                      <span
                        key={participant}
                        className="px-3 py-1 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 rounded-full text-sm font-medium border border-blue-200"
                      >
                        {participant}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="analysis" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart3 className="h-5 w-5 mr-2" />
                    Sentiment Analysis
                  </CardTitle>
                  <CardDescription>Analyze emotional tone and mood patterns</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={() => runAdvancedAnalysis('sentiment')}
                    disabled={isAnalyzing}
                    className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                  >
                    {isAnalyzing ? 'Analyzing...' : 'Run Sentiment Analysis'}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Financial Analysis
                  </CardTitle>
                  <CardDescription>Track payments, expenses, and financial mentions</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={() => runAdvancedAnalysis('financial')}
                    disabled={isAnalyzing}
                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
                  >
                    {isAnalyzing ? 'Analyzing...' : 'Run Financial Analysis'}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <MessageSquare className="h-5 w-5 mr-2" />
                    Timeline Analysis
                  </CardTitle>
                  <CardDescription>Activity patterns and time-based insights</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={() => runAdvancedAnalysis('timeline')}
                    disabled={isAnalyzing}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    {isAnalyzing ? 'Analyzing...' : 'Run Timeline Analysis'}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Sparkles className="h-5 w-5 mr-2" />
                    Comprehensive Analysis
                  </CardTitle>
                  <CardDescription>Complete analysis with all insights</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={() => runAdvancedAnalysis('comprehensive')}
                    disabled={isAnalyzing}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    {isAnalyzing ? 'Analyzing...' : 'Run Full Analysis'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="ai-chat" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>AI Chat Interface</CardTitle>
                <CardDescription>Ask questions about your chat data and get intelligent insights</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-12">
                <div className="text-6xl mb-4">🤖</div>
                <h3 className="text-xl font-semibold mb-2">AI Chat Coming Soon</h3>
                <p className="text-slate-600 mb-6">
                  Interactive AI assistant to help you understand your chat data better
                </p>
                <Button disabled>
                  Launch AI Chat
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="export" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>PDF Report</CardTitle>
                  <CardDescription>Professional analysis report</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={() => generateDocument('pdf', 'summary')}
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>JSON Data</CardTitle>
                  <CardDescription>Raw analysis data</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={() => generateDocument('json', 'summary')}
                    variant="outline"
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download JSON
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>CSV Export</CardTitle>
                  <CardDescription>Spreadsheet-friendly format</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={() => generateDocument('csv', 'full_transcript')}
                    variant="outline"
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Project Settings</CardTitle>
                <CardDescription>Manage your project configuration and preferences</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-12">
                <div className="text-6xl mb-4">⚙️</div>
                <h3 className="text-xl font-semibold mb-2">Settings Panel</h3>
                <p className="text-slate-600">
                  Project settings and configuration options
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
} 