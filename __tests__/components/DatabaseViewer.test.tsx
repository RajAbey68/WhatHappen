import React from 'react'
import { render, screen } from '@testing-library/react'
import { DatabaseViewer } from '@/components/database-viewer'
import '@testing-library/jest-dom'

// Mock Lucide icons simply
jest.mock('lucide-react', () => {
  return new Proxy({}, {
    get: (target, prop) => {
      return (props: any) => React.createElement('div', { 'data-testid': `icon-${String(prop).toLowerCase()}`, ...props })
    }
  })
})

describe('DatabaseViewer Component Integration Test', () => {
  const baseData = {
    totalMessages: 6234,
    messages: [
      { id: '1', sender: 'Sender A', message: 'Hello', timestamp: '2025-03-02' },
      { id: '2', sender: 'Sender B', message: 'Hi there', timestamp: '2025-03-02' }
    ]
  }

  it('shows correct message count using semantic aria-label', () => {
    render(<DatabaseViewer data={baseData} />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-label', 'Showing 2 of 6,234 messages')
  })

  it('falls back to array length when totalMessages is undefined', () => {
    const { totalMessages, ...rest } = baseData
    render(<DatabaseViewer data={{ ...rest }} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Showing 2 of 2 messages')
  })

  it('handles zero totalMessages', () => {
    render(<DatabaseViewer data={{ totalMessages: 0, messages: [] }} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Showing 0 of 0 messages')
  })

  it('handles string totalMessages gracefully by falling back to array length', () => {
    render(<DatabaseViewer data={{ totalMessages: '6234', messages: [] } as any} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Showing 0 of 0 messages')
  })

  it('handles null messages safely', () => {
    render(<DatabaseViewer data={{ messages: null }} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Showing 0 of 0 messages')
  })
})
