"use client"

import { useState } from "react"
import { Moon, Sun, Upload, BarChart3, MessageCircle, Database, Settings, Brain, Zap, TrendingUp } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { FileUpload } from "@/components/file-upload"
import { Dashboard } from "@/components/dashboard"
import { AIChatInterface } from "@/components/ai-chat-interface"
import { DatabaseViewer } from "@/components/database-viewer"

export default function WhatsAppAnalyzer() {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [processedData, setProcessedData] = useState<any>(null)
  const [activeTab, setActiveTab] = useState("upload")

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
    document.documentElement.classList.toggle("dark")
  }

  const handleFileProcessed = (data: any) => {
    setProcessedData(data)
    setActiveTab("dashboard") // Auto-switch to dashboard when file is processed
  }

  const features = [
    { icon: Brain, label: "AI-Powered", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
    { icon: Zap, label: "Real-time Analysis", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    { icon: TrendingUp, label: "Advanced Insights", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  ]

  return (
    <div className={`min-h-screen transition-all duration-500 ${isDarkMode ? "dark" : ""}`}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-900 dark:via-blue-900 dark:to-purple-900">
        
        {/* Animated Background Pattern */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fillRule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%239C92AC%22%20fillOpacity%3D%220.05%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%222%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] dark:bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fillRule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fillOpacity%3D%220.02%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%222%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] animate-pulse"></div>
          
          {/* Floating gradient orbs */}
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-bounce [animation-duration:6s]"></div>
          <div className="absolute top-3/4 right-1/4 w-96 h-96 bg-gradient-to-r from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-bounce [animation-duration:8s] [animation-delay:2s]"></div>
          <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-gradient-to-r from-cyan-400/20 to-blue-400/20 rounded-full blur-3xl animate-bounce [animation-duration:7s] [animation-delay:4s]"></div>
        </div>

        {/* Header */}
        <header className="relative z-10 p-6">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 flex items-center justify-center shadow-2xl">
                  <MessageCircle className="w-7 h-7 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-green-400 to-blue-400 rounded-full animate-ping"></div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 via-blue-800 to-purple-800 dark:from-white dark:via-blue-200 dark:to-purple-200 bg-clip-text text-transparent">
                  WhatsApp Analyzer
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  AI-Powered Chat Analytics
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {processedData && (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400">
                  Data Loaded
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleDarkMode}
                className="rounded-2xl bg-white/20 dark:bg-black/20 backdrop-blur-sm border border-white/30 dark:border-white/10 hover:bg-white/30 dark:hover:bg-black/30 transition-all duration-300 hover:scale-105"
              >
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative z-10 px-6 py-8">
          <div className="max-w-5xl mx-auto text-center">
            <div className="mb-8">
              <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 dark:from-blue-400 dark:via-purple-400 dark:to-blue-600 bg-clip-text text-transparent animate-gradient bg-300% [animation-duration:6s]">
                Unlock Chat Insights
              </h1>
              <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-3xl mx-auto leading-relaxed">
                Transform your WhatsApp conversations into powerful insights with AI-driven analysis, 
                beautiful visualizations, and intelligent search capabilities
              </p>

              {/* Enhanced Feature Pills */}
              <div className="flex flex-wrap justify-center gap-4 mb-12">
                {features.map((feature, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className={`px-6 py-3 rounded-2xl backdrop-blur-sm border ${feature.color} transition-all duration-300 hover:scale-110 hover:shadow-xl transform cursor-pointer group`}
                  >
                    <feature.icon className="w-5 h-5 mr-3 group-hover:rotate-12 transition-transform duration-300" />
                    <span className="font-medium">{feature.label}</span>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <main className="relative z-10 px-6 pb-12">
          <div className="max-w-7xl mx-auto">
            <Card className="backdrop-blur-2xl bg-white/10 dark:bg-black/10 border-white/20 dark:border-white/10 shadow-2xl rounded-3xl overflow-hidden">
              <CardContent className="p-0">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  
                  {/* Enhanced Tab Navigation */}
                  <TabsList className="grid w-full grid-cols-5 bg-gradient-to-r from-white/20 via-white/30 to-white/20 dark:from-black/20 dark:via-black/30 dark:to-black/20 backdrop-blur-sm border-b border-white/20 dark:border-white/10 rounded-t-3xl p-2">
                    <TabsTrigger
                      value="upload"
                      className="flex items-center gap-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300 rounded-2xl px-4 py-3"
                    >
                      <Upload className="w-5 h-5" />
                      <span className="hidden sm:inline font-medium">Upload</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="dashboard"
                      disabled={!processedData}
                      className="flex items-center gap-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300 rounded-2xl px-4 py-3 disabled:opacity-50"
                    >
                      <BarChart3 className="w-5 h-5" />
                      <span className="hidden sm:inline font-medium">Analytics</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="ai-chat"
                      disabled={!processedData}
                      className="flex items-center gap-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300 rounded-2xl px-4 py-3 disabled:opacity-50"
                    >
                      <MessageCircle className="w-5 h-5" />
                      <span className="hidden sm:inline font-medium">AI Chat</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="database"
                      disabled={!processedData}
                      className="flex items-center gap-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300 rounded-2xl px-4 py-3 disabled:opacity-50"
                    >
                      <Database className="w-5 h-5" />
                      <span className="hidden sm:inline font-medium">Search</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="settings"
                      className="flex items-center gap-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-500 data-[state=active]:to-gray-600 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300 rounded-2xl px-4 py-3"
                    >
                      <Settings className="w-5 h-5" />
                      <span className="hidden sm:inline font-medium">Settings</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab Content */}
                  <div className="min-h-[500px]">
                    <TabsContent value="upload" className="p-8 mt-0">
                      <FileUpload onFileProcessed={handleFileProcessed} />
                    </TabsContent>

                    <TabsContent value="dashboard" className="p-8 mt-0">
                      {processedData ? (
                        <Dashboard data={processedData} />
                      ) : (
                        <div className="text-center py-20">
                          <BarChart3 className="w-20 h-20 mx-auto text-slate-400 mb-6" />
                          <h3 className="text-2xl font-semibold text-slate-700 dark:text-slate-300 mb-4">
                            No Data Available
                          </h3>
                          <p className="text-slate-500 dark:text-slate-400 mb-8">
                            Upload and process WhatsApp chat files to view analytics
                          </p>
                          <Button
                            onClick={() => setActiveTab("upload")}
                            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                          >
                            Upload Files
                          </Button>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="ai-chat" className="p-8 mt-0">
                      {processedData ? (
                        <AIChatInterface data={processedData} />
                      ) : (
                        <div className="text-center py-20">
                          <MessageCircle className="w-20 h-20 mx-auto text-slate-400 mb-6" />
                          <h3 className="text-2xl font-semibold text-slate-700 dark:text-slate-300 mb-4">
                            AI Chat Ready
                          </h3>
                          <p className="text-slate-500 dark:text-slate-400">
                            Process chat files to start intelligent conversations about your data
                          </p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="database" className="p-8 mt-0">
                      {processedData ? (
                        <DatabaseViewer data={processedData} />
                      ) : (
                        <div className="text-center py-20">
                          <Database className="w-20 h-20 mx-auto text-slate-400 mb-6" />
                          <h3 className="text-2xl font-semibold text-slate-700 dark:text-slate-300 mb-4">
                            Search Engine Ready
                          </h3>
                          <p className="text-slate-500 dark:text-slate-400">
                            Upload chat files to enable powerful search and filtering capabilities
                          </p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="settings" className="p-8 mt-0">
                      <div className="text-center py-20">
                        <Settings className="w-20 h-20 mx-auto text-slate-400 mb-6" />
                        <h3 className="text-2xl font-semibold text-slate-700 dark:text-slate-300 mb-4">
                          Settings & Preferences
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-8">
                          Customize your analysis preferences, privacy settings, and data handling options
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                          <Card className="bg-white/50 dark:bg-black/50 border-white/30 dark:border-white/10">
                            <CardContent className="p-6 text-center">
                              <h4 className="font-semibold mb-2">Privacy</h4>
                              <p className="text-sm text-slate-600 dark:text-slate-400">
                                All data processing happens locally
                              </p>
                            </CardContent>
                          </Card>
                          <Card className="bg-white/50 dark:bg-black/50 border-white/30 dark:border-white/10">
                            <CardContent className="p-6 text-center">
                              <h4 className="font-semibold mb-2">Performance</h4>
                              <p className="text-sm text-slate-600 dark:text-slate-400">
                                Optimized for large chat files
                              </p>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
} 