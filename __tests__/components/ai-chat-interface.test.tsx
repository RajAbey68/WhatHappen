import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AIChatInterface } from '../../components/ai-chat-interface'

// Mock fetch
global.fetch = jest.fn()

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  Send: (props: any) => <div data-testid="send-icon" {...props} />,
  Bot: (props: any) => <div data-testid="bot-icon" {...props} />,
  User: (props: any) => <div data-testid="user-icon" {...props} />,
  Database: (props: any) => <div data-testid="database-icon" {...props} />,
  MessageSquare: (props: any) => <div data-testid="message-icon" {...props} />,
  Sparkles: (props: any) => <div data-testid="sparkles-icon" {...props} />,
  Brain: (props: any) => <div data-testid="brain-icon" {...props} />,
  FileText: (props: any) => <div data-testid="file-icon" {...props} />
}))

// Mock UI components
jest.mock('../../components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  )
}))

jest.mock('../../components/ui/card', () => ({
  Card: ({ children, className, ...props }: any) => (
    <div className={className} data-testid="card" {...props}>{children}</div>
  ),
  CardContent: ({ children, className, ...props }: any) => (
    <div className={className} data-testid="card-content" {...props}>{children}</div>
  ),
  CardHeader: ({ children, className, ...props }: any) => (
    <div className={className} data-testid="card-header" {...props}>{children}</div>
  ),
  CardTitle: ({ children, className, ...props }: any) => (
    <h3 className={className} data-testid="card-title" {...props}>{children}</h3>
  )
}))

jest.mock('../../components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, onKeyDown, disabled, ...props }: any) => (
    <input 
      value={value} 
      onChange={onChange} 
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      disabled={disabled}
      data-testid="chat-input"
      {...props}
    />
  )
}))

jest.mock('../../components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className, ...props }: any) => (
    <div className={className} data-testid="scroll-area" {...props}>{children}</div>
  )
}))

jest.mock('../../components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogDescription: ({ children }: any) => <p data-testid="dialog-description">{children}</p>,
  DialogTrigger: ({ children, asChild }: any) => asChild ? children : <div data-testid="dialog-trigger">{children}</div>
}))

const mockProject = {
  id: 'project-1',
  name: 'Test Project',
  description: 'Test Description',
  createdAt: '2025-01-15T10:30:00Z',
  updatedAt: '2025-01-15T10:30:00Z',
  messageCount: 100,
  participants: ['John', 'Jane', 'Bob'],
  analysis: {
    keywords: ['test', 'sample', 'chat'],
    sentiment: { positive: 0.6, negative: 0.2, neutral: 0.2 }
  },
  dateRange: {
    start: '2025-01-01T00:00:00Z',
    end: '2025-01-15T23:59:59Z'
  }
}

describe('AIChatInterface Component', () => {
  const mockFetch = fetch as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
  })

  const renderComponent = (project = mockProject) => {
    return render(<AIChatInterface selectedProject={project} />)
  }

  describe('Basic Rendering', () => {
    test('should render without crashing', () => {
      renderComponent()
      expect(screen.getByTestId('card')).toBeInTheDocument()
    })

    test('should render chat header', () => {
      renderComponent()
      expect(screen.getByTestId('card-title')).toHaveTextContent('AI Chat Assistant')
    })

    test('should render chat input', () => {
      renderComponent()
      expect(screen.getByTestId('chat-input')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Ask me anything about your chat data...')).toBeInTheDocument()
    })

    test('should render send button', () => {
      renderComponent()
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
      expect(screen.getByTestId('send-icon')).toBeInTheDocument()
    })

    test('should show project context information', () => {
      renderComponent()
      expect(screen.getByText(/100 messages/)).toBeInTheDocument()
      expect(screen.getByText(/3 participants/)).toBeInTheDocument()
      expect(screen.getByText(/3 keywords/)).toBeInTheDocument()
    })
  })

  describe('Message Handling', () => {
    test('should send message when send button is clicked', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'AI response to your question' })
      } as Response)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, 'Hello AI')
      await user.click(sendButton)

      expect(mockFetch).toHaveBeenCalledWith('/api/ai-chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project-1',
          message: 'Hello AI'
        })
      })
    })

    test('should send message when Enter key is pressed', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'AI response' })
      } as Response)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      
      await user.type(input, 'Hello AI{enter}')

      expect(mockFetch).toHaveBeenCalled()
    })

    test('should not send empty messages', async () => {
      const user = userEvent.setup()
      renderComponent()
      
      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('should not send messages with only whitespace', async () => {
      const user = userEvent.setup()
      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, '   ')
      await user.click(sendButton)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('should clear input after sending message', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'AI response' })
      } as Response)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, 'Test message')
      expect(input).toHaveValue('Test message')
      
      await user.click(sendButton)
      
      await waitFor(() => {
        expect(input).toHaveValue('')
      })
    })

    test('should disable input while message is being sent', async () => {
      const user = userEvent.setup()
      let resolvePromise: (value: any) => void
      const mockPromise = new Promise(resolve => {
        resolvePromise = resolve
      })
      
      mockFetch.mockReturnValueOnce(mockPromise as any)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, 'Test message')
      await user.click(sendButton)

      expect(input).toBeDisabled()
      expect(sendButton).toBeDisabled()

      // Resolve the promise
      resolvePromise!({
        ok: true,
        json: async () => ({ response: 'AI response' })
      })

      await waitFor(() => {
        expect(input).not.toBeDisabled()
        expect(sendButton).not.toBeDisabled()
      })
    })
  })

  describe('Chat Display', () => {
    test('should display user messages in chat', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'AI response' })
      } as Response)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, 'User message')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('User message')).toBeInTheDocument()
      })
    })

    test('should display AI responses in chat', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'This is an AI response' })
      } as Response)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, 'User question')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('This is an AI response')).toBeInTheDocument()
      })
    })

    test('should show user and bot icons for messages', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'AI response' })
      } as Response)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, 'Test')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByTestId('user-icon')).toBeInTheDocument()
        expect(screen.getByTestId('bot-icon')).toBeInTheDocument()
      })
    })

    test('should preserve message order in conversation', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ response: 'First AI response' })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ response: 'Second AI response' })
        } as Response)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      // Send first message
      await user.type(input, 'First message')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('First AI response')).toBeInTheDocument()
      })

      // Send second message
      await user.type(input, 'Second message')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('Second AI response')).toBeInTheDocument()
      })

      // Check order
      const messages = screen.getAllByText(/message|response/)
      expect(messages[0]).toHaveTextContent('First message')
      expect(messages[1]).toHaveTextContent('First AI response')
      expect(messages[2]).toHaveTextContent('Second message')
      expect(messages[3]).toHaveTextContent('Second AI response')
    })
  })

  describe('Process WhatsApp Data Feature', () => {
    test('should show process data button', () => {
      renderComponent()
      expect(screen.getByRole('button', { name: /process whatsapp data/i })).toBeInTheDocument()
    })

    test('should process data when button is clicked', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Data processed successfully' })
      } as Response)

      renderComponent()
      
      const processButton = screen.getByRole('button', { name: /process whatsapp data/i })
      await user.click(processButton)

      expect(mockFetch).toHaveBeenCalledWith('/api/ai-chat/project-1', {
        method: 'GET'
      })
    })

    test('should show loading state during data processing', async () => {
      const user = userEvent.setup()
      let resolvePromise: (value: any) => void
      const mockPromise = new Promise(resolve => {
        resolvePromise = resolve
      })
      
      mockFetch.mockReturnValueOnce(mockPromise as any)

      renderComponent()
      
      const processButton = screen.getByRole('button', { name: /process whatsapp data/i })
      await user.click(processButton)

      expect(processButton).toBeDisabled()
      expect(screen.getByText(/processing/i)).toBeInTheDocument()

      // Resolve the promise
      resolvePromise!({
        ok: true,
        json: async () => ({ success: true })
      })

      await waitFor(() => {
        expect(processButton).not.toBeDisabled()
      })
    })
  })

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' })
      } as Response)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, 'Test message')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument()
      })
    })

    test('should handle network errors', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, 'Test message')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument()
      })
    })

    test('should handle malformed API responses', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalidResponse: true })
      } as Response)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, 'Test message')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/error|unexpected/i)).toBeInTheDocument()
      })
    })

    test('should re-enable input after error', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, 'Test message')
      await user.click(sendButton)

      await waitFor(() => {
        expect(input).not.toBeDisabled()
        expect(sendButton).not.toBeDisabled()
      })
    })
  })

  describe('Project Context Integration', () => {
    test('should display project information correctly', () => {
      renderComponent()
      
      expect(screen.getByText('Test Project')).toBeInTheDocument()
      expect(screen.getByText(/100 messages/)).toBeInTheDocument()
      expect(screen.getByText(/3 participants/)).toBeInTheDocument()
    })

    test('should handle projects without analysis', () => {
      const { analysis, ...projectWithoutAnalysis } = mockProject
      
      renderComponent(projectWithoutAnalysis)
      
      expect(screen.getByText(/0 keywords/)).toBeInTheDocument()
    })

    test('should handle projects without participants', () => {
      const projectWithoutParticipants = {
        ...mockProject,
        participants: []
      }
      
      renderComponent(projectWithoutParticipants)
      
      expect(screen.getByText(/0 participants/)).toBeInTheDocument()
    })
  })

  describe('Conversation Management', () => {
    test('should load previous conversations on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversations: [
            {
              id: 'conv-1',
              messages: [
                { role: 'user', content: 'Previous question' },
                { role: 'assistant', content: 'Previous answer' }
              ]
            }
          ]
        })
      } as Response)

      renderComponent()

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/ai-chat/save?projectId=project-1')
      })
    })

    test('should save conversations after each exchange', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ conversations: [] })
        } as Response) // Load conversations
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ response: 'AI response' })
        } as Response) // Query response
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        } as Response) // Save conversation

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, 'Test message')
      await user.click(sendButton)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/ai-chat/save', expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }))
      })
    })
  })

  describe('Edge Cases and Special Scenarios', () => {
    test('should handle very long messages', async () => {
      const user = userEvent.setup()
      const longMessage = 'A'.repeat(10000)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'AI handled long message' })
      } as Response)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, longMessage)
      await user.click(sendButton)

      expect(mockFetch).toHaveBeenCalledWith('/api/ai-chat/query', expect.objectContaining({
        body: JSON.stringify({
          projectId: 'project-1',
          message: longMessage
        })
      }))
    })

    test('should handle special characters in messages', async () => {
      const user = userEvent.setup()
      const specialMessage = 'Test with émojis 🎉 and chars: ñáéíóú <script>alert("xss")</script>'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'AI handled special chars' })
      } as Response)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, specialMessage)
      await user.click(sendButton)

      expect(mockFetch).toHaveBeenCalledWith('/api/ai-chat/query', expect.objectContaining({
        body: JSON.stringify({
          projectId: 'project-1',
          message: specialMessage
        })
      }))
    })

    test('should handle rapid successive messages', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ response: 'Response 1' })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ response: 'Response 2' })
        } as Response)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      // Send first message
      await user.type(input, 'Message 1')
      await user.click(sendButton)

      // Immediately send second message
      await user.type(input, 'Message 2')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('Response 1')).toBeInTheDocument()
        expect(screen.getByText('Response 2')).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    test('should be keyboard navigable', async () => {
      const user = userEvent.setup()
      renderComponent()
      
      // Tab to input
      await user.tab()
      expect(screen.getByTestId('chat-input')).toHaveFocus()
      
      // Tab to send button
      await user.tab()
      expect(screen.getByRole('button', { name: /send/i })).toHaveFocus()
    })

    test('should have proper ARIA labels', () => {
      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      expect(input).toHaveAttribute('placeholder')
      expect(sendButton).toBeInTheDocument()
    })

    test('should provide visual feedback for loading states', async () => {
      const user = userEvent.setup()
      let resolvePromise: (value: any) => void
      const mockPromise = new Promise(resolve => {
        resolvePromise = resolve
      })
      
      mockFetch.mockReturnValueOnce(mockPromise as any)

      renderComponent()
      
      const input = screen.getByTestId('chat-input')
      const sendButton = screen.getByRole('button', { name: /send/i })
      
      await user.type(input, 'Test')
      await user.click(sendButton)

      expect(screen.getByText(/sending/i)).toBeInTheDocument()

      resolvePromise!({
        ok: true,
        json: async () => ({ response: 'AI response' })
      })
    })
  })
}) 