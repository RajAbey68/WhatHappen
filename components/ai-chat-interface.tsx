'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Send, Bot, User, Loader2, Search, TrendingUp, DollarSign } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface AIChatInterfaceProps {
  data?: any
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  type?: 'financial_analysis' | 'semantic_search' | 'keyword_search' | 'sentiment_analysis'
  metadata?: any
}

const SUGGESTED_QUERIES = [
  {
    text: "Show me financial discussions and payment mentions",
    icon: DollarSign,
    searchType: 'financial'
  },
  {
    text: "What are the most discussed topics?",
    icon: TrendingUp,
    searchType: 'semantic'
  },
  {
    text: "Find messages about specific events or dates",
    icon: Search,
    searchType: 'keyword'
  },
  {
    text: "Analyze the emotional tone of conversations",
    icon: Bot,
    searchType: 'sentiment'
  }
]

export function AIChatInterface({ data }: AIChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages])

  const handleSendMessage = async (query: string, searchType?: string) => {
    if (!query.trim()) return

    const newUserMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, newUserMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/ai-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          chatData: data,
          options: {
            searchType: searchType || 'semantic',
            limit: 20,
            includeContext: true
          }
        }),
      })

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`)
      }

      const result = await response.json()

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: formatAssistantResponse(result),
        timestamp: new Date(),
        type: result.type,
        metadata: result
      }

      setMessages(prev => [...prev, assistantMessage])

      toast({
        title: "Search completed",
        description: `Found results using ${result.type?.replace('_', ' ')} analysis`,
      })

    } catch (error) {
      console.error('AI search error:', error)
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I apologize, but I encountered an error while searching: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again with a different query.`,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, errorMessage])

      toast({
        title: "Search failed",
        description: "Please try again with a different query",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const formatAssistantResponse = (result: any): string => {
    switch (result.type) {
      case 'financial_analysis':
        const financial = result.result
        return `💰 **Financial Analysis Results**

**Summary:** ${financial.summary}

**Key Findings:**
${financial.keyFindings.map((finding: string) => `• ${finding}`).join('\n')}

**Found ${financial.totalFinancialMessages} financial-related messages.** ${financial.financialMentions.length > 0 ? 'Recent mentions include discussions about payments, amounts, and financial commitments.' : ''}

${financial.financialMentions.slice(0, 3).map((mention: any) => 
  `📝 **${mention.sender}**: ${mention.message.substring(0, 100)}...`
).join('\n\n')}`

      case 'semantic_search':
        return `🔍 **Semantic Search Results**

${result.results.summary}

**Found ${result.results.totalSearched} messages to analyze.** Here are some relevant excerpts:

${result.results.results?.slice(0, 3).map((msg: any) => 
  `💬 **${msg.sender}**: ${msg.message?.substring(0, 150)}...`
).join('\n\n') || 'No specific message excerpts available.'}`

      case 'keyword_search':
        return `🔍 **Keyword Search Results**

${result.results.summary}

**Matching Messages:**
${result.results.results?.slice(0, 5).map((msg: any) => 
  `📝 **${msg.sender}**: ${msg.message?.substring(0, 120)}...`
).join('\n\n') || 'No matching messages found.'}`

      case 'sentiment_analysis':
        const sentiment = result.results
        return `😊 **Sentiment Analysis Results**

${sentiment.summary}

**Emotional Breakdown:**
• **Positive Messages**: ${sentiment.results.positive?.length || 0}
• **Negative Messages**: ${sentiment.results.negative?.length || 0}  
• **Neutral Messages**: ${sentiment.results.neutral?.length || 0}

**Recent Examples:**
${sentiment.results.positive?.slice(0, 2).map((msg: any) => 
  `😊 **${msg.sender}**: ${msg.message?.substring(0, 100)}...`
).join('\n') || ''}

${sentiment.results.negative?.slice(0, 2).map((msg: any) => 
  `😔 **${msg.sender}**: ${msg.message?.substring(0, 100)}...`
).join('\n') || ''}`

      default:
        return result.summary || 'Analysis completed successfully.'
    }
  }

  const handleSuggestedQuery = (query: string, searchType: string) => {
    setInput(query)
    handleSendMessage(query, searchType)
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Chat Analysis</CardTitle>
          <CardDescription>
            Upload and process WhatsApp chat files first to enable AI analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Once you have processed chat data, you can ask questions like:
          </p>
          <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside">
            <li>Show me financial discussions and payment mentions</li>
            <li>What are the most positive conversations?</li>
            <li>Find messages about specific topics or events</li>
            <li>Analyze communication patterns between participants</li>
          </ul>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Chat Messages */}
      <Card className="h-[500px] flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Chat Analysis
          </CardTitle>
          <CardDescription>
            Ask questions about your WhatsApp chat data. I can help with financial analysis, 
            sentiment analysis, keyword searches, and more.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col">
          <ScrollArea className="flex-1 pr-4" ref={scrollAreaRef}>
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Ready to analyze your chat data!</p>
                <p className="text-sm">Try one of the suggested queries below or ask your own question.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className="flex gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {message.role === 'user' ? 'You' : 'AI Assistant'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {message.timestamp.toLocaleTimeString()}
                        </span>
                        {message.type && (
                          <Badge variant="outline" className="text-xs">
                            {message.type.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                      </div>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Analyzing...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <Separator className="my-4" />
          
          {/* Input Area */}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your chat data... (e.g., 'Show me financial discussions')"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage(input)
                }
              }}
              disabled={isLoading}
              className="flex-1"
            />
            <Button 
              onClick={() => handleSendMessage(input)}
              disabled={isLoading || !input.trim()}
              size="icon"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Suggested Queries */}
      {messages.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Suggested Queries</CardTitle>
            <CardDescription>
              Click on any suggestion to get started with AI analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SUGGESTED_QUERIES.map((suggestion, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="h-auto p-4 text-left justify-start"
                  onClick={() => handleSuggestedQuery(suggestion.text, suggestion.searchType)}
                  disabled={isLoading}
                >
                  <suggestion.icon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="text-sm">{suggestion.text}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 