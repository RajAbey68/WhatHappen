import '@testing-library/jest-dom'

// Polyfill jsdom's Blob/File with missing async methods
// jsdom 26.x does not implement Blob.arrayBuffer(), Blob.text(), or Blob.stream()
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsArrayBuffer(this)
    })
  }
}
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsText(this)
    })
  }
}
if (typeof Blob !== 'undefined' && !Blob.prototype.stream) {
  Blob.prototype.stream = function () {
    const blob = this
    return new ReadableStream({
      async start(controller) {
        const text = await blob.text()
        controller.enqueue(new TextEncoder().encode(text))
        controller.close()
      },
    })
  }
}

// Polyfill crypto and TextEncoder/TextDecoder in Jest/jsdom environment
const nodeCrypto = require('crypto')
if (typeof global.crypto === 'undefined' || !global.crypto.subtle) {
  global.crypto = nodeCrypto.webcrypto || nodeCrypto
}
if (typeof window !== 'undefined' && (!window.crypto || !window.crypto.subtle)) {
  try {
    Object.defineProperty(window, 'crypto', {
      value: nodeCrypto.webcrypto || nodeCrypto,
      writable: true,
      configurable: true,
    })
  } catch {
    window.crypto = nodeCrypto.webcrypto || nodeCrypto
  }
}
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = require('util').TextDecoder
}

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
      return { status: 200, json: () => Promise.resolve(data), ...init }
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
