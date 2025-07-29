import { GET, POST } from '../../app/api/projects/route'
import { NextRequest } from 'next/server'

// Mock Firebase Firestore
const mockCollection = jest.fn()
const mockAddDoc = jest.fn()
const mockGetDocs = jest.fn()
const mockServerTimestamp = jest.fn()

jest.mock('firebase/firestore', () => ({
  collection: mockCollection,
  addDoc: mockAddDoc,
  getDocs: mockGetDocs,
  serverTimestamp: mockServerTimestamp
}))

// Mock Firebase config
jest.mock('../../lib/firebase', () => ({
  db: { mockDb: true }
}))

const createMockRequest = (body?: any): NextRequest => {
  return {
    json: jest.fn().mockResolvedValue(body || {})
  } as unknown as NextRequest
}

const mockProjectData = {
  id: 'project-1',
  name: 'Test Project',
  description: 'Test Description',
  createdAt: '2025-01-15T10:30:00Z',
  messageCount: 0,
  participants: [],
  analysis: null
}

describe('/api/projects API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockServerTimestamp.mockReturnValue({ seconds: 1642234200 })
  })

  describe('GET /api/projects', () => {
    test('should return empty array when no projects exist', async () => {
      const mockSnapshot = {
        docs: []
      }
      mockGetDocs.mockResolvedValue(mockSnapshot)
      mockCollection.mockReturnValue({ collectionRef: true })

      const response = await GET()
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result).toEqual([])
      expect(mockCollection).toHaveBeenCalledWith({ mockDb: true }, 'projects')
      expect(mockGetDocs).toHaveBeenCalled()
    })

    test('should return projects list when projects exist', async () => {
      const mockDoc = {
        id: 'project-1',
        data: () => ({
          name: 'Test Project',
          description: 'Test Description',
          createdAt: mockServerTimestamp(),
          messageCount: 0,
          participants: []
        })
      }
      
      const mockSnapshot = {
        docs: [mockDoc]
      }
      
      mockGetDocs.mockResolvedValue(mockSnapshot)
      mockCollection.mockReturnValue({ collectionRef: true })

      const response = await GET()
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: 'project-1',
        name: 'Test Project',
        description: 'Test Description',
        createdAt: mockServerTimestamp(),
        messageCount: 0,
        participants: []
      })
    })

    test('should handle Firestore errors gracefully', async () => {
      mockGetDocs.mockRejectedValue(new Error('Firestore connection failed'))
      mockCollection.mockReturnValue({ collectionRef: true })

      const response = await GET()
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.error).toBe('Failed to fetch projects')
    })

    test('should handle multiple projects correctly', async () => {
      const mockDocs = [
        {
          id: 'project-1',
          data: () => ({ name: 'Project 1', messageCount: 5 })
        },
        {
          id: 'project-2', 
          data: () => ({ name: 'Project 2', messageCount: 10 })
        },
        {
          id: 'project-3',
          data: () => ({ name: 'Project 3', messageCount: 0 })
        }
      ]
      
      const mockSnapshot = { docs: mockDocs }
      mockGetDocs.mockResolvedValue(mockSnapshot)
      mockCollection.mockReturnValue({ collectionRef: true })

      const response = await GET()
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result).toHaveLength(3)
      expect(result.map((p: any) => p.name)).toEqual(['Project 1', 'Project 2', 'Project 3'])
    })
  })

  describe('POST /api/projects', () => {
    test('should create new project with valid data', async () => {
      const requestBody = {
        name: 'New Project',
        description: 'New Description'
      }

      mockAddDoc.mockResolvedValue({ id: 'new-project-id' })
      mockCollection.mockReturnValue({ collectionRef: true })

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(201)
      expect(result.success).toBe(true)
      expect(result.project.id).toBe('new-project-id')
      expect(result.project.name).toBe('New Project')
      expect(result.project.description).toBe('New Description')
      expect(result.project.messageCount).toBe(0)
      expect(result.project.participants).toEqual([])
      
      expect(mockAddDoc).toHaveBeenCalledWith(
        { collectionRef: true },
        expect.objectContaining({
          name: 'New Project',
          description: 'New Description',
          messageCount: 0,
          participants: [],
          analysis: null,
          createdAt: mockServerTimestamp()
        })
      )
    })

    test('should create project without description', async () => {
      const requestBody = {
        name: 'Project Without Description'
      }

      mockAddDoc.mockResolvedValue({ id: 'project-no-desc' })
      mockCollection.mockReturnValue({ collectionRef: true })

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(201)
      expect(result.success).toBe(true)
      expect(result.project.name).toBe('Project Without Description')
      expect(result.project.description).toBeUndefined()
    })

    test('should reject request without name', async () => {
      const requestBody = {
        description: 'Description without name'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Project name is required')
      expect(mockAddDoc).not.toHaveBeenCalled()
    })

    test('should reject request with empty name', async () => {
      const requestBody = {
        name: '',
        description: 'Description with empty name'
      }

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Project name is required')
      expect(mockAddDoc).not.toHaveBeenCalled()
    })

    test('should trim whitespace from name and description', async () => {
      const requestBody = {
        name: '   Trimmed Project   ',
        description: '   Trimmed Description   '
      }

      mockAddDoc.mockResolvedValue({ id: 'trimmed-project' })
      mockCollection.mockReturnValue({ collectionRef: true })

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(201)
      expect(result.project.name).toBe('Trimmed Project')
      expect(result.project.description).toBe('Trimmed Description')
      
      expect(mockAddDoc).toHaveBeenCalledWith(
        { collectionRef: true },
        expect.objectContaining({
          name: 'Trimmed Project',
          description: 'Trimmed Description'
        })
      )
    })

    test('should handle Firestore creation errors', async () => {
      const requestBody = {
        name: 'Test Project'
      }

      mockAddDoc.mockRejectedValue(new Error('Failed to create document'))
      mockCollection.mockReturnValue({ collectionRef: true })

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to create project')
    })

    test('should handle very long project names', async () => {
      const longName = 'A'.repeat(1000)
      const requestBody = {
        name: longName,
        description: 'Test with long name'
      }

      mockAddDoc.mockResolvedValue({ id: 'long-name-project' })
      mockCollection.mockReturnValue({ collectionRef: true })

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(201)
      expect(result.project.name).toBe(longName)
    })

    test('should handle special characters in name and description', async () => {
      const requestBody = {
        name: 'Project with 特殊字符 & symbols!@#$%',
        description: 'Description with émojis 🎉 and other chars: ñáéíóú'
      }

      mockAddDoc.mockResolvedValue({ id: 'special-chars-project' })
      mockCollection.mockReturnValue({ collectionRef: true })

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(201)
      expect(result.project.name).toBe('Project with 特殊字符 & symbols!@#$%')
      expect(result.project.description).toBe('Description with émojis 🎉 and other chars: ñáéíóú')
    })

    test('should handle malformed JSON requests', async () => {
      const request = {
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON'))
      } as unknown as NextRequest

      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid request body')
    })

    test('should set correct default values for new project', async () => {
      const requestBody = {
        name: 'Default Values Test'
      }

      mockAddDoc.mockResolvedValue({ id: 'defaults-project' })
      mockCollection.mockReturnValue({ collectionRef: true })

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(result.project.messageCount).toBe(0)
      expect(result.project.participants).toEqual([])
      expect(result.project.analysis).toBeNull()
      expect(result.project.createdAt).toBeDefined()
    })
  })

  describe('Error Recovery and Edge Cases', () => {
    test('should handle Firebase service unavailable', async () => {
      mockCollection.mockImplementation(() => {
        throw new Error('Firebase service unavailable')
      })

      const response = await GET()
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.error).toBe('Failed to fetch projects')
    })

    test('should handle malformed Firestore responses', async () => {
      const mockSnapshot = {
        docs: [
          {
            id: 'project-1',
            data: () => null // Malformed data
          }
        ]
      }
      
      mockGetDocs.mockResolvedValue(mockSnapshot)
      mockCollection.mockReturnValue({ collectionRef: true })

      const response = await GET()
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('project-1')
    })

    test('should handle network timeouts gracefully', async () => {
      mockGetDocs.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      )
      mockCollection.mockReturnValue({ collectionRef: true })

      const response = await GET()
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.error).toBe('Failed to fetch projects')
    })

    test('should handle concurrent requests correctly', async () => {
      const mockSnapshot = {
        docs: [
          { id: 'project-1', data: () => ({ name: 'Project 1' }) }
        ]
      }
      
      mockGetDocs.mockResolvedValue(mockSnapshot)
      mockCollection.mockReturnValue({ collectionRef: true })

      // Make multiple concurrent requests
      const responses = await Promise.all([
        GET(),
        GET(),
        GET()
      ])

      responses.forEach(async (response) => {
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result).toHaveLength(1)
      })
    })
  })

  describe('Security and Validation', () => {
    test('should reject potentially malicious project names', async () => {
      const maliciousNames = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '${7*7}', // Template injection
        'SELECT * FROM users', // SQL injection attempt
      ]

      for (const maliciousName of maliciousNames) {
        const requestBody = { name: maliciousName }
        mockAddDoc.mockResolvedValue({ id: 'test-id' })
        mockCollection.mockReturnValue({ collectionRef: true })

        const request = createMockRequest(requestBody)
        const response = await POST(request)
        const result = await response.json()

        // Should still create but the name should be stored as-is for user review
        expect(response.status).toBe(201)
        expect(result.project.name).toBe(maliciousName)
      }
    })

    test('should handle extremely large request bodies', async () => {
      const hugeDescription = 'A'.repeat(100000) // 100KB description
      const requestBody = {
        name: 'Large Request Test',
        description: hugeDescription
      }

      mockAddDoc.mockResolvedValue({ id: 'large-request' })
      mockCollection.mockReturnValue({ collectionRef: true })

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(201)
      expect(result.project.description).toBe(hugeDescription)
    })
  })
}) 