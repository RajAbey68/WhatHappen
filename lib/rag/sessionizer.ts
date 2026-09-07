export interface RawChatMessage {
  id?: string
  sender: string
  message: string
  timestamp: string
}

export interface SessionWindow {
  sessionId: string
  startTime: string
  endTime: string
  participants: string[]
  messageCount: number
  messageIds: string[]
  formattedContent: string
  messages: RawChatMessage[]
}

/**
 * Sessionize WhatsApp messages into temporal conversation windows.
 * 
 * Rules:
 * 1. Gap threshold: A gap of >45 minutes between messages starts a new session.
 * 2. Window capacity: Maximum 35 messages per session chunk.
 * 3. Overlap: 8-message overlap between consecutive windows in the same active conversation
 *    to preserve causality and acknowledgment context ("ok", "sent", "done").
 * 4. Contextual prefix: Every window is prefixed with metadata for optimal dense embedding.
 */
export function sessionizeMessages(
  messages: RawChatMessage[],
  options: {
    gapThresholdMinutes?: number
    maxMessagesPerWindow?: number
    overlapMessages?: number
  } = {}
): SessionWindow[] {
  const gapMs = (options.gapThresholdMinutes ?? 45) * 60 * 1000
  const maxWindow = options.maxMessagesPerWindow ?? 35
  const overlap = options.overlapMessages ?? 8

  if (!messages || messages.length === 0) return []

  // Ensure chronological order
  const sorted = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const sessions: SessionWindow[] = []
  let currentGroup: RawChatMessage[] = []

  for (let i = 0; i < sorted.length; i++) {
    const msg = sorted[i]
    if (currentGroup.length === 0) {
      currentGroup.push(msg)
      continue
    }

    const prevMsg = currentGroup[currentGroup.length - 1]
    const timeDiff = new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()

    // If gap exceeds threshold or window is at capacity, commit session
    if (timeDiff > gapMs || currentGroup.length >= maxWindow) {
      createAndPushSession(sessions, currentGroup)

      if (timeDiff <= gapMs && currentGroup.length >= maxWindow) {
        // Continuous discussion: carry forward overlap messages
        const overlapSlice = currentGroup.slice(-overlap)
        currentGroup = [...overlapSlice, msg]
      } else {
        // Natural break: start fresh session
        currentGroup = [msg]
      }
    } else {
      currentGroup.push(msg)
    }
  }

  if (currentGroup.length > 0) {
    createAndPushSession(sessions, currentGroup)
  }

  return sessions
}

function createAndPushSession(sessions: SessionWindow[], msgs: RawChatMessage[]) {
  if (msgs.length === 0) return

  const startTime = msgs[0].timestamp
  const endTime = msgs[msgs.length - 1].timestamp
  const participants = Array.from(new Set(msgs.map(m => m.sender).filter(Boolean)))
  const messageIds = msgs.map(m => m.id || `${m.timestamp}_${m.sender}`)

  const sessionId = `sess_${sessions.length + 1}_${new Date(startTime).toISOString().slice(0, 10)}`

  // Format contextual prefix for dense embeddings & LLM ingestion
  const header = `=== SESSION #${sessions.length + 1} | ${startTime} to ${endTime} | Participants: ${participants.join(', ')} ===\n`
  const body = msgs
    .map(m => `[${m.timestamp}] ${m.sender}: ${m.message}`)
    .join('\n')

  sessions.push({
    sessionId,
    startTime,
    endTime,
    participants,
    messageCount: msgs.length,
    messageIds,
    formattedContent: header + body,
    messages: msgs
  })
}
