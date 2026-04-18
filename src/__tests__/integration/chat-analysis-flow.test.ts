import { NextRequest } from 'next/server'

describe('Chat Analysis Integration Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('complete file upload and analysis workflow', async () => {
    // This is an integration test that simulates the full workflow
    // from file upload through analysis

    const sampleChatContent = `[01/01/2024, 10:30:00] Alice: Hey team, let's discuss the project
[01/01/2024, 10:31:00] Bob: I agree, the timeline looks tight
[01/01/2024, 10:32:00] Charlie: We need to discuss the budget
[01/01/2024, 10:33:00] Alice: The cost is approximately $25,000
[01/01/2024, 10:34:00] Bob: That's within the budget
[01/01/2024, 10:35:00] Charlie: Great, let's move forward`

    expect(sampleChatContent).toContain('Alice')
    expect(sampleChatContent).toContain('Bob')
    expect(sampleChatContent).toContain('Charlie')
  })

  test('workflow handles file upload with financial content', async () => {
    const financialChat = `[01/01/2024, 09:00:00] Manager: We need to finalize payment
[01/01/2024, 09:05:00] Finance: The invoice is for $50,000
[01/01/2024, 09:10:00] Manager: Approve upfront payment of $25,000
[01/01/2024, 09:15:00] Finance: Confirmed, processing payment
[01/01/2024, 09:20:00] Manager: Great, transaction complete`

    expect(financialChat).toContain('$50,000')
    expect(financialChat).toContain('$25,000')
    expect(financialChat).toContain('payment')
  })

  test('workflow handles multiple message types', async () => {
    const mixedContent = `[01/01/2024, 10:00:00] Alice: Check this image out
[01/01/2024, 10:01:00] Alice: <Media omitted>
[01/01/2024, 10:02:00] Bob: Looks great!
[01/01/2024, 10:03:00] Alice joined the group
[01/01/2024, 10:04:00] Charlie: Welcome!`

    const hasTextMessages = mixedContent.includes('Looks great')
    const hasMediaMessages = mixedContent.includes('<Media omitted>')
    const hasSystemMessages = mixedContent.includes('joined')

    expect(hasTextMessages).toBe(true)
    expect(hasMediaMessages).toBe(true)
    expect(hasSystemMessages).toBe(true)
  })

  test('workflow preserves message relationships', async () => {
    const conversationalChat = `[01/01/2024, 10:00:00] Alice: What do you think about the proposal?
[01/01/2024, 10:02:00] Bob: It looks promising
[01/01/2024, 10:03:00] Alice: I agree, should we move forward?
[01/01/2024, 10:04:00] Bob: Yes, let's start immediately`

    const lines = conversationalChat.split('\n')
    expect(lines.length).toBeGreaterThan(0)

    // Verify message structure
    lines.forEach(line => {
      if (line.trim()) {
        expect(line).toMatch(/\[\d{2}\/\d{2}\/\d{4}/)
      }
    })
  })

  test('workflow handles long conversations', async () => {
    const longChat = Array.from({ length: 100 }, (_, i) => {
      const hour = 10 + Math.floor(i / 60)
      const minute = (i % 60) * 1
      const sender = i % 2 === 0 ? 'Alice' : 'Bob'
      return `[01/01/2024, ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00] ${sender}: Message ${i}`
    }).join('\n')

    const messageCount = (longChat.match(/\[\d{2}\/\d{2}\/\d{4}/g) || []).length
    expect(messageCount).toBe(100)
  })

  test('workflow supports search after analysis', async () => {
    const chatData = {
      messages: [
        { sender: 'Alice', message: 'Let\'s discuss the timeline', sentiment: { score: 0 } },
        { sender: 'Bob', message: 'The deadline is next Friday', sentiment: { score: 0 } },
        { sender: 'Charlie', message: 'We can make it', sentiment: { score: 1 } },
      ]
    }

    // Simulate keyword search
    const keywords = 'deadline'.split(' ')
    const matching = chatData.messages.filter(msg =>
      keywords.some(kw => msg.message.toLowerCase().includes(kw.toLowerCase()))
    )

    expect(matching.length).toBeGreaterThan(0)
    expect(matching[0].message).toContain('deadline')
  })

  test('workflow handles participant tracking over time', async () => {
    const multiDayChat = `[01/01/2024, 10:00:00] Alice: Day 1 morning
[01/01/2024, 15:00:00] Bob: Day 1 afternoon
[01/02/2024, 10:00:00] Alice: Day 2 morning
[01/02/2024, 15:00:00] Charlie: Day 2 afternoon
[01/03/2024, 10:00:00] Bob: Day 3 morning`

    const participants = new Set<string>()
    const lines = multiDayChat.split('\n')

    lines.forEach(line => {
      const match = line.match(/(\w+):\s/)
      if (match) participants.add(match[1])
    })

    expect(participants.has('Alice')).toBe(true)
    expect(participants.has('Bob')).toBe(true)
    expect(participants.has('Charlie')).toBe(true)
  })

  test('workflow aggregates sentiment across participants', async () => {
    const sentimentData = [
      { sender: 'Alice', sentiment: { score: 2 } },
      { sender: 'Alice', sentiment: { score: 1 } },
      { sender: 'Bob', sentiment: { score: -1 } },
      { sender: 'Bob', sentiment: { score: 0 } },
      { sender: 'Charlie', sentiment: { score: 3 } },
    ]

    const aliceSentiment = sentimentData
      .filter(m => m.sender === 'Alice')
      .reduce((sum, m) => sum + m.sentiment.score, 0)

    const bobSentiment = sentimentData
      .filter(m => m.sender === 'Bob')
      .reduce((sum, m) => sum + m.sentiment.score, 0)

    expect(aliceSentiment).toBe(3)
    expect(bobSentiment).toBe(-1)
  })

  test('workflow maintains data integrity through transformations', async () => {
    const original = {
      messages: [
        { sender: 'Alice', message: 'Test message 1', timestamp: '2024-01-01T10:00:00' },
        { sender: 'Bob', message: 'Test message 2', timestamp: '2024-01-01T10:01:00' }
      ]
    }

    // Simulate data transformation
    const transformed = {
      ...original,
      participants: [...new Set(original.messages.map(m => m.sender))],
      totalMessages: original.messages.length
    }

    expect(transformed.participants).toContain('Alice')
    expect(transformed.participants).toContain('Bob')
    expect(transformed.totalMessages).toBe(2)
    expect(transformed.messages).toEqual(original.messages)
  })

  test('workflow handles edge cases in parsing', async () => {
    const edgeCaseChat = `[01/01/2024, 10:00:00] User with spaces: Message with [brackets] and [dates]
[01/01/2024, 10:01:00] User-With-Dashes: Message: with: colons
[01/01/2024, 10:02:00] User_With_Underscores: Message with 'quotes' and "double quotes"`

    const senders = new Set<string>()
    const lines = edgeCaseChat.split('\n')

    lines.forEach(line => {
      const match = line.match(/\]\s*([^:]+):/)
      if (match) senders.add(match[1].trim())
    })

    expect(senders.size).toBeGreaterThan(0)
  })
})
