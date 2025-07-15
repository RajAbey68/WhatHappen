// Jest setup file
process.env.NODE_ENV = 'test';
process.env.PORT = 3002;
process.env.FRONTEND_URL = 'http://localhost:3000';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};