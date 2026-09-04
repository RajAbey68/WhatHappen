/**
 * BuzzBar CloudEvents Client for WhatHappen
 * 
 * Publishes and subscribes to CloudEvents 1.0 messages on BuzzBar (Buzz.xyz).
 * Implements three private channels for agentic microservices:
 * - ingest: UPLOAD_COMPLETED / CHAT_READY_FOR_ANALYSIS events
 * - analytics: MoE job events
 * - chat: live Q&A for one fast bot
 * 
 * Security notes:
 * - nsec (Nostr secret key) read from env, never logged
 * - x-project-token only on chat channel, never on ingest/analytics
 * - All data kept in RAM during processing, wiped after completion
 */

import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'

/**
 * CloudEvents 1.0 envelope structure
 * Spec: https://github.com/cloudevents/spec/blob/v1.0/spec.md
 */
export interface CloudEvent<T = any> {
  specversion: '1.0'
  type: string
  source: string
  id: string
  time?: string
  datacontenttype?: string
  subject?: string
  data?: T
  [key: string]: any // Extension attributes
}

/**
 * BuzzBar channel configuration
 */
export interface BuzzChannelConfig {
  name: string
  channelId: string
  allowProjectToken: boolean
}

/**
 * Event handler callback
 */
export type EventHandler<T = any> = (event: CloudEvent<T>) => void | Promise<void>

/**
 * BuzzClient connection options
 */
export interface BuzzClientOptions {
  wsUrl?: string
  nsec?: string // Nostr secret key from env
  reconnectInterval?: number
  heartbeatInterval?: number
  connectionTimeout?: number
}

/**
 * BuzzBar WebSocket client with CloudEvents 1.0 support
 */
export class BuzzClient {
  private wsUrl: string
  private nsec: string | null
  private ws: WebSocket | null = null
  private reconnectInterval: number
  private heartbeatInterval: number
  private connectionTimeout: number
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private isConnected = false
  private isShuttingDown = false
  private eventHandlers: Map<string, Set<EventHandler>> = new Map()
  private subscribedChannels: Set<string> = new Set()

  // Predefined private channels (UUIDs are live on wss://theahg.communities.buzz.xyz)
  public static readonly CHANNELS: Record<string, BuzzChannelConfig> = {
    ingest: {
      name: 'whathappen-ingest',
      channelId: '253b4da8-6c1f-4eb1-938e-09287721f2ac',
      allowProjectToken: false, // No x-project-token in this topic
    },
    analytics: {
      name: 'whathappen-analytics',
      channelId: '48346229-5842-49ca-986b-0de3a957a4ac',
      allowProjectToken: false, // MoE job events only, no token
    },
    chat: {
      name: 'whathappen-chat',
      channelId: '04a3d252-20d6-4ef1-9a3e-57cb7f73350b',
      allowProjectToken: true, // Live Q&A for fast bot, Con and Housekeeping never receive token
    },
  }

  constructor(options: BuzzClientOptions = {}) {
    this.wsUrl = options.wsUrl || 'wss://theahg.communities.buzz.xyz'
    this.nsec = options.nsec || process.env.BUZZBAR_NSEC || null
    this.reconnectInterval = options.reconnectInterval || 5000
    this.heartbeatInterval = options.heartbeatInterval || 30000
    this.connectionTimeout = options.connectionTimeout || 1000

    if (!this.nsec) {
      console.warn('[BuzzClient] Warning: BUZZBAR_NSEC not set. Authentication may be required.')
    }
  }

  /**
   * Connect to BuzzBar WebSocket server
   */
  public async connect(): Promise<void> {
    if (this.ws && this.isConnected) {
      console.log('[BuzzClient] Already connected.')
      return
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`[BuzzClient] Connecting to ${this.wsUrl}...`)
        this.ws = new WebSocket(this.wsUrl)

        this.ws.on('open', () => {
          console.log('[BuzzClient] ✅ Connected to BuzzBar')
          this.isConnected = true
          this.startHeartbeat()
          resolve()
        })

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data)
        })

        this.ws.on('error', (error: Error) => {
          console.error('[BuzzClient] WebSocket error:', error.message)
          if (!this.isConnected) {
            reject(error)
          }
        })

        this.ws.on('close', () => {
          console.log('[BuzzClient] Connection closed.')
          this.isConnected = false
          this.stopHeartbeat()
          
          if (!this.isShuttingDown) {
            this.scheduleReconnect()
          }
        })

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Connection timeout'))
          }
        }, this.connectionTimeout)

      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Disconnect from BuzzBar
   */
  public disconnect(): void {
    this.isShuttingDown = true
    this.stopHeartbeat()
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.isConnected = false
    console.log('[BuzzClient] Disconnected.')
  }

  /**
   * Publish a CloudEvents 1.0 message to a channel
   */
  public async publish(channelKey: keyof typeof BuzzClient.CHANNELS, event: Partial<CloudEvent>): Promise<void> {
    const channel = BuzzClient.CHANNELS[channelKey]
    if (!channel) {
      throw new Error(`Unknown channel: ${channelKey}`)
    }

    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to BuzzBar')
    }

    // Build CloudEvents 1.0 envelope
    const cloudEvent: CloudEvent = {
      specversion: '1.0',
      type: event.type || 'com.whathappen.event',
      source: event.source || `/whathappen/${channelKey}`,
      id: event.id || uuidv4(),
      time: event.time || new Date().toISOString(),
      datacontenttype: event.datacontenttype || 'application/json',
      ...event,
    }

    // Validate: x-project-token only on chat channel
    if (cloudEvent['x-project-token'] && !channel.allowProjectToken) {
      throw new Error(`x-project-token is not allowed on ${channel.name} channel`)
    }

    const message = {
      action: 'publish',
      channelId: channel.channelId,
      event: cloudEvent,
    }

    this.ws.send(JSON.stringify(message))
    console.log(`[BuzzClient] Published to ${channel.name}:`, cloudEvent.type)
  }

  /**
   * Subscribe to events on a channel
   */
  public async subscribe(channelKey: keyof typeof BuzzClient.CHANNELS, handler: EventHandler): Promise<void> {
    const channel = BuzzClient.CHANNELS[channelKey]
    if (!channel) {
      throw new Error(`Unknown channel: ${channelKey}`)
    }

    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to BuzzBar')
    }

    // Register handler
    if (!this.eventHandlers.has(channel.channelId)) {
      this.eventHandlers.set(channel.channelId, new Set())
    }
    this.eventHandlers.get(channel.channelId)!.add(handler)

    // Send subscribe message if not already subscribed
    if (!this.subscribedChannels.has(channel.channelId)) {
      const message = {
        action: 'subscribe',
        channelId: channel.channelId,
      }
      this.ws.send(JSON.stringify(message))
      this.subscribedChannels.add(channel.channelId)
      console.log(`[BuzzClient] Subscribed to ${channel.name}`)
    }
  }

  /**
   * Unsubscribe from a channel
   */
  public unsubscribe(channelKey: keyof typeof BuzzClient.CHANNELS, handler?: EventHandler): void {
    const channel = BuzzClient.CHANNELS[channelKey]
    if (!channel) {
      throw new Error(`Unknown channel: ${channelKey}`)
    }

    const handlers = this.eventHandlers.get(channel.channelId)
    if (!handlers) return

    if (handler) {
      handlers.delete(handler)
    } else {
      handlers.clear()
    }

    // If no more handlers, unsubscribe from channel
    if (handlers.size === 0) {
      this.eventHandlers.delete(channel.channelId)
      this.subscribedChannels.delete(channel.channelId)

      if (this.ws && this.isConnected) {
        const message = {
          action: 'unsubscribe',
          channelId: channel.channelId,
        }
        this.ws.send(JSON.stringify(message))
        console.log(`[BuzzClient] Unsubscribed from ${channel.name}`)
      }
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString())

      // Handle CloudEvents from subscribed channels
      if (message.channelId && message.event) {
        const handlers = this.eventHandlers.get(message.channelId)
        if (handlers && handlers.size > 0) {
          const event: CloudEvent = message.event
          handlers.forEach(handler => {
            try {
              handler(event)
            } catch (error: any) {
              console.error('[BuzzClient] Event handler error:', error.message)
            }
          })
        }
      }

      // Handle server responses
      if (message.type === 'pong') {
        // Heartbeat acknowledgment
      } else if (message.type === 'error') {
        console.error('[BuzzClient] Server error:', message.message)
      }

    } catch (error: any) {
      console.error('[BuzzClient] Failed to parse message:', error.message)
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.ws.send(JSON.stringify({ action: 'ping' }))
      }
    }, this.heartbeatInterval)
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isShuttingDown) return

    console.log(`[BuzzClient] Reconnecting in ${this.reconnectInterval}ms...`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch(error => {
        console.error('[BuzzClient] Reconnection failed:', error.message)
      })
    }, this.reconnectInterval)
  }

  /**
   * Check if connected
   */
  public getConnectionStatus(): boolean {
    return this.isConnected
  }
}

/**
 * Helper: Create CloudEvent for UPLOAD_COMPLETED
 */
export function createUploadCompletedEvent(sessionId: string, projectId: string, fileName: string): CloudEvent {
  return {
    specversion: '1.0',
    type: 'com.whathappen.upload.completed',
    source: '/whathappen/hermes-ingest',
    id: uuidv4(),
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    data: {
      sessionId,
      projectId,
      fileName,
      status: 'completed',
    },
  }
}

/**
 * Helper: Create CloudEvent for CHAT_READY_FOR_ANALYSIS
 */
export function createChatReadyEvent(sessionId: string, projectId: string, messageCount: number): CloudEvent {
  return {
    specversion: '1.0',
    type: 'com.whathappen.chat.ready',
    source: '/whathappen/hermes-ingest',
    id: uuidv4(),
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    data: {
      sessionId,
      projectId,
      messageCount,
      status: 'ready_for_analysis',
    },
  }
}

/**
 * Helper: Create CloudEvent for MoE job event
 */
export function createMoeJobEvent(jobId: string, jobType: string, status: string, metadata?: any): CloudEvent {
  return {
    specversion: '1.0',
    type: `com.whathappen.moe.${jobType}`,
    source: '/whathappen/analytics',
    id: uuidv4(),
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    data: {
      jobId,
      jobType,
      status,
      ...metadata,
    },
  }
}
