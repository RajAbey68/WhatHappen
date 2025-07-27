'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Download, Search, RefreshCw, Database, Trash2, Eye } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface DatabaseViewerProps {
  data?: any
}

export function DatabaseViewer({ data }: DatabaseViewerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredData, setFilteredData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (data?.messages) {
      const filtered = data.messages.filter((message: any) =>
        message.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        message.sender?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredData(filtered.slice(0, 100)) // Limit to first 100 for performance
    }
  }, [data, searchTerm])

  const handleExportData = async (format: 'json' | 'csv') => {
    if (!data) {
      toast({
        title: "No data to export",
        description: "Please process chat files first",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)
      
      let exportData = ''
      let filename = ''
      let mimeType = ''

      if (format === 'json') {
        exportData = JSON.stringify(data, null, 2)
        filename = `whatsapp-analysis-${Date.now()}.json`
        mimeType = 'application/json'
      } else if (format === 'csv') {
        // Convert messages to CSV
        const headers = ['Timestamp', 'Sender', 'Message', 'Type', 'Sentiment Score']
        const csvRows = [headers.join(',')]
        
        data.messages?.forEach((msg: any) => {
          const row = [
            msg.timestamp || '',
            `"${(msg.sender || '').replace(/"/g, '""')}"`,
            `"${(msg.message || '').replace(/"/g, '""')}"`,
            msg.messageType || '',
            msg.sentiment?.score || 0
          ]
          csvRows.push(row.join(','))
        })
        
        exportData = csvRows.join('\n')
        filename = `whatsapp-analysis-${Date.now()}.csv`
        mimeType = 'text/csv'
      }

      // Create and download file
      const blob = new Blob([exportData], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: "Export successful",
        description: `Data exported as ${filename}`,
      })

    } catch (error) {
      console.error('Export error:', error)
      toast({
        title: "Export failed",
        description: "Failed to export data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const formatTimestamp = (timestamp: string | Date): string => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleString()
    } catch {
      return String(timestamp) || 'Invalid Date'
    }
  }

  const getSentimentBadge = (sentiment: any) => {
    if (!sentiment) return null
    
    const score = sentiment.score
    if (score > 0) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Positive</Badge>
    } else if (score < 0) {
      return <Badge variant="destructive">Negative</Badge>
    } else {
      return <Badge variant="secondary">Neutral</Badge>
    }
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Viewer
          </CardTitle>
          <CardDescription>
            No processed data available. Upload and process WhatsApp chat files to view data here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Database className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No chat data to display</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Viewer
              </CardTitle>
              <CardDescription>
                View and manage processed WhatsApp chat data
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportData('json')}
                disabled={isLoading}
              >
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportData('csv')}
                disabled={isLoading}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Data overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalMessages?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Participants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.analysis?.participants?.length || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">File Size</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.fileSize ? (data.fileSize / 1024 / 1024).toFixed(1) + ' MB' : 'N/A'}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold">
              {data.processedAt ? formatTimestamp(data.processedAt) : 'N/A'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data tabs */}
      <Tabs defaultValue="messages" className="space-y-4">
        <TabsList>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="analysis">Analysis Data</TabsTrigger>
          <TabsTrigger value="metadata">File Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle>Messages</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search messages..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-64"
                    />
                  </div>
                </div>
              </div>
              <CardDescription>
                Showing {filteredData.length} of {data.messages?.length || 0} messages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Sender</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Sentiment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((message, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-xs">
                          {formatTimestamp(message.timestamp)}
                        </TableCell>
                        <TableCell className="font-medium max-w-32 truncate">
                          {message.sender || 'Unknown'}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <div className="truncate" title={message.message}>
                            {message.message || 'No content'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {message.messageType || 'text'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {getSentimentBadge(message.sentiment)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analysis Results</CardTitle>
              <CardDescription>
                Statistical analysis and insights from the processed data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <pre className="text-xs bg-muted p-4 rounded-md overflow-auto">
                  {JSON.stringify(data.analysis, null, 2)}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metadata" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>File Metadata</CardTitle>
              <CardDescription>
                Information about the processed file and processing details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-2">File Information</h3>
                  <div className="space-y-2 text-sm">
                    <div><strong>Name:</strong> {data.fileName || 'N/A'}</div>
                    <div><strong>Size:</strong> {data.fileSize ? (data.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}</div>
                    <div><strong>Processed:</strong> {data.processedAt ? formatTimestamp(data.processedAt) : 'N/A'}</div>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Processing Statistics</h3>
                  <div className="space-y-2 text-sm">
                    <div><strong>Total Messages:</strong> {data.totalMessages || 0}</div>
                    <div><strong>Text Messages:</strong> {data.analysis?.textMessages || 0}</div>
                    <div><strong>Media Messages:</strong> {data.analysis?.mediaMessages || 0}</div>
                    <div><strong>Participants:</strong> {data.analysis?.participants?.length || 0}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 