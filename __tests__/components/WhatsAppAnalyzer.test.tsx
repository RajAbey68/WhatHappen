import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WhatsAppAnalyzer from '../../app/page'

// Mock the UI components using relative paths
jest.mock('../../components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  )
}))

jest.mock('../../components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>
}))

jest.mock('../../components/ui/tabs', () => ({
  Tabs: ({ children, defaultValue, ...props }: any) => (
    <div data-testid="tabs" data-default-value={defaultValue} {...props}>
      {children}
    </div>
  ),
  TabsContent: ({ children, value, ...props }: any) => (
    <div data-testid={`tab-content-${value}`} {...props}>
      {children}
    </div>
  ),
  TabsList: ({ children, ...props }: any) => (
    <div data-testid="tabs-list" {...props}>
      {children}
    </div>
  ),
  TabsTrigger: ({ children, value, ...props }: any) => (
    <button data-testid={`tab-trigger-${value}`} {...props}>
      {children}
    </button>
  )
}))

jest.mock('../../components/ui/badge', () => ({
  Badge: ({ children, ...props }: any) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  )
}))

describe('WhatsAppAnalyzer Component', () => {
  beforeEach(() => {
    // Reset DOM manipulation
    document.documentElement.className = ''
  })

  describe('Basic Rendering', () => {
    test('should render without crashing', () => {
      render(<WhatsAppAnalyzer />)
      expect(document.body).toBeInTheDocument()
    })

    test('should render main title', () => {
      render(<WhatsAppAnalyzer />)
      const title = screen.getByText(/WhatsApp Analyzer/i)
      expect(title).toBeInTheDocument()
    })

    test('should render description text', () => {
      render(<WhatsAppAnalyzer />)
      const description = screen.getByText(/Unlock powerful insights/i)
      expect(description).toBeInTheDocument()
    })
  })

  describe('Feature Pills', () => {
    test('should render feature badges', () => {
      render(<WhatsAppAnalyzer />)
      
      expect(screen.getByText('AI-Powered')).toBeInTheDocument()
      expect(screen.getByText('Real-time Analysis')).toBeInTheDocument()
      expect(screen.getByText('Advanced Insights')).toBeInTheDocument()
    })
  })

  describe('Navigation Structure', () => {
    test('should render tabs container', () => {
      render(<WhatsAppAnalyzer />)
      
      expect(screen.getByTestId('tabs')).toBeInTheDocument()
      expect(screen.getByTestId('tabs-list')).toBeInTheDocument()
    })

    test('should render all tab triggers', () => {
      render(<WhatsAppAnalyzer />)
      
      expect(screen.getByTestId('tab-trigger-upload')).toBeInTheDocument()
      expect(screen.getByTestId('tab-trigger-dashboard')).toBeInTheDocument()
      expect(screen.getByTestId('tab-trigger-chat')).toBeInTheDocument()
      expect(screen.getByTestId('tab-trigger-database')).toBeInTheDocument()
      expect(screen.getByTestId('tab-trigger-settings')).toBeInTheDocument()
    })

    test('should render all tab content areas', () => {
      render(<WhatsAppAnalyzer />)
      
      expect(screen.getByTestId('tab-content-upload')).toBeInTheDocument()
      expect(screen.getByTestId('tab-content-dashboard')).toBeInTheDocument()
      expect(screen.getByTestId('tab-content-chat')).toBeInTheDocument()
      expect(screen.getByTestId('tab-content-database')).toBeInTheDocument()
      expect(screen.getByTestId('tab-content-settings')).toBeInTheDocument()
    })
  })

  describe('Upload Section', () => {
    test('should render upload area', () => {
      render(<WhatsAppAnalyzer />)
      
      expect(screen.getByText('Drop your WhatsApp chat file here')).toBeInTheDocument()
      expect(screen.getByText('Choose File')).toBeInTheDocument()
    })

    test('should render supported file types text', () => {
      render(<WhatsAppAnalyzer />)
      
      expect(screen.getByText(/Supports TXT, ZIP, and JSON files/)).toBeInTheDocument()
    })
  })

  describe('Content Sections', () => {
    test('should render dashboard placeholder content', () => {
      render(<WhatsAppAnalyzer />)
      
      expect(screen.getByText('Upload a chat file to see analytics and insights')).toBeInTheDocument()
    })

    test('should render chat placeholder content', () => {
      render(<WhatsAppAnalyzer />)
      
      expect(screen.getByText('Chat with AI about your WhatsApp conversations')).toBeInTheDocument()
    })

    test('should render database placeholder content', () => {
      render(<WhatsAppAnalyzer />)
      
      expect(screen.getByText('View and search your processed chat data')).toBeInTheDocument()
    })

    test('should render settings placeholder content', () => {
      render(<WhatsAppAnalyzer />)
      
      expect(screen.getByText('Configure your analysis preferences')).toBeInTheDocument()
    })
  })

  describe('Dark Mode Toggle', () => {
    test('should render dark mode toggle button', () => {
      render(<WhatsAppAnalyzer />)
      
      const darkModeButton = screen.getByTestId('moon-icon').closest('button')
      expect(darkModeButton).toBeInTheDocument()
    })

    test('should toggle dark mode state', async () => {
      const user = userEvent.setup()
      render(<WhatsAppAnalyzer />)
      
      const darkModeButton = screen.getByTestId('moon-icon').closest('button')!
      
      // Click to toggle
      await user.click(darkModeButton)
      
      // Should update document class
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      })
    })
  })

  describe('Accessibility', () => {
    test('should have proper semantic structure', () => {
      render(<WhatsAppAnalyzer />)
      
      const header = screen.getByRole('banner')
      const main = screen.getByRole('main')
      
      expect(header).toBeInTheDocument()
      expect(main).toBeInTheDocument()
    })

    test('should be keyboard navigable', async () => {
      const user = userEvent.setup()
      render(<WhatsAppAnalyzer />)
      
      const darkModeButton = screen.getByTestId('moon-icon').closest('button')!
      
      // Should be focusable
      await user.tab()
      expect(darkModeButton).toHaveFocus()
    })
  })

  describe('Visual Elements', () => {
    test('should render with proper styling classes', () => {
      render(<WhatsAppAnalyzer />)
      
      const title = screen.getByText('WhatsApp Analyzer')
      expect(title.classList.contains('animate-pulse')).toBe(true)
    })

    test('should render badges with hover effects', () => {
      render(<WhatsAppAnalyzer />)
      
      const badges = screen.getAllByTestId('badge')
      expect(badges.length).toBeGreaterThan(0)
      
      badges.forEach(badge => {
        expect(badge.classList.contains('hover:scale-105')).toBe(true)
      })
    })
  })
}) 