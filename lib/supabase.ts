import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// RAJ-748: fail loudly on missing configuration instead of silently falling back
// to placeholder credentials, which masks misconfiguration until runtime.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Standardized types matching previous schema for zero-friction client integration
export interface Project {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  messageCount: number
  participants: string[]
  dateRange?: {
    start: string
    end: string
  }
  /** @deprecated Moved to the new Swarm architecture via `agents` and `project_agents` tables. */
  agentConfig?: {
    expertise: string
    jurisdiction: string
    regulator: string
  }
  analysis?: {
    sentiment?: any
    keywords?: string[]
    financial?: any
    timeline?: any
    averageResponseTimes?: Record<string, number>
  }
}

export interface ChatMessage {
  id: string
  projectId: string
  sender: string
  content: string
  timestamp: string
  messageIndex?: number
}

export interface AIConversation {
  id: string
  projectId: string
  messages: {
    role: 'user' | 'assistant'
    content: string
    timestamp: string
  }[]
  createdAt: string
}
