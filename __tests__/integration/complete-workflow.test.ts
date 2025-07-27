import { POST as processFilePost } from '../../app/api/process-file/route'
import { POST as aiSearchPost } from '../../app/api/ai-search/route'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('mammoth', () => ({
  extractRawText: jest.fn()
}))

jest.mock('pdf-parse', () => jest.fn())

jest.mock('csv-parse/sync', () => ({
  parse: jest.fn()
}))

jest.mock('sentiment', () => {
  return jest.fn().mockImplementation(() => ({
    analyze: jest.fn().mockReturnValue({ score: 0.5, comparative: 0.1 })
  }))
})

jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'AI analysis: This chat shows financial discussions and emotional conversations.'
              }
            }]
          })
        }
      }
    }))
  }
})

describe('Complete WhatsApp Analyzer Workflow', () => {
  const sampleChatContent = `[1/15/2025, 10:30:00 AM] Raj ASIMOV-AI: I do not have the $24,000 to pay you upfront
[1/15/2025, 10:31:00 AM] John Smith: That's a lot of money! Can you pay in installments?
[1/15/2025, 10:32:00 AM] Raj ASIMOV-AI: Yes, I can pay $500 monthly
[1/15/2025, 10:33:00 AM] John Smith: That sounds reasonable
[1/15/2025, 10:34:00 AM] Jane Doe: I'm so happy about this deal! 🎉
[1/15/2025, 10:35:00 AM] Raj ASIMOV-AI: This is terrible timing though...
[1/15/2025, 10:36:00 AM] Bob Wilson: Meeting tomorrow at 3pm
[1/15/2025, 10:37:00 AM] Alice Brown: Can someone send me the contract?
[1/15/2025, 10:38:00 AM] John Smith: I'll email it tonight
[1/15/2025, 10:39:00 AM] Raj ASIMOV-AI: Thanks everyone! 👍`

  const createMockFormData = (fileName: string, content: string, type = 'text/plain') => {
    const file = new File([content], fileName, { type })
    const formData = new FormData()
    formData.append('file', file)
    return formData
  }

  const createMockRequest = (data: any): NextRequest => {
    if (data instanceof FormData) {
      return {
        formData: jest.fn().mockResolvedValue(data)
      } as unknown as NextRequest
    } else {
      return {
        json: jest.fn().mockResolvedValue(data)
      } as unknown as NextRequest
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-api-key'
  })

  describe('End-to-End File Processing and Analysis', () => {
    test('should process file and enable all search types', async () => {
      // Step 1: Process the chat file
      const formData = createMockFormData('chat.txt', sampleChatContent)
      const processRequest = createMockRequest(formData)

      const processResponse = await processFilePost(processRequest)
      const processResult = await processResponse.json()

      expect(processResponse.status).toBe(200)
      expect(processResult.success).toBe(true)

      const chatData = processResult.data
      expect(chatData.totalMessages).toBe(10)
      expect(chatData.participants).toHaveLength(5)
      expect(chatData.participants.map((p: any) => p.name).sort()).toEqual([
        'Alice Brown',
        'Bob Wilson', 
        'Jane Doe',
        'John Smith',
        'Raj ASIMOV-AI'
      ])

      // Step 2: Test Financial Analysis
      const financialRequest = createMockRequest({
        data: chatData,
        searchType: 'financial'
      })

      const financialResponse = await aiSearchPost(financialRequest)
      const financialResult = await financialResponse.json()

      expect(financialResponse.status).toBe(200)
      expect(financialResult.success).toBe(true)
      expect(financialResult.results.length).toBeGreaterThan(0)
      
      // Should find the $24,000 and $500 messages
      const financialMessages = financialResult.results
      expect(financialMessages.some((msg: any) => msg.content.includes('$24,000'))).toBe(true)
      expect(financialMessages.some((msg: any) => msg.content.includes('$500'))).toBe(true)

      // Step 3: Test Semantic Search
      const semanticRequest = createMockRequest({
        data: chatData,
        searchType: 'semantic',
        query: 'payment arrangements'
      })

      const semanticResponse = await aiSearchPost(semanticRequest)
      const semanticResult = await semanticResponse.json()

      expect(semanticResponse.status).toBe(200)
      expect(semanticResult.success).toBe(true)
      expect(semanticResult.analysis).toBeDefined()

      // Step 4: Test Keyword Search
      const keywordRequest = createMockRequest({
        data: chatData,
        searchType: 'keyword',
        query: 'meeting contract'
      })

      const keywordResponse = await aiSearchPost(keywordRequest)
      const keywordResult = await keywordResponse.json()

      expect(keywordResponse.status).toBe(200)
      expect(keywordResult.success).toBe(true)
      expect(keywordResult.results.some((msg: any) => 
        msg.content.toLowerCase().includes('meeting') || 
        msg.content.toLowerCase().includes('contract')
      )).toBe(true)

      // Step 5: Test Sentiment Analysis
      const sentimentRequest = createMockRequest({
        data: chatData,
        searchType: 'sentiment',
        query: 'positive'
      })

      const sentimentResponse = await aiSearchPost(sentimentRequest)
      const sentimentResult = await sentimentResponse.json()

      expect(sentimentResponse.status).toBe(200)
      expect(sentimentResult.success).toBe(true)
      expect(sentimentResult.results.some((msg: any) => 
        msg.content.includes('happy') || msg.content.includes('🎉')
      )).toBe(true)
    })

    test('should handle complex financial discussions', async () => {
      const complexFinancialChat = `[1/15/2025, 10:30:00 AM] Raj: I need $24000 upfront payment
[1/15/2025, 10:31:00 AM] John: That's 24,000 dollars - quite expensive
[1/15/2025, 10:32:00 AM] Jane: Maybe try 24x1000 installments?
[1/15/2025, 10:33:00 AM] Raj: I don't have 24k right now
[1/15/2025, 10:34:00 AM] Bob: What about twenty four thousand in parts?`

      // Process file
      const formData = createMockFormData('financial-chat.txt', complexFinancialChat)
      const processRequest = createMockRequest(formData)
      const processResponse = await processFilePost(processRequest)
      const processResult = await processResponse.json()

      expect(processResponse.status).toBe(200)
      expect(processResult.success).toBe(true)

      // Test financial search finds all variations
      const financialRequest = createMockRequest({
        data: processResult.data,
        searchType: 'financial'
      })

      const financialResponse = await aiSearchPost(financialRequest)
      const financialResult = await financialResponse.json()

      expect(financialResponse.status).toBe(200)
      expect(financialResult.success).toBe(true)
      
      const financialMessages = financialResult.results
      expect(financialMessages.length).toBeGreaterThanOrEqual(4) // Should find multiple financial references
    })

    test('should analyze sentiment correctly across participants', async () => {
      // Process file first
      const formData = createMockFormData('sentiment-chat.txt', sampleChatContent)
      const processRequest = createMockRequest(formData)
      const processResponse = await processFilePost(processRequest)
      const processResult = await processResponse.json()

      expect(processResult.data.sentimentAnalysis).toBeDefined()
      expect(processResult.data.sentimentAnalysis.byParticipant).toBeDefined()

      // Test sentiment search for positive messages
      const positiveRequest = createMockRequest({
        data: processResult.data,
        searchType: 'sentiment',
        query: 'positive'
      })

      const positiveResponse = await aiSearchPost(positiveRequest)
      const positiveResult = await positiveResponse.json()

      expect(positiveResponse.status).toBe(200)
      expect(positiveResult.results.some((msg: any) => 
        msg.content.includes('happy') || msg.content.includes('Thanks')
      )).toBe(true)

      // Test sentiment search for negative messages  
      const negativeRequest = createMockRequest({
        data: processResult.data,
        searchType: 'sentiment',
        query: 'negative'
      })

      const negativeResponse = await aiSearchPost(negativeRequest)
      const negativeResult = await negativeResponse.json()

      expect(negativeResponse.status).toBe(200)
      expect(negativeResult.results.some((msg: any) => 
        msg.content.includes('terrible')
      )).toBe(true)
    })

    test('should handle time-based analysis correctly', async () => {
      // Process file
      const formData = createMockFormData('time-chat.txt', sampleChatContent)
      const processRequest = createMockRequest(formData)
      const processResponse = await processFilePost(processRequest)
      const processResult = await processResponse.json()

      expect(processResult.data.timeAnalysis).toBeDefined()
      expect(processResult.data.timeAnalysis.dailyDistribution).toBeDefined()
      expect(processResult.data.timeAnalysis.hourlyDistribution).toBeDefined()

      // All messages should be on the same day (1/15/2025)
      const dailyDist = processResult.data.timeAnalysis.dailyDistribution
      expect(Object.keys(dailyDist).length).toBe(1)
      expect(dailyDist['2025-01-15']).toBe(10)

      // All messages should be in the 10 AM hour
      const hourlyDist = processResult.data.timeAnalysis.hourlyDistribution
      expect(hourlyDist['10']).toBe(10)
    })

    test('should calculate word frequency accurately', async () => {
      // Process file
      const formData = createMockFormData('word-chat.txt', sampleChatContent)
      const processRequest = createMockRequest(formData)
      const processResponse = await processFilePost(processRequest)
      const processResult = await processResponse.json()

      expect(processResult.data.wordFrequency).toBeDefined()
      const wordFreq = processResult.data.wordFrequency

      // Common words should appear multiple times
      expect(wordFreq['the']).toBeGreaterThan(1)
      expect(wordFreq['can']).toBeGreaterThan(1)
      
      // Specific words should appear exact number of times
      expect(wordFreq['meeting']).toBe(1)
      expect(wordFreq['contract']).toBe(1)
    })
  })

  describe('Error Recovery and Edge Cases', () => {
    test('should handle processing errors gracefully', async () => {
      // Test with malformed chat
      const malformedChat = 'This is not a valid WhatsApp chat format at all!'
      const formData = createMockFormData('malformed.txt', malformedChat)
      const processRequest = createMockRequest(formData)

      const processResponse = await processFilePost(processRequest)
      const processResult = await processResponse.json()

      expect(processResponse.status).toBe(200) // Should still succeed
      expect(processResult.success).toBe(true)
      expect(processResult.data.totalMessages).toBe(0)

      // Try to search the empty data
      const searchRequest = createMockRequest({
        data: processResult.data,
        searchType: 'keyword',
        query: 'test'
      })

      const searchResponse = await aiSearchPost(searchRequest)
      const searchResult = await searchResponse.json()

      expect(searchResponse.status).toBe(200)
      expect(searchResult.success).toBe(true)
      expect(searchResult.results).toHaveLength(0)
    })

    test('should handle API failures gracefully', async () => {
      // Mock OpenAI to fail
      const OpenAI = require('openai').OpenAI
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('API Error'))
          }
        }
      }))

      // Process file first (should succeed)
      const formData = createMockFormData('chat.txt', sampleChatContent)
      const processRequest = createMockRequest(formData)
      const processResponse = await processFilePost(processRequest)
      const processResult = await processResponse.json()

      expect(processResponse.status).toBe(200)

      // Try semantic search (should fail gracefully)
      const searchRequest = createMockRequest({
        data: processResult.data,
        searchType: 'semantic',
        query: 'test'
      })

      const searchResponse = await aiSearchPost(searchRequest)
      const searchResult = await searchResponse.json()

      expect(searchResponse.status).toBe(500)
      expect(searchResult.success).toBe(false)
      expect(searchResult.error).toContain('AI analysis failed')
    })

    test('should handle large datasets efficiently', async () => {
      // Generate large chat content
      let largeChatContent = ''
      for (let i = 0; i < 100; i++) {
        largeChatContent += `[1/15/2025, ${String(10 + (i % 12)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00 AM] User${i % 5}: Message ${i} with content $${i * 10}\n`
      }

      const formData = createMockFormData('large-chat.txt', largeChatContent)
      const processRequest = createMockRequest(formData)

      const processResponse = await processFilePost(processRequest)
      const processResult = await processResponse.json()

      expect(processResponse.status).toBe(200)
      expect(processResult.success).toBe(true)
      expect(processResult.data.totalMessages).toBe(100)

      // Test financial search on large dataset
      const financialRequest = createMockRequest({
        data: processResult.data,
        searchType: 'financial'
      })

      const financialResponse = await aiSearchPost(financialRequest)
      const financialResult = await financialResponse.json()

      expect(financialResponse.status).toBe(200)
      expect(financialResult.success).toBe(true)
      expect(financialResult.results.length).toBe(100) // Should find all messages with money
    })
  })

  describe('Multi-format File Support', () => {
    test('should process different file formats consistently', async () => {
      const testCases = [
        { filename: 'chat.txt', content: sampleChatContent, type: 'text/plain' },
        { filename: 'chat.json', content: JSON.stringify({
          messages: sampleChatContent.split('\n').map(line => {
            const match = line.match(/\[(.*?)\] (.*?): (.*)/)
            if (match) {
              return {
                timestamp: match[1],
                sender: match[2],
                content: match[3]
              }
            }
            return null
          }).filter(Boolean)
        }), type: 'application/json' }
      ]

      for (const testCase of testCases) {
        const formData = createMockFormData(testCase.filename, testCase.content, testCase.type)
        const processRequest = createMockRequest(formData)

        const processResponse = await processFilePost(processRequest)
        const processResult = await processResponse.json()

        expect(processResponse.status).toBe(200)
        expect(processResult.success).toBe(true)
        expect(processResult.data.totalMessages).toBeGreaterThan(0)
        expect(processResult.data.participants.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Memory Requirements from Previous Work', () => {
    test('should find financial messages including specific $24,000 reference', async () => {
      // This test verifies the critical functionality mentioned in the memory
      const formData = createMockFormData('specific-financial.txt', sampleChatContent)
      const processRequest = createMockRequest(formData)
      const processResponse = await processFilePost(processRequest)
      const processResult = await processResponse.json()

      // Test financial search
      const financialRequest = createMockRequest({
        data: processResult.data,
        searchType: 'financial'
      })

      const financialResponse = await aiSearchPost(financialRequest)
      const financialResult = await financialResponse.json()

      expect(financialResponse.status).toBe(200)
      expect(financialResult.success).toBe(true)

      // Specifically test for the $24,000 message from Raj ASIMOV-AI
      const specificMessage = financialResult.results.find((msg: any) => 
        msg.content.includes('$24,000') && 
        msg.sender === 'Raj ASIMOV-AI'
      )
      
      expect(specificMessage).toBeDefined()
      expect(specificMessage.content).toContain('I do not have the $24,000 to pay you upfront')
    })
  })
}) 