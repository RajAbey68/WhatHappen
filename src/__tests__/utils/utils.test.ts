import { cn, formatDate, formatTime, slugify, truncate } from '@/lib/utils'

describe('Utility Functions', () => {
  describe('cn() - Class Name Merger', () => {
    test('merges single class', () => {
      expect(cn('px-2')).toBe('px-2')
    })

    test('merges multiple classes', () => {
      const result = cn('px-2', 'py-1')
      expect(result).toContain('px-2')
      expect(result).toContain('py-1')
    })

    test('handles conditional classes', () => {
      const result = cn('px-2', false && 'py-1')
      expect(result).toBe('px-2')
    })

    test('merges tailwind classes correctly', () => {
      const result = cn('px-2 py-1', 'px-4')
      expect(result).toContain('px-4')
      expect(result).toContain('py-1')
    })

    test('handles undefined and null values', () => {
      const result = cn('px-2', undefined, null, 'py-1')
      expect(result).toContain('px-2')
      expect(result).toContain('py-1')
    })
  })

  describe('formatDate()', () => {
    test('formats Date object correctly', () => {
      const date = new Date('2024-01-15')
      const result = formatDate(date)
      expect(result).toMatch(/Jan 15, 2024/)
    })

    test('formats string date correctly', () => {
      const result = formatDate('2024-01-15')
      expect(result).toMatch(/Jan 15, 2024/)
    })

    test('handles different dates', () => {
      const result = formatDate('2024-12-25')
      expect(result).toMatch(/Dec 25, 2024/)
    })

    test('uses locale format for en-US', () => {
      const date = new Date('2024-03-10')
      const result = formatDate(date)
      expect(result).toContain('2024')
      expect(result).toContain('Mar')
    })

    test('handles edge date (January 1st)', () => {
      const result = formatDate('2024-01-01')
      expect(result).toMatch(/Jan 1, 2024/)
    })

    test('handles edge date (December 31st)', () => {
      const result = formatDate('2024-12-31')
      expect(result).toMatch(/Dec 31, 2024/)
    })
  })

  describe('formatTime()', () => {
    test('formats time from Date object', () => {
      const date = new Date('2024-01-15T14:30:00')
      const result = formatTime(date)
      expect(result).toMatch(/14:30/)
    })

    test('formats time from string', () => {
      const result = formatTime('2024-01-15T09:15:00')
      expect(result).toMatch(/09:15/)
    })

    test('uses 24-hour format for en-US with 2-digit hour', () => {
      const result = formatTime('2024-01-15T08:05:00')
      expect(result).toMatch(/08:05/)
    })

    test('handles midnight', () => {
      const result = formatTime('2024-01-15T00:00:00')
      expect(result).toMatch(/00:00/)
    })

    test('handles noon', () => {
      const result = formatTime('2024-01-15T12:00:00')
      expect(result).toMatch(/12:00/)
    })

    test('handles afternoon times', () => {
      const result = formatTime('2024-01-15T15:45:00')
      expect(result).toMatch(/15:45/)
    })
  })

  describe('slugify()', () => {
    test('converts to lowercase', () => {
      expect(slugify('HELLO WORLD')).toBe('hello-world')
    })

    test('replaces spaces with hyphens', () => {
      expect(slugify('hello world')).toBe('hello-world')
    })

    test('removes special characters', () => {
      expect(slugify('hello@world!')).toBe('helloworld')
    })

    test('handles multiple spaces', () => {
      expect(slugify('hello   world')).toBe('hello-world')
    })

    test('handles multiple hyphens from consecutive special chars', () => {
      expect(slugify('hello--world')).toBe('hello--world')
    })

    test('removes punctuation', () => {
      expect(slugify("hello, world!")).toBe('hello-world')
    })

    test('handles apostrophes', () => {
      expect(slugify("it's great")).toBe('its-great')
    })

    test('handles numbers', () => {
      expect(slugify('hello 123 world')).toBe('hello-123-world')
    })

    test('handles empty string', () => {
      expect(slugify('')).toBe('')
    })

    test('handles single word', () => {
      expect(slugify('hello')).toBe('hello')
    })

    test('removes leading and trailing special characters', () => {
      expect(slugify('!hello world!')).toBe('hello-world')
    })
  })

  describe('truncate()', () => {
    test('does not truncate string shorter than length', () => {
      expect(truncate('hello', 10)).toBe('hello')
    })

    test('truncates string longer than length', () => {
      expect(truncate('hello world', 5)).toBe('hello...')
    })

    test('truncates exact length string', () => {
      expect(truncate('hello', 5)).toBe('hello')
    })

    test('handles very long strings', () => {
      const longString = 'a'.repeat(1000)
      expect(truncate(longString, 10)).toBe('aaaaaaaaaa...')
    })

    test('adds ellipsis at correct position', () => {
      expect(truncate('abcdefghij', 5)).toBe('abcde...')
    })

    test('handles length of 1', () => {
      expect(truncate('hello', 1)).toBe('h...')
    })

    test('handles length of 0', () => {
      expect(truncate('hello', 0)).toBe('...')
    })

    test('handles empty string', () => {
      expect(truncate('', 5)).toBe('')
    })

    test('preserves spaces in truncation', () => {
      expect(truncate('hello world', 5)).toBe('hello...')
    })

    test('handles unicode characters', () => {
      expect(truncate('hello 👋 world', 7)).toBe('hello 👋...')
    })
  })

  describe('Integration Tests', () => {
    test('can use cn with formatDate result', () => {
      const dateStr = formatDate(new Date('2024-01-15'))
      const className = cn('text-sm', 'text-gray-500')
      expect(className).toBeDefined()
      expect(dateStr).toMatch(/2024/)
    })

    test('can use slugify with truncate', () => {
      const text = 'This is a very long title that needs truncation'
      const truncated = truncate(text, 20)
      const slugified = slugify(truncated)
      expect(slugified).not.toContain('...')
    })

    test('can combine multiple utility functions', () => {
      const date = new Date('2024-03-15T14:30:00')
      const dateFormatted = formatDate(date)
      const timeFormatted = formatTime(date)
      const combined = `${dateFormatted} at ${timeFormatted}`
      expect(combined).toContain('Mar')
      expect(combined).toContain('14:30')
    })
  })
})
