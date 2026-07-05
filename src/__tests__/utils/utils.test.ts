import { cn, formatDate, formatTime, slugify, truncate } from '@/lib/utils'

describe('Utility Functions', () => {
  test('cn merges class names', () => {
    expect(cn('p-2', 'text-sm')).toContain('p-2')
    expect(cn('p-2', 'text-sm')).toContain('text-sm')
  })

  describe('formatDate', () => {
    test('formats Date using long month in en-US', () => {
      const result = formatDate(new Date('2024-01-15T00:00:00Z'))
      expect(result).toBe('January 15, 2024')
    })
  })

  describe('formatTime', () => {
    test('formats Date with hour and minute', () => {
      const result = formatTime(new Date('2024-01-15T14:30:00Z'))
      expect(result).toMatch(/\d{2}:\d{2}/)
    })
  })

  describe('slugify', () => {
    test('normalizes text to URL slug', () => {
      expect(slugify('Hello World! 2025')).toBe('hello-world-2025')
    })
  })

  describe('truncate', () => {
    test('returns original when within max length', () => {
      expect(truncate('hello', 10)).toBe('hello')
    })

    test('truncates and appends ellipsis when too long', () => {
      expect(truncate('hello world', 5)).toBe('hello...')
    })
  })
})
