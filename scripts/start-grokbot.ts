import { GrokBotLive } from '../lib/swarm/experts/GrokBotLive'

async function main() {
  const grokBot = new GrokBotLive()
  
  // Handle graceful shutdown
  const shutdown = () => {
    console.log('\n[Process] Shutting down GrokBotLive...')
    grokBot.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await grokBot.start()
}

main().catch(error => {
  console.error('[Process] Failed to start GrokBotLive:', error)
  process.exit(1)
})
