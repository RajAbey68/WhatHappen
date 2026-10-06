import { BuzzClient, CloudEvent } from '../BuzzClient'
import { generateWithFallback } from '../../llm'

export class GrokBotLive {
  private buzzClient: BuzzClient
  private isRunning = false

  constructor(options?: import('../BuzzClient').BuzzClientOptions) {
    this.buzzClient = new BuzzClient(options)
  }

  public async start(): Promise<void> {
    await this.buzzClient.connect()
    
    // Subscribe to chat channel
    await this.buzzClient.subscribe('chat', this.handleChatMessage.bind(this))
    this.isRunning = true
    console.log('[GrokBotLive] Started and listening to chat channel.')
  }

  public stop(): void {
    if (this.isRunning) {
      this.buzzClient.disconnect()
      this.isRunning = false
      console.log('[GrokBotLive] Stopped.')
    }
  }

  private async handleChatMessage(event: CloudEvent): Promise<void> {
    // Only process incoming chat messages, ignoring our own replies
    if (event.type !== 'com.whathappen.chat.message') return
    if (event.source === '/whathappen/grokbot') return

    const messageContent = event.data?.message
    if (!messageContent) return

    console.log(`[GrokBotLive] Received message (ID: ${event.id})`)

    try {
      // AbortController to enforce the < 1.5s latency requirement if needed
      const controller = new AbortController()
      const timeoutTimer = setTimeout(() => controller.abort(), 1500)

      const response = await generateWithFallback([
        { 
          role: 'system', 
          content: 'You are GrokBot, an ultra-fast real-time context agent for WhatHappen. Respond concisely and accurately.' 
        },
        { 
          role: 'user', 
          content: messageContent 
        }
      ], {
        temperature: 0.7,
      }, {
        signal: controller.signal
      })

      clearTimeout(timeoutTimer)

      // Publish the reply back to the chat channel
      await this.buzzClient.publish('chat', {
        type: 'com.whathappen.chat.reply',
        source: '/whathappen/grokbot',
        data: {
          replyTo: event.id,
          message: response.content,
          model: response.model
        }
      })
      console.log(`[GrokBotLive] Reply sent successfully for event ${event.id}`)
      
    } catch (error: any) {
      console.error('[GrokBotLive] Error generating response:', error.message)
    }
  }
}
