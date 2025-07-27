'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'
import { MessageCircle, Users, TrendingUp, Clock, FileText, Heart, Frown, Meh } from 'lucide-react'
import { formatDate, formatTime, truncate } from '@/lib/utils'

interface DashboardProps {
  data: {
    fileName: string
    fileSize: number
    processedAt: string
    analysis: any
    messages: any[]
    totalMessages: number
  }
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

export function Dashboard({ data }: DashboardProps) {
  const [selectedTab, setSelectedTab] = useState('overview')
  
  const { analysis, messages, totalMessages } = data

  // Prepare chart data
  const participantData = useMemo(() => {
    if (!analysis?.messagesByParticipant) return []
    return Object.entries(analysis.messagesByParticipant).map(([name, count]) => ({
      name: truncate(name, 15),
      fullName: name,
      messages: count,
      percentage: ((count as number) / totalMessages * 100).toFixed(1)
    }))
  }, [analysis?.messagesByParticipant, totalMessages])

  const dailyData = useMemo(() => {
    if (!analysis?.dailyMessageCounts) return []
    return analysis.dailyMessageCounts.slice(-30).map((item: any) => ({
      date: formatDate(item.date),
      messages: item.count
    }))
  }, [analysis?.dailyMessageCounts])

  const hourlyData = useMemo(() => {
    if (!analysis?.hourlyDistribution) return []
    return Object.entries(analysis.hourlyDistribution).map(([hour, count]) => ({
      hour: `${hour}:00`,
      messages: count
    })).sort((a, b) => parseInt(a.hour) - parseInt(b.hour))
  }, [analysis?.hourlyDistribution])

  const topWords = useMemo(() => {
    if (!analysis?.topWords) return []
    return analysis.topWords.slice(0, 10)
  }, [analysis?.topWords])

  const sentimentData = useMemo(() => {
    if (!messages) return []
    const positive = messages.filter(m => m.sentiment?.score > 0).length
    const negative = messages.filter(m => m.sentiment?.score < 0).length
    const neutral = messages.filter(m => m.sentiment?.score === 0).length
    
    return [
      { name: 'Positive', value: positive, color: '#00C49F' },
      { name: 'Negative', value: negative, color: '#FF8042' },
      { name: 'Neutral', value: neutral, color: '#0088FE' }
    ]
  }, [messages])

  if (!data || !analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Data Available</CardTitle>
          <CardDescription>Please upload and process a chat file first.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMessages.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {analysis.textMessages} text, {analysis.mediaMessages} media
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Participants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analysis.participants?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active contributors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Date Range</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold">
              {analysis.dateRange ? formatDate(analysis.dateRange.start) : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              to {analysis.dateRange ? formatDate(analysis.dateRange.end) : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Sentiment</CardTitle>
            {analysis.averageSentiment > 0 ? (
              <Heart className="h-4 w-4 text-green-500" />
            ) : analysis.averageSentiment < 0 ? (
              <Frown className="h-4 w-4 text-red-500" />
            ) : (
              <Meh className="h-4 w-4 text-yellow-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analysis.averageSentiment?.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              {analysis.averageSentiment > 0 ? 'Positive' : analysis.averageSentiment < 0 ? 'Negative' : 'Neutral'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="words">Word Analysis</TabsTrigger>
          <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Daily Message Activity</CardTitle>
                <CardDescription>Message count over the last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="messages" stroke="#8884d8" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hourly Distribution</CardTitle>
                <CardDescription>When are people most active?</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="messages" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>File Information</CardTitle>
              <CardDescription>Details about the processed file</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium">File Name</p>
                  <p className="text-xs text-muted-foreground">{data.fileName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">File Size</p>
                  <p className="text-xs text-muted-foreground">
                    {(data.fileSize / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Processed At</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(data.processedAt)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="participants" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Message Distribution</CardTitle>
                <CardDescription>Messages by participant</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={participantData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percentage }) => `${name}: ${percentage}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="messages"
                    >
                      {participantData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Participant Statistics</CardTitle>
                <CardDescription>Detailed breakdown by person</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {participantData.map((participant, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="font-medium text-sm" title={participant.fullName}>
                            {participant.name}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">{String(participant.messages)}</div>
                          <div className="text-xs text-muted-foreground">{participant.percentage}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Activity</CardTitle>
              <CardDescription>Complete timeline of message activity</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={analysis.dailyMessageCounts || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="words" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Most Frequent Words</CardTitle>
              <CardDescription>Top words used in conversations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topWords} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="word" type="category" width={80} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
                
                <div className="space-y-2">
                  {topWords.map((word: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <Badge variant="outline">{word.word}</Badge>
                      <span className="font-bold">{word.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sentiment" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Sentiment Distribution</CardTitle>
                <CardDescription>Overall emotional tone of conversations</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={sentimentData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {sentimentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sentiment Metrics</CardTitle>
                <CardDescription>Detailed emotional analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Overall Sentiment Score</p>
                    <div className="text-2xl font-bold">
                      {analysis.averageSentiment?.toFixed(2) || '0.00'}
                    </div>
                  </div>
                  
                  {sentimentData.map((sentiment, index) => (
                    <div key={index}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium">{sentiment.name}</span>
                        <span className="text-sm">{sentiment.value}</span>
                      </div>
                      <Progress 
                        value={(sentiment.value / totalMessages) * 100} 
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
} 