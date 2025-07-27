'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Upload, File, CheckCircle, XCircle, Loader2, FileText, Archive, Code, Sparkles } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface FileUploadProps {
  onFileProcessed: (data: any) => void
}

interface UploadedFile {
  file: File
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  error?: string
  data?: any
}

export function FileUpload({ onFileProcessed }: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => ({
      file,
      status: 'pending' as const,
      progress: 0
    }))
    
    setUploadedFiles(prev => [...prev, ...newFiles])
    processFiles(newFiles)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip'],
      'application/json': ['.json']
    },
    multiple: true
  })

  const processFiles = async (files: UploadedFile[]) => {
    setIsProcessing(true)
    
    for (const uploadedFile of files) {
      try {
        setUploadedFiles(prev => 
          prev.map(f => 
            f.file === uploadedFile.file 
              ? { ...f, status: 'processing', progress: 10 }
              : f
          )
        )

        const formData = new FormData()
        formData.append('file', uploadedFile.file)

        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setUploadedFiles(prev => 
            prev.map(f => 
              f.file === uploadedFile.file && f.progress < 90
                ? { ...f, progress: f.progress + 10 }
                : f
            )
          )
        }, 500)

        const response = await fetch('/api/process-file', {
          method: 'POST',
          body: formData,
        })

        clearInterval(progressInterval)

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`)
        }

        const result = await response.json()

        setUploadedFiles(prev => 
          prev.map(f => 
            f.file === uploadedFile.file 
              ? { ...f, status: 'completed', progress: 100, data: result }
              : f
          )
        )

        toast({
          title: "✨ File processed successfully",
          description: `${uploadedFile.file.name} has been analyzed with AI insights.`,
        })

        if (onFileProcessed) {
          onFileProcessed(result)
        }

      } catch (error) {
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
          description: `Failed to process ${uploadedFile.file.name}`,
          variant: "destructive",
        })
      }
    }

    setIsProcessing(false)
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
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                  Processing Files
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {uploadedFiles.filter(f => f.status === 'completed').length} of {uploadedFiles.length} files completed
                </p>
              </div>
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
                        {uploadedFile.progress}% - Analyzing with AI...
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
    </div>
  )
} 