import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Home from '../../app/page'

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  Upload: (props: any) => <div data-testid="upload-icon" {...props} />,
  MessageSquare: (props: any) => <div data-testid="message-square-icon" {...props} />,
  BarChart3: (props: any) => <div data-testid="chart-icon" {...props} />,
  FileText: (props: any) => <div data-testid="file-icon" {...props} />,
  Bot: (props: any) => <div data-testid="bot-icon" {...props} />,
  Database: (props: any) => <div data-testid="database-icon" {...props} />
}))

// Mock the sub-components
jest.mock('../../components/project-selector', () => ({
  ProjectSelector: ({ onProjectSelect, selectedProject }: any) => (
    <div data-testid="project-selector">
      <div data-testid="selected-project-id">{selectedProject?.id || 'none'}</div>
      <button 
        data-testid="select-project-btn" 
        onClick={() => onProjectSelect({ 
          id: 'test-project-123', 
          name: 'Test Chat Project', 
          description: 'A mock project for testing',
          messageCount: 1500, 
          participants: ['Alice', 'Bob'],
          analysis: { keywords: ['hello', 'meeting', 'urgent'] },
          dateRange: { start: '2025-01-01T00:00:00Z', end: '2025-01-10T00:00:00Z' },
          createdAt: new Date().toISOString()
        })}
      >
        Select Mock Project
      </button>
      <button 
        data-testid="clear-project-btn" 
        onClick={() => onProjectSelect(null)}
      >
        Clear Selection
      </button>
    </div>
  )
}))

jest.mock('../../components/file-upload', () => ({
  FileUpload: ({ onFileProcessed }: any) => (
    <div data-testid="file-upload-mock">
      <button 
        data-testid="mock-file-process-btn"
        onClick={() => onFileProcessed({
          totalMessages: 2000,
          participants: [{ name: 'Alice' }, { name: 'Bob' }],
          analysis: { keywords: ['work', 'project'] },
          dateRange: { start: '2025-01-01', end: '2025-01-15' }
        })}
      >
        Process Mock File
      </button>
    </div>
  )
}))

jest.mock('../../components/ai-chat-interface', () => ({
  AIChatInterface: ({ selectedProject }: any) => (
    <div data-testid="ai-chat-interface-mock">
      Chatting about {selectedProject?.name}
    </div>
  )
}))

// Mock shadcn/ui components
jest.mock('../../components/ui/card', () => ({
  Card: ({ children, className, ...props }: any) => <div className={className} data-testid="card" {...props}>{children}</div>,
  CardContent: ({ children, className, ...props }: any) => <div className={className} data-testid="card-content" {...props}>{children}</div>,
  CardHeader: ({ children, className, ...props }: any) => <div className={className} data-testid="card-header" {...props}>{children}</div>,
  CardTitle: ({ children, className, ...props }: any) => <h3 className={className} data-testid="card-title" {...props}>{children}</h3>,
  CardDescription: ({ children, className, ...props }: any) => <p className={className} data-testid="card-description" {...props}>{children}</p>
}))

jest.mock('../../components/ui/badge', () => ({
  Badge: ({ children, className, ...props }: any) => (
    <span data-testid="badge" className={className} {...props}>
      {children}
    </span>
  )
}))

jest.mock('../../components/ui/tabs', () => ({
  Tabs: ({ children, defaultValue, className, ...props }: any) => (
    <div data-testid="tabs" data-default-value={defaultValue} className={className} {...props}>
      {children}
    </div>
  ),
  TabsContent: ({ children, value, className, ...props }: any) => (
    <div data-testid={`tab-content-${value}`} className={className} {...props}>
      {children}
    </div>
  ),
  TabsList: ({ children, className, ...props }: any) => (
    <div data-testid="tabs-list" className={className} {...props}>
      {children}
    </div>
  ),
  TabsTrigger: ({ children, value, disabled, className, ...props }: any) => (
    <button 
      data-testid={`tab-trigger-${value}`} 
      disabled={disabled}
      className={className} 
      {...props}
    >
      {children}
    </button>
  )
}))

describe('WhatsAppAnalyzer Main Page Component', () => {
  describe('Initial Default State (No Project Selected)', () => {
    test('should render headers and description text', () => {
      render(<Home />)
      expect(screen.getByText('WhatsApp Analyzer')).toBeInTheDocument()
      expect(screen.getByText(/Professional WhatsApp chat analysis with AI-powered insights/i)).toBeInTheDocument()
    })

    test('should render project selector interface in default state', () => {
      render(<Home />)
      expect(screen.getByTestId('project-selector')).toBeInTheDocument()
      expect(screen.getByTestId('selected-project-id')).toHaveTextContent('none')
    })

    test('should render platform introduction panel when no project is selected', () => {
      render(<Home />)
      expect(screen.getByText('Complete WhatsApp Analysis Platform')).toBeInTheDocument()
      expect(screen.getByText(/Create a project to start analyzing WhatsApp chats/i)).toBeInTheDocument()
    })

    test('should render all 4 platform descriptive feature cards', () => {
      render(<Home />)
      expect(screen.getByText('Complete Processing')).toBeInTheDocument()
      expect(screen.getByText('AI Chat Interface')).toBeInTheDocument()
      expect(screen.getByText('Advanced Analysis')).toBeInTheDocument()
      expect(screen.getByText('Legal Documents')).toBeInTheDocument()
    })
  })

  describe('Project Selection and Active Dashboard State', () => {
    test('should transition page state and hide introductory layout when a project is selected', async () => {
      const user = userEvent.setup()
      render(<Home />)

      // Click mock select button
      const selectBtn = screen.getByTestId('select-project-btn')
      await user.click(selectBtn)

      // Intro layout should be gone
      expect(screen.queryByText('Complete WhatsApp Analysis Platform')).not.toBeInTheDocument()
      
      // Selected project name and overview cards should be visible
      expect(screen.getByText('Test Chat Project')).toBeInTheDocument()
      expect(screen.getByText('A mock project for testing')).toBeInTheDocument()
    })

    test('should render overall metrics widgets when a project is selected', async () => {
      const user = userEvent.setup()
      render(<Home />)

      const selectBtn = screen.getByTestId('select-project-btn')
      await user.click(selectBtn)

      // Metrics: messages count badge and values
      expect(screen.getByText('1,500 messages')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument() // 2 participants
      expect(screen.getByText('3')).toBeInTheDocument() // 3 keywords
      expect(screen.getByText('9')).toBeInTheDocument() // 9 days span (Jan 1 to Jan 10)
    })

    test('should render tabbed interface container and all tab triggers', async () => {
      const user = userEvent.setup()
      render(<Home />)

      const selectBtn = screen.getByTestId('select-project-btn')
      await user.click(selectBtn)

      expect(screen.getByTestId('tabs')).toBeInTheDocument()
      expect(screen.getByTestId('tab-trigger-upload')).toBeInTheDocument()
      expect(screen.getByTestId('tab-trigger-ai-chat')).toBeInTheDocument()
      expect(screen.getByTestId('tab-trigger-analysis')).toBeInTheDocument()
      expect(screen.getByTestId('tab-trigger-documents')).toBeInTheDocument()
    })

    test('should enable AI Chat, Analysis and Documents tabs when messageCount > 0', async () => {
      const user = userEvent.setup()
      render(<Home />)

      const selectBtn = screen.getByTestId('select-project-btn')
      await user.click(selectBtn)

      expect(screen.getByTestId('tab-trigger-ai-chat')).not.toBeDisabled()
      expect(screen.getByTestId('tab-trigger-analysis')).not.toBeDisabled()
      expect(screen.getByTestId('tab-trigger-documents')).not.toBeDisabled()
    })

    test('should render sub-components inside tab contents when selected', async () => {
      const user = userEvent.setup()
      render(<Home />)

      const selectBtn = screen.getByTestId('select-project-btn')
      await user.click(selectBtn)

      // Default active tab is 'upload', rendering file upload mock
      expect(screen.getByTestId('tab-content-upload')).toBeInTheDocument()
      expect(screen.getByTestId('file-upload-mock')).toBeInTheDocument()

      // Should also render other tab contents
      expect(screen.getByTestId('tab-content-ai-chat')).toBeInTheDocument()
      expect(screen.getByTestId('tab-content-analysis')).toBeInTheDocument()
      expect(screen.getByTestId('tab-content-documents')).toBeInTheDocument()
    })
  })

  describe('Flow Interactivity', () => {
    test('should allow files to be processed and update project messageCount metrics', async () => {
      const user = userEvent.setup()
      render(<Home />)

      // Select project first
      const selectBtn = screen.getByTestId('select-project-btn')
      await user.click(selectBtn)

      expect(screen.getByText('1,500 messages')).toBeInTheDocument()

      // Click the file process mock button inside FileUpload component
      const processBtn = screen.getByTestId('mock-file-process-btn')
      await user.click(processBtn)

      // Should update messageCount metric to 2,000 (as returned by mock file processor)
      await waitFor(() => {
        expect(screen.getByText('2,000 messages')).toBeInTheDocument()
      })
    })

    test('should allow clearing the active project selection', async () => {
      const user = userEvent.setup()
      render(<Home />)

      // Select project
      const selectBtn = screen.getByTestId('select-project-btn')
      await user.click(selectBtn)
      expect(screen.getByText('Test Chat Project')).toBeInTheDocument()

      // Clear selection
      const clearBtn = screen.getByTestId('clear-project-btn')
      await user.click(clearBtn)

      // Intro layout should be back
      expect(screen.getByText('Complete WhatsApp Analysis Platform')).toBeInTheDocument()
      expect(screen.queryByText('Test Chat Project')).not.toBeInTheDocument()
    })
  })
})