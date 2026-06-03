import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key'

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
  analysis?: {
    sentiment?: any
    keywords?: string[]
    financial?: any
    timeline?: any
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
