'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { FileText, Download, Copy, Check, Eye, Table as TableIcon, BarChart2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface ReportViewerModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle: string
  documentType: string
  project: any
  messages?: any[]
  onDownload: (docType: string, format: 'pdf' | 'csv' | 'json') => void
  isDownloading?: boolean
}

export function ReportViewerModal({
  isOpen,
  onClose,
  title,
  subtitle,
  documentType,
  project,
  messages = [],
  onDownload,
  isDownloading = false
}: ReportViewerModalProps) {
  const [copied, setCopied] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  if (!project) return null

  const participants = project.participants || []
  const messageCount = messages.length || project.messageCount || 0
  const analysis = project.analysis || {}
  const dateRange = project.dateRange || {}

  // Filter messages if searching in transcript preview
  const filteredMessages = messages.filter((m: any) =>
    (m.message || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.sender || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleCopyText = () => {
    let text = `${title} — ${project.name}\n${subtitle}\n\n`
    text += `Total Messages: ${messageCount}\n`
    text += `Participants: ${participants.join(', ')}\n`
    if (dateRange.start && dateRange.end) {
      text += `Date Range: ${new Date(dateRange.start).toLocaleDateString()} to ${new Date(dateRange.end).toLocaleDateString()}\n`
    }
    text += `\n`

    if (documentType === 'summary') {
      text += `--- EXECUTIVE SUMMARY ---\n`
      if (analysis.sentiment?.percentages) {
        text += `Sentiment: Positive ${analysis.sentiment.percentages.positive}%, Neutral ${analysis.sentiment.percentages.neutral}%, Negative ${analysis.sentiment.percentages.negative}%\n`
      }
      if (analysis.timeline?.insights) {
        text += `Activity: Active Days: ${analysis.timeline.insights.totalDays}, Avg Msgs/Day: ${analysis.timeline.insights.averageMessagesPerDay}\n`
      }
    } else {
      text += `--- TRANSCRIPT PREVIEW (First 50 Messages) ---\n`
      messages.slice(0, 50).forEach((m: any) => {
        text += `[${new Date(m.timestamp).toLocaleString()}] ${m.sender}: ${m.message}\n`
      })
    }

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({ title: 'Copied to Clipboard', description: 'Report text copied to your clipboard.' })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 text-slate-100 p-0 overflow-hidden rounded-2xl shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-6 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-white">
                  {title}
                  <Badge variant="outline" className="text-xs bg-slate-800 text-slate-300 border-slate-700">
                    Live On-Screen Preview
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-400 mt-0.5">
                  {subtitle} • {project.name}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Report Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Metadata Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
              <div className="text-xs text-slate-400 uppercase font-semibold">Total Messages</div>
              <div className="text-2xl font-bold text-blue-400 mt-1">{messageCount.toLocaleString()}</div>
            </div>
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
              <div className="text-xs text-slate-400 uppercase font-semibold">Participants</div>
              <div className="text-2xl font-bold text-purple-400 mt-1">{participants.length}</div>
            </div>
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
              <div className="text-xs text-slate-400 uppercase font-semibold">Start Date</div>
              <div className="text-sm font-semibold text-slate-200 mt-2 truncate">
                {dateRange.start ? new Date(dateRange.start).toLocaleDateString() : 'N/A'}
              </div>
            </div>
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
              <div className="text-xs text-slate-400 uppercase font-semibold">End Date</div>
              <div className="text-sm font-semibold text-slate-200 mt-2 truncate">
                {dateRange.end ? new Date(dateRange.end).toLocaleDateString() : 'N/A'}
              </div>
            </div>
          </div>

          {/* Participant Pills */}
          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
            <div className="text-xs text-slate-400 uppercase font-semibold mb-2">Verified Participants</div>
            <div className="flex flex-wrap gap-1.5">
              {participants.map((p: string, idx: number) => (
                <Badge key={idx} variant="secondary" className="bg-slate-800/80 text-slate-300 text-xs">
                  {p}
                </Badge>
              ))}
            </div>
          </div>

          {/* Analysis View (Executive Summary or Legal Report) */}
          {documentType === 'summary' ? (
            <div className="space-y-6">
              {/* Sentiment Overview */}
              <div className="bg-slate-950/50 p-5 rounded-xl border border-slate-800/80 space-y-3">
                <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-green-400" />
                  Sentiment & Operational Stress Metrics
                </h4>
                {analysis.sentiment?.percentages ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-3 rounded-lg bg-green-950/30 border border-green-900/50">
                        <div className="text-xs text-green-400 font-medium">Positive</div>
                        <div className="text-lg font-bold text-green-300">{analysis.sentiment.percentages.positive}%</div>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-xs text-slate-400 font-medium">Neutral</div>
                        <div className="text-lg font-bold text-slate-300">{analysis.sentiment.percentages.neutral}%</div>
                      </div>
                      <div className="p-3 rounded-lg bg-red-950/30 border border-red-900/50">
                        <div className="text-xs text-red-400 font-medium">Negative / Friction</div>
                        <div className="text-lg font-bold text-red-300">{analysis.sentiment.percentages.negative}%</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Run AI Analysis in the Insights tab to populate detailed sentiment ratios.</p>
                )}
              </div>

              {/* Activity Insights */}
              {analysis.timeline?.insights && (
                <div className="bg-slate-950/50 p-5 rounded-xl border border-slate-800/80 space-y-2 text-sm text-slate-300">
                  <h4 className="text-sm font-bold text-slate-200">Temporal Insights</h4>
                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>Active Days: <span className="font-semibold text-white">{analysis.timeline.insights.totalDays}</span></div>
                    <div>Avg Messages/Day: <span className="font-semibold text-white">{analysis.timeline.insights.averageMessagesPerDay}</span></div>
                  </div>
                </div>
              )}

              {/* Top Keywords */}
              {analysis.keywords && analysis.keywords.length > 0 && (
                <div className="bg-slate-950/50 p-5 rounded-xl border border-slate-800/80 space-y-2">
                  <h4 className="text-sm font-bold text-slate-200">Top Discussed Topics</h4>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {analysis.keywords.slice(0, 15).map((kw: string, i: number) => (
                      <Badge key={i} variant="outline" className="bg-slate-900 text-slate-300 border-slate-700 text-xs">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Legal Report / Detailed Analysis View */
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <TableIcon className="h-4 w-4 text-blue-400" />
                  Chronological Evidentiary Transcript ({filteredMessages.length} Messages)
                </h4>
                <input
                  type="text"
                  placeholder="Filter messages or sender..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 w-56"
                />
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-800/60">
                  {filteredMessages.length > 0 ? (
                    filteredMessages.slice(0, 100).map((msg: any, idx: number) => (
                      <div key={idx} className="p-3 hover:bg-slate-900/50 transition-colors text-xs space-y-1">
                        <div className="flex items-center justify-between text-slate-400 text-[11px]">
                          <span className="font-semibold text-blue-300">{msg.sender}</span>
                          <span>{new Date(msg.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      {messages.length === 0 ? 'No decrypted messages loaded in memory.' : 'No matching messages found.'}
                    </div>
                  )}
                </div>
              </div>
              {filteredMessages.length > 100 && (
                <p className="text-[11px] text-slate-500 text-center">
                  Showing first 100 of {filteredMessages.length} messages on screen. Full corpus is included upon document export.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action Footer */}
        <DialogFooter className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyText}
              className="text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700 w-full sm:w-auto"
            >
              {copied ? <Check className="h-3.5 w-3.5 mr-1 text-green-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copied ? 'Copied' : 'Copy Text'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white w-full sm:w-auto"
            >
              Close
            </Button>
          </div>

          {/* Export Options (Only when user decides to convert) */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-xs text-slate-400 mr-1 hidden sm:inline">Convert to:</span>
            <Button
              size="sm"
              disabled={isDownloading}
              onClick={() => onDownload(documentType, 'pdf')}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-xl"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              {isDownloading ? 'Generating...' : 'PDF'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isDownloading}
              onClick={() => onDownload(documentType, 'csv')}
              className="bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 text-xs rounded-xl"
            >
              CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isDownloading}
              onClick={() => onDownload(documentType, 'json')}
              className="bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 text-xs rounded-xl"
            >
              JSON
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
