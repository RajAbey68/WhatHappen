'use client'
import { useState } from 'react'
import { Upload, MessageSquare, BarChart3 } from 'lucide-react'

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [results, setResults] = useState<any>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setIsProcessing(true)
    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        setResults(data)
      } else {
        alert('Error processing file. Please try again.')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error processing file. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!results ? (
          <div className="text-center">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">
                WhatsApp Chat Analyzer
              </h1>
              <p className="text-lg text-gray-600 mb-8">
                Upload your WhatsApp chat export and get detailed insights about your conversations
              </p>

              <div className="bg-white rounded-lg shadow p-6 mb-8">
                <div className="flex flex-col items-center">
                  <Upload className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Upload WhatsApp Chat Export
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Supports .txt files exported from WhatsApp
                  </p>
                  
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Choose File
                  </label>
                  
                  {selectedFile && (
                    <div className="mt-4 text-sm text-gray-600">
                      Selected: {selectedFile.name}
                    </div>
                  )}
                </div>
              </div>

              {selectedFile && (
                <button
                  onClick={handleUpload}
                  disabled={isProcessing}
                  className="bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Processing...' : 'Analyze Chat'}
                </button>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                <div className="text-center p-6">
                  <MessageSquare className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                  <h3 className="font-medium text-gray-900 mb-2">Message Analysis</h3>
                  <p className="text-sm text-gray-600">
                    Detailed breakdown of message patterns and frequency
                  </p>
                </div>
                <div className="text-center p-6">
                  <BarChart3 className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                  <h3 className="font-medium text-gray-900 mb-2">Statistics</h3>
                  <p className="text-sm text-gray-600">
                    Comprehensive stats about your chat activity
                  </p>
                </div>
                <div className="text-center p-6">
                  <Upload className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                  <h3 className="font-medium text-gray-900 mb-2">AI Insights</h3>
                  <p className="text-sm text-gray-600">
                    AI-powered analysis of conversation patterns
                  </p>
                </div>
              </div>

              <div className="mt-12 bg-blue-50 rounded-lg p-6">
                <h3 className="font-medium text-blue-900 mb-2">How to export WhatsApp chats:</h3>
                <ol className="text-sm text-blue-800 text-left list-decimal list-inside space-y-1">
                  <li>Open WhatsApp and go to the chat you want to analyze</li>
                  <li>Tap the three dots menu (⋮) in the top right</li>
                  <li>Select "More" → "Export chat"</li>
                  <li>Choose "Without media" for faster processing</li>
                  <li>Save the .txt file and upload it here</li>
                </ol>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Analysis Results</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-medium text-blue-900">Total Messages</h3>
                <p className="text-2xl font-bold text-blue-600">{results.totalMessages}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-medium text-green-900">Participants</h3>
                <p className="text-2xl font-bold text-green-600">{results.participants}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-medium text-purple-900">Days Active</h3>
                <p className="text-2xl font-bold text-purple-600">{results.daysActive}</p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <h3 className="font-medium text-orange-900">Avg/Day</h3>
                <p className="text-2xl font-bold text-orange-600">{results.avgPerDay}</p>
              </div>
            </div>
            
            <button
              onClick={() => {
                setResults(null)
                setSelectedFile(null)
              }}
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
            >
              Analyze Another Chat
            </button>
          </div>
        )}
      </div>
    </main>
  )
} 