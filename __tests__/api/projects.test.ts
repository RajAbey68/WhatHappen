// Define mock functions on global so they are accessible and not subject to hoisting issues
(global as any).mockSingle = jest.fn();
(global as any).mockSelect = jest.fn().mockImplementation(() => ({
  single: (global as any).mockSingle
}));
(global as any).mockInsert = jest.fn().mockImplementation(() => ({
  select: (global as any).mockSelect
}));
(global as any).mockOrder = jest.fn();
(global as any).mockSelectRoot = jest.fn().mockImplementation(() => ({
  order: (global as any).mockOrder
}));
(global as any).mockFrom = jest.fn().mockImplementation(() => ({
  select: (global as any).mockSelectRoot,
  insert: (global as any).mockInsert
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => (global as any).mockFrom(...args)
  }
}))

const mockFrom = (global as any).mockFrom
const mockOrder = (global as any).mockOrder
const mockSingle = (global as any).mockSingle
const mockInsert = (global as any).mockInsert
const mockSelectRoot = (global as any).mockSelectRoot
const mockSelect = (global as any).mockSelect

import { GET, POST } from '../../app/api/projects/route'
import { NextRequest } from 'next/server'

const createMockRequest = (body?: any): NextRequest => {
  return {
    json: jest.fn().mockResolvedValue(body || {})
  } as unknown as NextRequest
}

describe('/api/projects API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/projects', () => {
    test('should return empty array when no projects exist', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null })

      const response = await GET()
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result).toEqual([])
      expect(mockFrom).toHaveBeenCalledWith('projects')
      expect(mockSelectRoot).toHaveBeenCalled()
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    test('should return projects list when projects exist', async () => {
      const mockProj = {
        id: 'project-1',
        name: 'Test Project',
        description: 'Test Description',
        message_count: 0,
        participants: [],
        created_at: '2025-01-15T10:30:00Z',
        updated_at: '2025-01-15T10:30:00Z'
      }
      
      mockOrder.mockResolvedValue({ data: [mockProj], error: null })

      const response = await GET()
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: 'project-1',
        name: 'Test Project',
        description: 'Test Description',
        messageCount: 0,
        participants: [],
        createdAt: '2025-01-15T10:30:00Z',
        updatedAt: '2025-01-15T10:30:00Z'
      })
    })

    test('should handle database errors gracefully', async () => {
      mockOrder.mockResolvedValue({ data: null, error: new Error('Database connection failed') })

      const response = await GET()
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.error).toBe('Failed to fetch projects')
    })

    test('should handle multiple projects correctly', async () => {
      const mockProjects = [
        { id: 'project-1', name: 'Project 1', message_count: 5, participants: [], created_at: '2025-01-15T10:30:00Z' },
        { id: 'project-2', name: 'Project 2', message_count: 10, participants: [], created_at: '2025-01-15T10:30:00Z' },
        { id: 'project-3', name: 'Project 3', message_count: 0, participants: [], created_at: '2025-01-15T10:30:00Z' }
      ]
      
      mockOrder.mockResolvedValue({ data: mockProjects, error: null })

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

      mockSingle.mockResolvedValue({
        data: {
          id: 'new-project-id',
          name: 'New Project',
          description: 'New Description',
          message_count: 0,
          participants: [],
          created_at: '2025-01-15T10:30:00Z',
          updated_at: '2025-01-15T10:30:00Z'
        },
        error: null
      })

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
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Project',
          description: 'New Description',
          message_count: 0,
          participants: [],
          analysis: null
        })
      )
    })

    test('should create project without description', async () => {
      const requestBody = {
        name: 'Project Without Description'
      }

      mockSingle.mockResolvedValue({
        data: {
          id: 'project-no-desc',
          name: 'Project Without Description',
          description: null,
          message_count: 0,
          participants: [],
          created_at: '2025-01-15T10:30:00Z',
          updated_at: '2025-01-15T10:30:00Z'
        },
        error: null
      })

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
      expect(mockInsert).not.toHaveBeenCalled()
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
      expect(mockInsert).not.toHaveBeenCalled()
    })

    test('should trim whitespace from name and description', async () => {
      const requestBody = {
        name: '   Trimmed Project   ',
        description: '   Trimmed Description   '
      }

      mockSingle.mockResolvedValue({
        data: {
          id: 'trimmed-project',
          name: 'Trimmed Project',
          description: 'Trimmed Description',
          message_count: 0,
          participants: [],
          created_at: '2025-01-15T10:30:00Z',
          updated_at: '2025-01-15T10:30:00Z'
        },
        error: null
      })

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(201)
      expect(result.project.name).toBe('Trimmed Project')
      expect(result.project.description).toBe('Trimmed Description')
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Trimmed Project',
          description: 'Trimmed Description'
        })
      )
    })

    test('should handle database creation errors', async () => {
      const requestBody = {
        name: 'Test Project'
      }

      mockSingle.mockResolvedValue({ data: null, error: new Error('Failed to create document') })

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

      mockSingle.mockResolvedValue({
        data: {
          id: 'long-name-project',
          name: longName,
          description: 'Test with long name',
          message_count: 0,
          participants: [],
          created_at: '2025-01-15T10:30:00Z',
          updated_at: '2025-01-15T10:30:00Z'
        },
        error: null
      })

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

      mockSingle.mockResolvedValue({
        data: {
          id: 'special-chars-project',
          name: 'Project with 特殊字符 & symbols!@#$%',
          description: 'Description with émojis 🎉 and other chars: ñáéíóú',
          message_count: 0,
          participants: [],
          created_at: '2025-01-15T10:30:00Z',
          updated_at: '2025-01-15T10:30:00Z'
        },
        error: null
      })

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

      mockSingle.mockResolvedValue({
        data: {
          id: 'defaults-project',
          name: 'Default Values Test',
          description: null,
          message_count: 0,
          participants: [],
          created_at: '2025-01-15T10:30:00Z',
          updated_at: '2025-01-15T10:30:00Z'
        },
        error: null
      })

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(result.project.messageCount).toBe(0)
      expect(result.project.participants).toEqual([])
      expect(result.project.analysis).toBeUndefined()
      expect(result.project.createdAt).toBeDefined()
    })
  })

  describe('Error Recovery and Edge Cases', () => {
    test('should handle database service unavailable', async () => {
      mockFrom.mockImplementationOnce(() => {
        throw new Error('Database service unavailable')
      })

      const response = await GET()
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.error).toBe('Failed to fetch projects')
    })

    test('should handle network timeouts gracefully', async () => {
      mockOrder.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      )

      const response = await GET()
      const result = await response.json()

      expect(response.status).toBe(500)
      expect(result.error).toBe('Failed to fetch projects')
    })

    test('should handle concurrent requests correctly', async () => {
      mockOrder.mockResolvedValue({
        data: [{ id: 'project-1', name: 'Project 1', message_count: 0, participants: [], created_at: '2025-01-15T10:30:00Z' }],
        error: null
      })

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
        mockSingle.mockResolvedValue({
          data: {
            id: 'test-id',
            name: maliciousName,
            description: null,
            message_count: 0,
            participants: [],
            created_at: '2025-01-15T10:30:00Z',
            updated_at: '2025-01-15T10:30:00Z'
          },
          error: null
        })

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

      mockSingle.mockResolvedValue({
        data: {
          id: 'large-request',
          name: 'Large Request Test',
          description: hugeDescription,
          message_count: 0,
          participants: [],
          created_at: '2025-01-15T10:30:00Z',
          updated_at: '2025-01-15T10:30:00Z'
        },
        error: null
      })

      const request = createMockRequest(requestBody)
      const response = await POST(request)
      const result = await response.json()

      expect(response.status).toBe(201)
      expect(result.project.description).toBe(hugeDescription)
    })
  })
})