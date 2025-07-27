import '@testing-library/jest-dom'
import React from 'react'

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R
      toHaveAttribute(attribute: string, value?: string): R
      toHaveClass(className: string): R
      toHaveFocus(): R
    }
  }
}

// Mock Next.js globals - define them without checking existence first
class MockResponse {
  constructor(body?: any, init?: ResponseInit) {
    this.status = init?.status || 200
    this.statusText = init?.statusText || 'OK'
    this.headers = new Headers(init?.headers)
    this.body = body
  }
  
  status: number
  statusText: string
  headers: Headers
  body: any

  static json(body: any, init?: ResponseInit) {
    return new MockResponse(JSON.stringify(body), init)
  }

  async json() {
    return typeof this.body === 'string' ? JSON.parse(this.body) : this.body
  }

  async text() {
    return typeof this.body === 'string' ? this.body : JSON.stringify(this.body)
  }
}

class MockRequest {
  constructor(input: string | Request, init?: RequestInit) {
    this.url = typeof input === 'string' ? input : input.url
    this.method = init?.method || 'GET'
    this.headers = new Headers(init?.headers)
    this.body = init?.body
  }

  url: string
  method: string
  headers: Headers
  body: any

  async json() {
    return typeof this.body === 'string' ? JSON.parse(this.body) : this.body
  }

  async formData() {
    return this.body
  }
}

class MockHeaders {
  private _headers: Record<string, string> = {}

  constructor(init?: HeadersInit) {
    if (init) {
      if (init instanceof Headers) {
        init.forEach((value, key) => this.set(key, value))
      } else if (Array.isArray(init)) {
        init.forEach(([key, value]) => this.set(key, value))
      } else {
        Object.entries(init).forEach(([key, value]) => this.set(key, value))
      }
    }
  }

  append(name: string, value: string) {
    this._headers[name.toLowerCase()] = value
  }

  delete(name: string) {
    delete this._headers[name.toLowerCase()]
  }

  get(name: string) {
    return this._headers[name.toLowerCase()] || null
  }

  has(name: string) {
    return name.toLowerCase() in this._headers
  }

  set(name: string, value: string) {
    this._headers[name.toLowerCase()] = value
  }

  forEach(callback: (value: string, key: string) => void) {
    Object.entries(this._headers).forEach(([key, value]) => callback(value, key))
  }
}

// File mock for testing
class MockFile {
  constructor(
    public chunks: (string | ArrayBuffer | ArrayBufferView)[],
    public name: string,
    public options?: FilePropertyBag
  ) {
    this.size = chunks.reduce((size, chunk) => {
      if (typeof chunk === 'string') return size + chunk.length
      if (chunk instanceof ArrayBuffer) return size + chunk.byteLength
      return size + chunk.byteLength
    }, 0)
    this.type = options?.type || ''
    this.lastModified = options?.lastModified || Date.now()
  }

  size: number
  type: string
  lastModified: number

  async arrayBuffer(): Promise<ArrayBuffer> {
    const text = this.chunks.join('')
    const encoder = new TextEncoder()
    return encoder.encode(text).buffer
  }

  async text(): Promise<string> {
    return this.chunks.join('')
  }

  stream(): ReadableStream {
    const chunks = this.chunks
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(chunks.join('')))
        controller.close()
      }
    })
  }

  slice(): Blob {
    return this as any
  }
}

// Assign to global
global.Response = MockResponse as any
global.Request = MockRequest as any
global.Headers = MockHeaders as any
global.File = MockFile as any

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock OpenAI
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'Mocked AI response'
              }
            }]
          })
        }
      }
    }))
  }
})

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Moon: () => React.createElement('div', { 'data-testid': 'moon-icon' }),
  Sun: () => React.createElement('div', { 'data-testid': 'sun-icon' }),
  Upload: () => React.createElement('div', { 'data-testid': 'upload-icon' }),
  BarChart3: () => React.createElement('div', { 'data-testid': 'chart-icon' }),
  MessageCircle: () => React.createElement('div', { 'data-testid': 'message-icon' }),
  Database: () => React.createElement('div', { 'data-testid': 'database-icon' }),
  Settings: () => React.createElement('div', { 'data-testid': 'settings-icon' }),
  Brain: () => React.createElement('div', { 'data-testid': 'brain-icon' }),
  Zap: () => React.createElement('div', { 'data-testid': 'zap-icon' }),
  TrendingUp: () => React.createElement('div', { 'data-testid': 'trending-icon' }),
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
}) 