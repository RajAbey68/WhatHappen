const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  // RAJ-782: vendor/asimov-ingest is a built dependency, not app source. Its own
  // suite runs under vitest in the package repo — jest must not try to execute
  // vitest files it cannot understand.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/vendor/'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '\!src/**/*.d.ts',
    '\!src/**/*.stories.{js,jsx,ts,tsx}',
    '\!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
