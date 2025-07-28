import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getAuth } from 'firebase/auth'

// Firebase configuration with safe defaults
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-project.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo-project.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abcdef123456"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Firebase services
export const db = getFirestore(app)
export const storage = getStorage(app)
export const auth = getAuth(app)

// TypeScript interfaces
export interface Project {
  id: string
  name: string
  description?: string
  createdAt: any
  updatedAt: any
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
  timestamp: any
  messageIndex: number
}

export interface AIConversation {
  id: string
  projectId: string
  messages: {
    role: 'user' | 'assistant'
    content: string
    timestamp: string
  }[]
  createdAt: any
} 