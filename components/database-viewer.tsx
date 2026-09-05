'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Download, Search, RefreshCw, Database, Trash2, Eye, ArrowUpDown, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface DatabaseViewerProps {
  data?: any
  isDecrypting?: boolean
  decryptProgress?: { current: number; total: number }
}

export function DatabaseViewer({ data, isDecrypting, decryptProgress }: DatabaseViewerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc') // Most recent first by default
  const [filteredData, setFilteredData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})

  // Pagination state to keep the DOM lightweight and prevent UI freeze
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  useEffect(() => {
    if (data?.messages) {
      const filtered = data.messages.filter((message: any) =>
        message.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        message.sender?.toLowerCase().includes(searchTerm.toLowerCase())
      )

      filtered.sort((a: any, b: any) => {
        const timeA = new Date(a.timestamp || 0).getTime()
        const timeB = new Date(b.timestamp || 0).getTime()
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB
      })

      setFilteredData(filtered)
      setCurrentPage(1) // reset to first page on search or sort change
    }
  }, [data, searchTerm, sortOrder])

  // Robust participant list derivation (from analysis or unique message senders)
  const effectiveParticipants = (data?.analysis?.participants && data.analysis.participants.length > 0)
    ? data.analysis.participants
    : Array.from(new Set((data?.messages || []).map((m: any) => m.sender).filter(Boolean)))

  // Slice paginated items
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize))
  const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
    if (isDecrypting) {
      return (
        <Card className="rounded-2xl border-blue-900/40 bg-slate-900/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-400" />
              Database Viewer
            </CardTitle>
            <CardDescription>
              Decrypting your private chat archive client-side using your zero-knowledge key...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 space-y-4">
              <RefreshCw className="h-12 w-12 mx-auto text-blue-400 animate-spin" />
              <div className="text-lg font-semibold text-slate-200">
                Decrypting Messages...
              </div>
              {decryptProgress && decryptProgress.total > 0 && (
                <p className="text-sm text-blue-300 font-mono">
                  {decryptProgress.current.toLocaleString()} / {decryptProgress.total.toLocaleString()} messages decrypted
                </p>
              )}
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Processing in non-blocking background batches to keep your browser responsive.
              </p>
            </div>
          </CardContent>
        </Card>
      )
    }

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
            <div className="text-2xl font-bold">{effectiveParticipants.length}</div>
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
              <CardDescription 
                role="status" 
                aria-label={`Showing ${filteredData.length} of ${(typeof data?.totalMessages === 'number' ? data.totalMessages : (data?.messages?.length || 0)).toLocaleString()} messages`}
              >
                Showing {filteredData.length} of {(typeof data?.totalMessages === 'number' ? data.totalMessages : (data?.messages?.length || 0)).toLocaleString()} messages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer select-none hover:text-slate-900 transition-colors"
                        onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                        title={`Click to sort (${sortOrder === 'desc' ? 'Newest first' : 'Oldest first'})`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold">
                          <span>Timestamp</span>
                          {sortOrder === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                          )}
                          <span className="text-[10px] font-normal text-muted-foreground ml-1">
                            ({sortOrder === 'desc' ? 'Newest' : 'Oldest'})
                          </span>
                        </div>
                      </TableHead>
                      <TableHead>Sender</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Sentiment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((message, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-xs">
                          {formatTimestamp(message.timestamp)}
                        </TableCell>
                        <TableCell className="font-medium max-w-32 truncate">
                          {message.sender || 'Unknown'}
                        </TableCell>
                        <TableCell 
                          className="max-w-md cursor-pointer select-none" 
                          onClick={() => setExpandedRows(prev => ({ ...prev, [index]: !prev[index] }))}
                        >
                          <div className={expandedRows[index] ? "whitespace-pre-wrap break-words text-sm" : "truncate"} title="Click to expand/collapse">
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

              {/* Pagination Controls */}
              {filteredData.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 mt-2">
                  <div className="text-xs text-muted-foreground">
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length.toLocaleString()} messages
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        title="First Page"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        title="Previous Page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs px-2 font-medium">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        title="Next Page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        title="Last Page"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
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
                    <div><strong>Participants:</strong> {effectiveParticipants.length}</div>
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