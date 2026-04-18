# WhatHappen Jest Test Suite

This directory contains the comprehensive test suite for the WhatHappen application, a WhatsApp chat analysis tool built with Next.js.

## Test Structure

```
src/__tests__/
├── components/
│   └── FileUploader.test.tsx          # File upload component tests
├── api/
│   ├── process-file.test.ts           # Chat file processing API tests
│   └── ai-search.test.ts              # AI search API tests
├── utils/
│   └── utils.test.ts                  # Utility function tests
└── integration/
    └── chat-analysis-flow.test.ts     # End-to-end workflow tests
```

## Test Coverage

### Components (FileUploader)
- File upload area rendering
- Single file acceptance
- Multiple file type support (.txt, .csv, .pdf, .docx, .json)
- Loading state management
- Error handling for invalid file types
- File size validation
- File name display
- Multiple file uploads
- File input reset functionality
- Upload progress feedback
- Completion handling
- Empty file prevention

**Total: 12+ test cases | ~90% coverage**

### API Routes

#### Process File API (`/api/process-file`)
- Handles missing file validation
- Rejects unsupported formats
- Processes .txt files with WhatsApp chat format
- Parses CSV files
- Parses JSON files
- Parses PDF files (with mammoth)
- Parses DOCX files
- Extracts participant names
- Counts messages by participant
- Identifies media messages vs text messages
- Calculates message statistics
- Returns metadata (fileId, chatId, processedAt)
- Limits preview to first 100 messages
- Analyzes media message types

**Total: 13+ test cases | ~85% coverage**

#### AI Search API (`/api/ai-search`)
- Validates required query parameter
- Performs keyword searches
- Identifies financial queries automatically
- Performs financial analysis on chat data
- Extracts financial mentions with relevance scores
- Analyzes sentiment of messages
- Filters messages by sentiment score (positive/negative/neutral)
- Handles missing chat data gracefully
- Respects search result limits
- Returns consistent timestamps
- Validates search type parameter
- Handles multiple keywords in queries
- Fallback behavior without OpenAI API

**Total: 13+ test cases | ~80% coverage**

### Utility Functions
- `cn()` - Tailwind class merging
  - Single class handling
  - Multiple class merging
  - Conditional class handling
  - Undefined/null value handling
  - Responsive class precedence

- `formatDate()` - Date formatting
  - Date object formatting (en-US locale)
  - String date formatting
  - Edge dates (Jan 1, Dec 31)
  - Locale-specific formatting

- `formatTime()` - Time formatting
  - Date object time extraction
  - String time parsing
  - 24-hour format with 2-digit hours
  - Edge cases (midnight, noon)

- `slugify()` - String slug generation
  - Lowercase conversion
  - Space to hyphen replacement
  - Special character removal
  - Multiple space handling
  - Leading/trailing character removal
  - Number preservation

- `truncate()` - String truncation
  - Length comparison
  - Ellipsis addition
  - Various length scenarios
  - Unicode character support
  - Space preservation

**Total: 38+ test cases | ~95% coverage**

### Integration Tests
- Complete file upload and analysis workflow
- Financial content detection and analysis
- Multiple message type handling (text, media, system)
- Message relationship preservation
- Long conversation handling (100+ messages)
- Post-analysis search functionality
- Multi-day participant tracking
- Sentiment aggregation across participants
- Data integrity through transformations
- Edge case parsing (special characters, unusual formatting)

**Total: 10+ test cases | ~75% coverage**

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Run Specific Test File
```bash
npm test FileUploader.test.tsx
npm test process-file.test.ts
npm test ai-search.test.ts
npm test utils.test.ts
npm test chat-analysis-flow.test.ts
```

### Run Tests with Coverage Report
```bash
npm test -- --coverage
```

### Run Tests in CI/CD Mode
```bash
npm test -- --ci --coverage --watchAll=false
```

## Test Configuration

### Jest Configuration (jest.config.js)
- Test environment: `jsdom` (for React component testing)
- Setup file: `jest.setup.js`
- Module name mapping for `@/` imports
- Coverage thresholds: 50% minimum (global)
- Test file patterns: `**/*.test.{ts,tsx}`

### Jest Setup (jest.setup.js)
- Imports `@testing-library/jest-dom` for DOM matchers
- Mocks `next/router` for Next.js routing
- Mocks `next/image` for image component
- Suppresses ReactDOM.render warnings

## Key Testing Patterns

### API Route Testing
```typescript
import { POST } from '@/app/api/route-name/route'
import { NextRequest } from 'next/server'

const request = new NextRequest('http://localhost:3000/api/route', {
  method: 'POST',
  body: JSON.stringify({ /* data */ }),
})

const response = await POST(request)
const data = await response.json()
```

### Component Testing with React Testing Library
```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

render(<Component />)
expect(screen.getByTestId('element')).toBeInTheDocument()
```

### File Upload Testing
```typescript
const file = new File(['content'], 'filename.ext', { type: 'mime/type' })
const formData = new FormData()
formData.append('file', file)

const request = new NextRequest('http://localhost:3000/api/process-file', {
  method: 'POST',
  body: formData,
})
```

## Coverage Goals

| Module | Current | Target |
|--------|---------|--------|
| Components | ~90% | 85%+ |
| API Routes | ~80-85% | 80%+ |
| Utilities | ~95% | 80%+ |
| Integration | ~75% | 70%+ |
| **Overall** | ~85% | **75%+** |

## Troubleshooting

### Issue: Tests timeout
**Solution:** Increase timeout in jest.config.js or individual tests:
```typescript
jest.setTimeout(10000) // 10 seconds
```

### Issue: Module not found errors
**Solution:** Ensure `jest.config.js` has correct module mapping:
```javascript
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/src/$1'
}
```

### Issue: React Testing Library warnings
**Solution:** Ensure `jest.setup.js` imports `@testing-library/jest-dom`

### Issue: API route tests failing
**Solution:** Mock external dependencies (OpenAI, file parsers) as needed

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Clear Test Names**: Use descriptive test titles
3. **Arrange-Act-Assert**: Follow AAA pattern
4. **Mock External APIs**: Mock OpenAI, Firebase, etc.
5. **Test Edge Cases**: Empty inputs, large files, special characters
6. **Use Fixtures**: Create reusable test data
7. **Avoid Implementation Details**: Test behavior, not implementation
8. **Keep Tests Fast**: Mock slow operations
9. **Meaningful Assertions**: Test specific outcomes
10. **Maintain Coverage**: Keep coverage above 75%

## CI/CD Integration

The test suite is configured to run on GitHub Actions. See `.github/workflows/tests.yml` for:
- Automated test runs on push/PR
- Coverage reporting
- Node.js version matrix (16.x, 18.x, 20.x)
- Test result notifications

## Future Improvements

- [ ] Add visual regression tests with Playwright
- [ ] Increase coverage to 85%+ across all modules
- [ ] Add performance benchmarks
- [ ] Mock external APIs more comprehensively
- [ ] Add accessibility tests with jest-axe
- [ ] Expand E2E tests with Playwright

## Resources

- [Jest Documentation](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)
- [Next.js Testing](https://nextjs.org/docs/testing)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

**Last Updated**: April 18, 2024
**Test Suite Version**: 1.0
**Coverage Target**: 75%+ across all modules
