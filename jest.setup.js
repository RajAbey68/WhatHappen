import '@testing-library/jest-dom'
import 'openai/shims/node'
import { TextEncoder, TextDecoder } from 'util'

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder
}

if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder
}

// Mock next/server for API route testing
jest.mock('next/server', () => ({
  NextRequest: class {
    constructor(url, options = {}) {

      this.url = url
      this.method = options.method || 'GET'
      this.body = options.body
      this.headers = new Map(Object.entries(options.headers || {}))
    }

    async json() {
      if (typeof this.body === 'string') {
        return JSON.parse(this.body)
      }
      if (this.body && typeof this.body === 'object') {
        return this.body
      }
      return {}
    }
  },
  NextResponse: class {
    static json(data, init = {}) {
      return {
        json: () => Promise.resolve(data),
        status: init?.status || 200,
        ...init,
      }
    }
  },
}))

// Mock next/router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      replace: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
    }
  },
}))

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} />
  },
}))

global.fetch = global.fetch || jest.fn()

// Suppress ReactDOM warnings
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})

// Polyfill scrollIntoView for JSDOM environment used by Jest
if (typeof global.Element !== 'undefined' && !global.Element.prototype.scrollIntoView) {
  global.Element.prototype.scrollIntoView = function() {}
}
