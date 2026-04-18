import '@testing-library/jest-dom'

// Mock next/server for API route testing
jest.mock('next/server', () => ({
  NextRequest: class {
    constructor(url, options) {
      this.url = url
      this.method = options?.method || 'GET'
      this.body = options?.body
      this.headers = new Map(Object.entries(options?.headers || {}))
    }
  },
  NextResponse: class {
    static json(data, init) {
      return { json: () => Promise.resolve(data), ...init }
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
