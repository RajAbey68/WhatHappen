'use client'

import { useState } from 'react'
import { ProjectSelector } from '@/components/project-selector'
import { WhatsAppAnalyzer } from '@/components/whatsapp-analyzer'
import { AIChatInterface } from '@/components/ai-chat-interface'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Project } from '@/lib/firebase'
import { Upload, MessageSquare, BarChart3, FileText, Bot, Database } from 'lucide-react'

export default function Home() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent mb-4">
            WhatsApp Analyzer
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            Professional WhatsApp chat analysis with AI-powered insights, complete message processing, and intelligent querying
          </p>
        </div>
        
        {/* Project Selector */}
        <div className="mb-8">
          <ProjectSelector 
            onProjectSelect={setSelectedProject}
            selectedProject={selectedProject}
          />
        </div>
        
        {/* Main Interface */}
        {selectedProject ? (
          <div className="space-y-6">
            {/* Project Overview */}
            <Card className="bg-white/80 backdrop-blur-sm border border-white/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl">{selectedProject.name}</CardTitle>
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
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {selectedProject.messageCount.toLocaleString()}
                      </div>
                      <div className="text-sm text-blue-700">Total Messages</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {selectedProject.participants?.length || 0}
                      </div>
                      <div className="text-sm text-green-700">Participants</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">
                        {selectedProject.analysis?.keywords?.length || 0}
                      </div>
                      <div className="text-sm text-purple-700">Keywords</div>
                    </div>
                    <div className="text-center p-3 bg-orange-50 rounded-lg">
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
            <Tabs defaultValue="upload" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4 bg-white/80 backdrop-blur-sm h-auto p-2">
                <TabsTrigger 
                  value="upload" 
                  className="flex flex-col items-center space-y-1 h-16 data-[state=active]:bg-blue-500 data-[state=active]:text-white"
                >
                  <Upload className="h-5 w-5" />
                  <span className="text-sm font-medium">Upload & Process</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="ai-chat" 
                  className="flex flex-col items-center space-y-1 h-16 data-[state=active]:bg-purple-500 data-[state=active]:text-white"
                  disabled={!selectedProject.messageCount}
                >
                  <Bot className="h-5 w-5" />
                  <span className="text-sm font-medium">AI Chat</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="analysis" 
                  className="flex flex-col items-center space-y-1 h-16 data-[state=active]:bg-green-500 data-[state=active]:text-white"
                  disabled={!selectedProject.messageCount}
                >
                  <BarChart3 className="h-5 w-5" />
                  <span className="text-sm font-medium">Analysis</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="documents" 
                  className="flex flex-col items-center space-y-1 h-16 data-[state=active]:bg-orange-500 data-[state=active]:text-white"
                  disabled={!selectedProject.messageCount}
                >
                  <FileText className="h-5 w-5" />
                  <span className="text-sm font-medium">Documents</span>
                </TabsTrigger>
              </TabsList>

              {/* Upload & Process Tab */}
              <TabsContent value="upload" className="space-y-6">
                <WhatsAppAnalyzer selectedProject={selectedProject} />
              </TabsContent>

              {/* AI Chat Tab */}
              <TabsContent value="ai-chat" className="space-y-6">
                {selectedProject.messageCount > 0 ? (
                  <AIChatInterface selectedProject={selectedProject} />
                ) : (
                  <Card>
                    <CardContent className="text-center py-12">
                      <MessageSquare className="h-16 w-16 mx-auto text-slate-400 mb-4" />
                      <h3 className="text-xl font-semibold mb-2">No Chat Data</h3>
                      <p className="text-slate-600">
                        Upload and process WhatsApp chat files to start AI conversations
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Analysis Tab */}
              <TabsContent value="analysis" className="space-y-6">
                {selectedProject.messageCount > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center">
                          <BarChart3 className="h-5 w-5 mr-2" />
                          Sentiment Analysis
                        </CardTitle>
                        <CardDescription>Emotional tone and mood patterns</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span>Positive</span>
                            <span className="font-bold text-green-600">45%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Neutral</span>
                            <span className="font-bold text-slate-600">35%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Negative</span>
                            <span className="font-bold text-red-600">20%</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center">
                          <MessageSquare className="h-5 w-5 mr-2" />
                          Activity Patterns
                        </CardTitle>
                        <CardDescription>When people are most active</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span>Morning (6-12)</span>
                            <span className="font-bold">30%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Afternoon (12-18)</span>
                            <span className="font-bold">40%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Evening (18-24)</span>
                            <span className="font-bold">25%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Night (0-6)</span>
                            <span className="font-bold">5%</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center">
                          <Database className="h-5 w-5 mr-2" />
                          Top Keywords
                        </CardTitle>
                        <CardDescription>Most mentioned topics</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {selectedProject.analysis?.keywords?.slice(0, 8).map((keyword, index) => (
                            <Badge key={keyword} variant="outline">
                              {keyword}
                            </Badge>
                          )) || (
                            <p className="text-sm text-slate-500">Run analysis to see keywords</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="text-center py-12">
                      <BarChart3 className="h-16 w-16 mx-auto text-slate-400 mb-4" />
                      <h3 className="text-xl font-semibold mb-2">No Analysis Data</h3>
                      <p className="text-slate-600">
                        Upload and process WhatsApp chat files to view analysis
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="space-y-6">
                {selectedProject.messageCount > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Legal Report</CardTitle>
                        <CardDescription>Comprehensive legal document with analysis</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="text-sm text-slate-600">
                            • Complete message transcript
                            • Participant verification
                            • Timeline analysis
                            • Legal formatting
                          </div>
                          <button className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                            Generate Legal PDF
                          </button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Analysis Summary</CardTitle>
                        <CardDescription>Executive summary with key insights</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="text-sm text-slate-600">
                            • Key statistics
                            • Sentiment overview
                            • Activity patterns
                            • Important highlights
                          </div>
                          <button className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
                            Generate Summary PDF
                          </button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Raw Data Export</CardTitle>
                        <CardDescription>Complete data in multiple formats</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="text-sm text-slate-600">
                            • JSON format
                            • CSV spreadsheet
                            • Full message data
                            • Metadata included
                          </div>
                          <div className="space-y-2">
                            <button className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors">
                              Export JSON
                            </button>
                            <button className="w-full px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors">
                              Export CSV
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="text-center py-12">
                      <FileText className="h-16 w-16 mx-auto text-slate-400 mb-4" />
                      <h3 className="text-xl font-semibold mb-2">No Documents Available</h3>
                      <p className="text-slate-600">
                        Upload and process WhatsApp chat files to generate documents
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="text-center py-16">
            <Card className="bg-white/50 backdrop-blur-sm border border-white/20 max-w-4xl mx-auto">
              <CardContent className="p-12">
                <h3 className="text-3xl font-semibold text-slate-700 mb-6">
                  Complete WhatsApp Analysis Platform
                </h3>
                <p className="text-slate-600 mb-8 text-lg">
                  Create a project to start analyzing WhatsApp chats with AI-powered insights
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-6 rounded-lg">
                    <Upload className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                    <h4 className="font-semibold mb-2">Complete Processing</h4>
                    <p className="text-sm text-slate-600">
                      Parse ALL messages without truncation from any WhatsApp export format
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-lg">
                    <Bot className="h-12 w-12 text-purple-500 mx-auto mb-4" />
                    <h4 className="font-semibold mb-2">AI Chat Interface</h4>
                    <p className="text-sm text-slate-600">
                      ChatGPT-style conversations with full access to your chat data
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-green-50 to-blue-50 p-6 rounded-lg">
                    <BarChart3 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h4 className="font-semibold mb-2">Advanced Analysis</h4>
                    <p className="text-sm text-slate-600">
                      Sentiment, financial, timeline, and comprehensive insights
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-orange-50 to-yellow-50 p-6 rounded-lg">
                    <FileText className="h-12 w-12 text-orange-500 mx-auto mb-4" />
                    <h4 className="font-semibold mb-2">Legal Documents</h4>
                    <p className="text-sm text-slate-600">
                      Professional reports and legal documents with PDFKit
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
} 