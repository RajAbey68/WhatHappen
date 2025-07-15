module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.js'],
  collectCoverageFrom: [
    'server.js',
    '**/*.js',
    '!**/node_modules/**',
    '!**/client/**',
    '!**/coverage/**',
    '!**/logs/**',
    '!**/uploads/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 10000,
  verbose: true
};