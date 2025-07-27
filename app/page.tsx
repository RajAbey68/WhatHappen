"use client"

import type React from "react"
import { useState } from "react"
import { Moon, Sun, Upload, BarChart3, MessageCircle, Database, Settings, FileText, Zap, TrendingUp, Brain } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

export default function WhatsAppAnalyzer() {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
    document.documentElement.classList.toggle("dark")
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setUploadedFile(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0])
    }
  }

  const features = [
    { icon: Brain, label: "AI-Powered", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
    { icon: Zap, label: "Real-time Analysis", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    { icon: TrendingUp, label: "Advanced Insights", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  ]

  return (
    <div className={`min-h-screen transition-all duration-500 ${isDarkMode ? "dark" : ""}`}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-900 dark:via-blue-900 dark:to-purple-900">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fillRule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%239C92AC%22%20fillOpacity%3D%220.05%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%222%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] dark:bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fillRule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fillOpacity%3D%220.02%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%222%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]"></div>

        {/* Header */}
        <header className="relative z-10 p-6">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-800 dark:text-white">WhatsApp Analyzer</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleDarkMode}
              className="rounded-full bg-white/20 dark:bg-black/20 backdrop-blur-sm border border-white/30 dark:border-white/10 hover:bg-white/30 dark:hover:bg-black/30 transition-all duration-300"
            >
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative z-10 px-6 py-12">
          <div className="max-w-4xl mx-auto text-center">
            <div className="mb-8">
              <h1 className="text-6xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 dark:from-blue-400 dark:via-purple-400 dark:to-blue-600 bg-clip-text text-transparent animate-pulse">
                WhatsApp Analyzer
              </h1>
              <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto leading-relaxed">
                Unlock powerful insights from your WhatsApp conversations with AI-powered analysis and beautiful
                visualizations
              </p>

              {/* Feature Pills */}
              <div className="flex flex-wrap justify-center gap-3 mb-12">
                {features.map((feature, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className={`px-4 py-2 rounded-full backdrop-blur-sm border ${feature.color} transition-all duration-300 hover:scale-105 hover:shadow-lg`}
                  >
                    <feature.icon className="w-4 h-4 mr-2" />
                    {feature.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <main className="relative z-10 px-6 pb-12">
          <div className="max-w-6xl mx-auto">
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-5 mb-8 bg-white/10 dark:bg-black/10 backdrop-blur-sm border border-white/20 dark:border-white/10 rounded-2xl p-1">
                <TabsTrigger value="upload" className="rounded-xl transition-all duration-300 data-[state=active]:bg-white dark:data-[state=active]:bg-white/20 data-[state=active]:shadow-md">
                  <Upload className="w-4 h-4" />
                </TabsTrigger>
                <TabsTrigger value="dashboard" className="rounded-xl transition-all duration-300 data-[state=active]:bg-white dark:data-[state=active]:bg-white/20 data-[state=active]:shadow-md">
                  <BarChart3 className="w-4 h-4" />
                </TabsTrigger>
                <TabsTrigger value="chat" className="rounded-xl transition-all duration-300 data-[state=active]:bg-white dark:data-[state=active]:bg-white/20 data-[state=active]:shadow-md">
                  <MessageCircle className="w-4 h-4" />
                </TabsTrigger>
                <TabsTrigger value="database" className="rounded-xl transition-all duration-300 data-[state=active]:bg-white dark:data-[state=active]:bg-white/20 data-[state=active]:shadow-md">
                  <Database className="w-4 h-4" />
                </TabsTrigger>
                <TabsTrigger value="settings" className="rounded-xl transition-all duration-300 data-[state=active]:bg-white dark:data-[state=active]:bg-white/20 data-[state=active]:shadow-md">
                  <Settings className="w-4 h-4" />
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-6">
                <Card className="border-0 bg-white/10 dark:bg-black/10 backdrop-blur-sm shadow-2xl">
                  <CardContent className="p-8">
                    <div
                      className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
                        dragActive
                          ? "border-blue-400 bg-blue-50/50 dark:bg-blue-900/20"
                          : "border-slate-300 dark:border-slate-600 hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-900/10"
                      }`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                    >
                      <div className="flex flex-col items-center space-y-6">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                          <Upload className="w-8 h-8 text-white" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                            Drop your WhatsApp chat file here
                          </h3>
                          <p className="text-slate-600 dark:text-slate-300 mb-4">
                            or click to browse and select your export file
                          </p>
                          <input
                            type="file"
                            onChange={handleFileChange}
                            accept=".txt,.zip,.json"
                            className="hidden"
                            id="file-upload"
                          />
                          <label
                            htmlFor="file-upload"
                            className="inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium cursor-pointer hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                          >
                            Choose File
                          </label>
                        </div>
                        {uploadedFile && (
                          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                            <p className="text-green-800 dark:text-green-300 font-medium">
                              File uploaded: {uploadedFile.name}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="dashboard" className="mt-6">
                <Card className="border-0 bg-white/10 dark:bg-black/10 backdrop-blur-sm shadow-2xl">
                  <CardContent className="p-8">
                    <div className="text-center py-12">
                      <BarChart3 className="w-16 h-16 mx-auto mb-4 text-slate-400" />
                      <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">Dashboard</h3>
                      <p className="text-slate-600 dark:text-slate-300">
                        Upload a chat file to see analytics and insights
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="chat" className="mt-6">
                <Card className="border-0 bg-white/10 dark:bg-black/10 backdrop-blur-sm shadow-2xl">
                  <CardContent className="p-8">
                    <div className="text-center py-12">
                      <MessageCircle className="w-16 h-16 mx-auto mb-4 text-slate-400" />
                      <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">AI Chat</h3>
                      <p className="text-slate-600 dark:text-slate-300">
                        Chat with AI about your WhatsApp conversations
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="database" className="mt-6">
                <Card className="border-0 bg-white/10 dark:bg-black/10 backdrop-blur-sm shadow-2xl">
                  <CardContent className="p-8">
                    <div className="text-center py-12">
                      <Database className="w-16 h-16 mx-auto mb-4 text-slate-400" />
                      <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">Database</h3>
                      <p className="text-slate-600 dark:text-slate-300">
                        View and search your processed chat data
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="settings" className="mt-6">
                <Card className="border-0 bg-white/10 dark:bg-black/10 backdrop-blur-sm shadow-2xl">
                  <CardContent className="p-8">
                    <div className="text-center py-12">
                      <Settings className="w-16 h-16 mx-auto mb-4 text-slate-400" />
                      <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">Settings</h3>
                      <p className="text-slate-600 dark:text-slate-300">
                        Configure your analysis preferences
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  )
} 