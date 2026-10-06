import { BuzzClient, CloudEvent, createUploadCompletedEvent, createChatReadyEvent, createMoeJobEvent } from '@/lib/swarm/BuzzClient'
import WebSocket from 'ws'

jest.mock('ws')

describe('BuzzClient - CloudEvents 1.0 Implementation', () => {
  let buzzClient: BuzzClient
  let mockWebSocket: jest.Mocked<WebSocket>

  beforeEach(() => {
    jest.clearAllMocks()
    buzzClient = new BuzzClient({ wsUrl: 'wss://test.example.com', nsec: 'test-secret' })
    
    mockWebSocket = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.OPEN,
    } as any

    ;(WebSocket as jest.Mock).mockImplementation(() => mockWebSocket)
  })

  afterEach(() => {
    buzzClient.disconnect()
  })

  describe('Connection Management', () => {
    it('should connect successfully to BuzzBar', async () => {
      const connectPromise = buzzClient.connect()

      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as Function
      openHandler()

      await connectPromise
      expect(buzzClient.getConnectionStatus()).toBe(true)
    })

    it('should handle connection timeout', async () => {
      const connectPromise = buzzClient.connect()

      await expect(connectPromise).rejects.toThrow('Connection timeout')
    })

    it('should disconnect gracefully', async () => {
      const connectPromise = buzzClient.connect()
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as Function
      openHandler()
      await connectPromise

      buzzClient.disconnect()
      expect(mockWebSocket.close).toHaveBeenCalled()
      expect(buzzClient.getConnectionStatus()).toBe(false)
    })
  })

  describe('CloudEvents 1.0 Publishing', () => {
    beforeEach(async () => {
      const connectPromise = buzzClient.connect()
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as Function
      openHandler()
      await connectPromise
    })

    it('should publish UPLOAD_COMPLETED event to ingest channel', async () => {
      const event = createUploadCompletedEvent('session-123', 'proj-456', 'test.zip')
      await buzzClient.publish('ingest', event)

      expect(mockWebSocket.send).toHaveBeenCalled()
      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0] as string)

      expect(sentMessage.action).toBe('publish')
      expect(sentMessage.channelId).toBe(BuzzClient.CHANNELS.ingest.channelId)
      expect(sentMessage.event.specversion).toBe('1.0')
      expect(sentMessage.event.type).toBe('com.whathappen.upload.completed')
      expect(sentMessage.event.data.sessionId).toBe('session-123')
    })

    it('should publish CHAT_READY_FOR_ANALYSIS event to ingest channel', async () => {
      const event = createChatReadyEvent('session-123', 'proj-456', 100)
      await buzzClient.publish('ingest', event)

      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0] as string)
      expect(sentMessage.event.type).toBe('com.whathappen.chat.ready')
      expect(sentMessage.event.data.messageCount).toBe(100)
    })

    it('should publish MoE job event to analytics channel', async () => {
      const event = createMoeJobEvent('job-789', 'ocr-processing', 'completed')
      await buzzClient.publish('analytics', event)

      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0] as string)
      expect(sentMessage.channelId).toBe(BuzzClient.CHANNELS.analytics.channelId)
      expect(sentMessage.event.type).toBe('com.whathappen.moe.ocr-processing')
    })

    it('should generate valid CloudEvents 1.0 envelope', async () => {
      const customEvent: Partial<CloudEvent> = {
        type: 'com.whathappen.test.event',
        data: { test: 'payload' },
      }
      await buzzClient.publish('ingest', customEvent)

      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0] as string)
      const cloudEvent = sentMessage.event

      expect(cloudEvent.specversion).toBe('1.0')
      expect(cloudEvent.type).toBeTruthy()
      expect(cloudEvent.source).toBeTruthy()
      expect(cloudEvent.id).toBeTruthy()
      expect(cloudEvent.time).toBeTruthy()
      expect(cloudEvent.datacontenttype).toBe('application/json')
    })
  })

  describe('Security Constraints', () => {
    beforeEach(async () => {
      const connectPromise = buzzClient.connect()
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as Function
      openHandler()
      await connectPromise
    })

    it('should reject x-project-token on ingest channel', async () => {
      const eventWithToken: Partial<CloudEvent> = {
        type: 'com.whathappen.test',
        'x-project-token': 'secret-token-should-not-be-here',
      }

      await expect(buzzClient.publish('ingest', eventWithToken))
        .rejects.toThrow('x-project-token is not allowed on whathappen-ingest channel')
    })

    it('should reject x-project-token on analytics channel', async () => {
      const eventWithToken: Partial<CloudEvent> = {
        type: 'com.whathappen.moe.job',
        'x-project-token': 'secret-token',
      }

      await expect(buzzClient.publish('analytics', eventWithToken))
        .rejects.toThrow('x-project-token is not allowed on whathappen-analytics channel')
    })

    it('should allow x-project-token on chat channel', async () => {
      const eventWithToken: Partial<CloudEvent> = {
        type: 'com.whathappen.chat.query',
        'x-project-token': 'allowed-on-chat-channel',
      }

      await expect(buzzClient.publish('chat', eventWithToken)).resolves.not.toThrow()
    })
  })

  describe('Event Subscription', () => {
    beforeEach(async () => {
      const connectPromise = buzzClient.connect()
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as Function
      openHandler()
      await connectPromise
    })

    it('should subscribe to ingest channel and receive events', async () => {
      const handler = jest.fn()
      await buzzClient.subscribe('ingest', handler)

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          action: 'subscribe',
          channelId: BuzzClient.CHANNELS.ingest.channelId,
        })
      )

      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')?.[1] as Function
      const incomingEvent: CloudEvent = {
        specversion: '1.0',
        type: 'com.whathappen.upload.completed',
        source: '/whathappen/hermes',
        id: 'evt-123',
        time: new Date().toISOString(),
        data: { sessionId: 'test-session' },
      }

      messageHandler(JSON.stringify({
        channelId: BuzzClient.CHANNELS.ingest.channelId,
        event: incomingEvent,
      }))

      expect(handler).toHaveBeenCalledWith(incomingEvent)
    })

    it('should unsubscribe from channel', async () => {
      const handler = jest.fn()
      await buzzClient.subscribe('chat', handler)
      mockWebSocket.send.mockClear()

      buzzClient.unsubscribe('chat', handler)

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          action: 'unsubscribe',
          channelId: BuzzClient.CHANNELS.chat.channelId,
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should throw error when publishing without connection', async () => {
      const event = createUploadCompletedEvent('session-123', 'proj-456', 'test.zip')
      
      await expect(buzzClient.publish('ingest', event))
        .rejects.toThrow('Not connected to BuzzBar')
    })

    it('should throw error for unknown channel', async () => {
      const connectPromise = buzzClient.connect()
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')?.[1] as Function
      openHandler()
      await connectPromise

      await expect(buzzClient.publish('invalid-channel' as any, {}))
        .rejects.toThrow('Unknown channel: invalid-channel')
    })
  })

  describe('Channel Configuration Validation', () => {
    it('should have correct channel IDs and configurations', () => {
      expect(BuzzClient.CHANNELS.ingest.channelId).toBe('253b4da8-6c1f-4eb1-938e-09287721f2ac')
      expect(BuzzClient.CHANNELS.analytics.channelId).toBe('48346229-5842-49ca-986b-0de3a957a4ac')
      expect(BuzzClient.CHANNELS.chat.channelId).toBe('04a3d252-20d6-4ef1-9a3e-57cb7f73350b')

      expect(BuzzClient.CHANNELS.ingest.allowProjectToken).toBe(false)
      expect(BuzzClient.CHANNELS.analytics.allowProjectToken).toBe(false)
      expect(BuzzClient.CHANNELS.chat.allowProjectToken).toBe(true)
    })
  })

  describe('CloudEvents Helper Functions', () => {
    it('should create valid UPLOAD_COMPLETED event', () => {
      const event = createUploadCompletedEvent('session-123', 'proj-456', 'chat.zip')

      expect(event.specversion).toBe('1.0')
      expect(event.type).toBe('com.whathappen.upload.completed')
      expect(event.source).toBe('/whathappen/hermes-ingest')
      expect(event.data.sessionId).toBe('session-123')
      expect(event.data.projectId).toBe('proj-456')
      expect(event.data.fileName).toBe('chat.zip')
    })

    it('should create valid CHAT_READY event', () => {
      const event = createChatReadyEvent('session-789', 'proj-123', 250)

      expect(event.type).toBe('com.whathappen.chat.ready')
      expect(event.data.messageCount).toBe(250)
      expect(event.data.status).toBe('ready_for_analysis')
    })

    it('should create valid MoE job event', () => {
      const event = createMoeJobEvent('job-456', 'transcription', 'processing', { progress: 50 })

      expect(event.type).toBe('com.whathappen.moe.transcription')
      expect(event.source).toBe('/whathappen/analytics')
      expect(event.data.jobId).toBe('job-456')
      expect(event.data.status).toBe('processing')
      expect(event.data.progress).toBe(50)
    })
  })
})
