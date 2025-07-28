import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  Timestamp,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore'
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject,
  listAll
} from 'firebase/storage'
import { db, storage } from './firebase'

export interface FirebaseMessage {
  id?: string
  timestamp: Date
  sender: string
  message: string
  messageType: 'text' | 'media' | 'system'
  sentiment?: {
    score: number
    comparative: number
    tokens: string[]
    words: string[]
    positive: string[]
    negative: string[]
  }
  chatId: string
  fileId: string
}

export interface FirebaseChatAnalysis {
  id?: string
  fileId: string
  fileName: string
  fileSize: number
  processedAt: Date
  totalMessages: number
  participants: Array<{ name: string }>
  analysis: any
  sentimentAnalysis: any
  timeAnalysis: any
  wordFrequency: any
}

export class FirebaseService {
  // Messages Collection
  private static readonly MESSAGES_COLLECTION = 'messages'
  private static readonly CHATS_COLLECTION = 'chats'
  private static readonly FILES_COLLECTION = 'files'

  /**
   * Store messages in Firestore
   */
  static async storeMessages(messages: FirebaseMessage[]): Promise<string[]> {
    try {
      const messageIds: string[] = []
      const messagesRef = collection(db, this.MESSAGES_COLLECTION)

      for (const message of messages) {
        const docRef = await addDoc(messagesRef, {
          ...message,
          timestamp: Timestamp.fromDate(message.timestamp)
        })
        messageIds.push(docRef.id)
      }

      return messageIds
    } catch (error) {
      console.error('Error storing messages:', error)
      throw new Error('Failed to store messages in Firebase')
    }
  }

  /**
   * Store chat analysis data
   */
  static async storeChatAnalysis(analysis: FirebaseChatAnalysis): Promise<string> {
    try {
      const chatsRef = collection(db, this.CHATS_COLLECTION)
      const docRef = await addDoc(chatsRef, {
        ...analysis,
        processedAt: Timestamp.fromDate(analysis.processedAt)
      })
      return docRef.id
    } catch (error) {
      console.error('Error storing chat analysis:', error)
      throw new Error('Failed to store chat analysis in Firebase')
    }
  }

  /**
   * Store file metadata
   */
  static async storeFileMetadata(fileId: string, metadata: any): Promise<void> {
    try {
      const fileRef = doc(db, this.FILES_COLLECTION, fileId)
      await setDoc(fileRef, {
        ...metadata,
        uploadedAt: Timestamp.now()
      })
    } catch (error) {
      console.error('Error storing file metadata:', error)
      throw new Error('Failed to store file metadata in Firebase')
    }
  }

  /**
   * Retrieve messages by chat/file ID
   */
  static async getMessagesByChatId(chatId: string, limitCount = 1000): Promise<FirebaseMessage[]> {
    try {
      const messagesRef = collection(db, this.MESSAGES_COLLECTION)
      const q = query(
        messagesRef,
        where('chatId', '==', chatId),
        orderBy('timestamp', 'asc'),
        limit(limitCount)
      )
      
      const querySnapshot = await getDocs(q)
      const messages: FirebaseMessage[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        messages.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp.toDate()
        } as FirebaseMessage)
      })

      return messages
    } catch (error) {
      console.error('Error retrieving messages:', error)
      throw new Error('Failed to retrieve messages from Firebase')
    }
  }

  /**
   * Search messages by content
   */
  static async searchMessages(searchTerm: string, chatId?: string): Promise<FirebaseMessage[]> {
    try {
      const messagesRef = collection(db, this.MESSAGES_COLLECTION)
      let q = query(messagesRef, orderBy('timestamp', 'desc'), limit(100))

      if (chatId) {
        q = query(messagesRef, where('chatId', '==', chatId), orderBy('timestamp', 'desc'), limit(100))
      }

      const querySnapshot = await getDocs(q)
      const messages: FirebaseMessage[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        const message = {
          id: doc.id,
          ...data,
          timestamp: data.timestamp.toDate()
        } as FirebaseMessage

        // Client-side filtering for text search
        if (message.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
            message.sender.toLowerCase().includes(searchTerm.toLowerCase())) {
          messages.push(message)
        }
      })

      return messages
    } catch (error) {
      console.error('Error searching messages:', error)
      throw new Error('Failed to search messages in Firebase')
    }
  }

  /**
   * Get chat analysis by file ID
   */
  static async getChatAnalysis(fileId: string): Promise<FirebaseChatAnalysis | null> {
    try {
      const chatsRef = collection(db, this.CHATS_COLLECTION)
      const q = query(chatsRef, where('fileId', '==', fileId), limit(1))
      
      const querySnapshot = await getDocs(q)
      if (querySnapshot.empty) {
        return null
      }

      const doc = querySnapshot.docs[0]
      const data = doc.data()
      
      return {
        id: doc.id,
        ...data,
        processedAt: data.processedAt.toDate()
      } as FirebaseChatAnalysis
    } catch (error) {
      console.error('Error retrieving chat analysis:', error)
      throw new Error('Failed to retrieve chat analysis from Firebase')
    }
  }

  /**
   * Upload file to Firebase Storage
   */
  static async uploadFile(file: File, fileName: string): Promise<string> {
    try {
      const fileRef = ref(storage, `uploads/${fileName}`)
      const snapshot = await uploadBytes(fileRef, file)
      const downloadURL = await getDownloadURL(snapshot.ref)
      return downloadURL
    } catch (error) {
      console.error('Error uploading file:', error)
      throw new Error('Failed to upload file to Firebase Storage')
    }
  }

  /**
   * Delete file from Firebase Storage
   */
  static async deleteFile(fileName: string): Promise<void> {
    try {
      const fileRef = ref(storage, `uploads/${fileName}`)
      await deleteObject(fileRef)
    } catch (error) {
      console.error('Error deleting file:', error)
      throw new Error('Failed to delete file from Firebase Storage')
    }
  }

  /**
   * Get all processed chats
   */
  static async getAllChats(): Promise<FirebaseChatAnalysis[]> {
    try {
      const chatsRef = collection(db, this.CHATS_COLLECTION)
      const q = query(chatsRef, orderBy('processedAt', 'desc'))
      
      const querySnapshot = await getDocs(q)
      const chats: FirebaseChatAnalysis[] = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        chats.push({
          id: doc.id,
          ...data,
          processedAt: data.processedAt.toDate()
        } as FirebaseChatAnalysis)
      })

      return chats
    } catch (error) {
      console.error('Error retrieving all chats:', error)
      throw new Error('Failed to retrieve chats from Firebase')
    }
  }

  /**
   * Delete chat and associated messages
   */
  static async deleteChat(chatId: string): Promise<void> {
    try {
      // Delete chat analysis
      await deleteDoc(doc(db, this.CHATS_COLLECTION, chatId))

      // Delete associated messages
      const messagesRef = collection(db, this.MESSAGES_COLLECTION)
      const q = query(messagesRef, where('chatId', '==', chatId))
      const querySnapshot = await getDocs(q)

      const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref))
      await Promise.all(deletePromises)
    } catch (error) {
      console.error('Error deleting chat:', error)
      throw new Error('Failed to delete chat from Firebase')
    }
  }

  /**
   * Update chat analysis
   */
  static async updateChatAnalysis(chatId: string, updates: Partial<FirebaseChatAnalysis>): Promise<void> {
    try {
      const chatRef = doc(db, this.CHATS_COLLECTION, chatId)
      await updateDoc(chatRef, updates)
    } catch (error) {
      console.error('Error updating chat analysis:', error)
      throw new Error('Failed to update chat analysis in Firebase')
    }
  }
} 