import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectSelector } from '../../components/project-selector'

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  Plus: (props: any) => <div data-testid="plus-icon" {...props} />,
  Trash2: (props: any) => <div data-testid="trash-icon" {...props} />,
  FolderOpen: (props: any) => <div data-testid="folder-icon" {...props} />
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

const DialogContext = React.createContext({ open: false, setOpen: (open: boolean) => {} })

jest.mock('../../components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => (
    <DialogContext.Provider value={{ open: !!open, setOpen: onOpenChange || (() => {}) }}>
      <div data-testid={open ? "dialog" : "dialog-closed"}>{children}</div>
    </DialogContext.Provider>
  ),
  DialogTrigger: ({ children, asChild }: any) => {
    const { setOpen } = React.useContext(DialogContext)
    const handleClick = (e: any) => {
      setOpen(true)
      if (asChild && children?.props?.onClick) {
        children.props.onClick(e)
      }
    }
    if (asChild) {
      return React.cloneElement(children, { onClick: handleClick })
    }
    return <button data-testid="dialog-trigger" onClick={handleClick}>{children}</button>
  },
  DialogContent: ({ children }: any) => {
    const { open } = React.useContext(DialogContext)
    return open ? <div data-testid="dialog-content">{children}</div> : null
  },
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogDescription: ({ children }: any) => <p data-testid="dialog-description">{children}</p>
}))

jest.mock('../../components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, ...props }: any) => (
    <input 
      value={value} 
      onChange={onChange} 
      placeholder={placeholder} 
      data-testid="input"
      {...props}
    />
  )
}))

jest.mock('../../components/ui/label', () => ({
  Label: ({ children, ...props }: any) => (
    <label data-testid="label" {...props}>{children}</label>
  )
}))

jest.mock('../../components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder, ...props }: any) => (
    <textarea 
      value={value} 
      onChange={onChange} 
      placeholder={placeholder} 
      data-testid="textarea"
      {...props}
    />
  )
}))

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
}

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true
})

// Mock console methods
const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}

Object.defineProperty(console, 'error', {
  value: mockConsole.error,
  writable: true
})

// Mock window.confirm
Object.defineProperty(window, 'confirm', {
  value: jest.fn(),
  writable: true
})

const mockProject = {
  id: 'project-1',
  name: 'Test Project',
  description: 'Test Description',
  createdAt: '2025-01-15T10:30:00Z',
  messageCount: 100,
  participants: ['John', 'Jane'],
  analysis: {
    keywords: ['test', 'sample']
  }
}

describe('ProjectSelector Component', () => {
  const mockOnProjectSelect = jest.fn()
  
  beforeEach(() => {
    jest.clearAllMocks()
    mockLocalStorage.getItem.mockReturnValue(null)
    mockLocalStorage.setItem.mockImplementation(() => {})
    ;(window.confirm as jest.Mock).mockReturnValue(true)
  })

  const renderComponent = (selectedProject: any = null) => {
    return render(
      <ProjectSelector 
        onProjectSelect={mockOnProjectSelect}
        selectedProject={selectedProject}
      />
    )
  }

  describe('Basic Rendering', () => {
    test('should render without crashing', () => {
      renderComponent()
      expect(screen.getByTestId('card')).toBeInTheDocument()
    })

    test('should render card title', () => {
      renderComponent()
      expect(screen.getByText('Your Projects')).toBeInTheDocument()
    })

    test('should render new project button', () => {
      renderComponent()
      expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()
      expect(screen.getByTestId('plus-icon')).toBeInTheDocument()
    })

    test('should show sample project when no projects in localStorage', () => {
      renderComponent()
      expect(screen.getByText('Sample WhatsApp Analysis')).toBeInTheDocument()
      expect(screen.getByText('Demo project showing the beautiful interface')).toBeInTheDocument()
    })
  })

  describe('Project Loading from localStorage', () => {
    test('should load existing projects from localStorage', () => {
      const storedProjects = JSON.stringify([mockProject])
      mockLocalStorage.getItem.mockReturnValue(storedProjects)
      
      renderComponent()
      
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('whatsapp-analyzer-projects')
      expect(screen.getByText('Test Project')).toBeInTheDocument()
      expect(screen.getByText('Test Description')).toBeInTheDocument()
    })

    test('should handle corrupted localStorage data gracefully', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json')
      mockConsole.error.mockImplementation(() => {})
      
      renderComponent()
      
      expect(mockConsole.error).toHaveBeenCalled()
      expect(screen.getByText('No Projects Yet')).toBeInTheDocument()
    })

    test('should handle localStorage errors gracefully', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error')
      })
      mockConsole.error.mockImplementation(() => {})
      
      renderComponent()
      
      expect(mockConsole.error).toHaveBeenCalled()
      expect(screen.getByText('No Projects Yet')).toBeInTheDocument()
    })
  })

  describe('Project Creation', () => {
    test('should open create dialog when new project button is clicked', async () => {
      const user = userEvent.setup()
      renderComponent()
      
      const newProjectButton = screen.getByRole('button', { name: /new project/i })
      await user.click(newProjectButton)
      
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
      expect(screen.getByTestId('dialog-title')).toHaveTextContent('Create New Project')
    })

    test('should create project with valid inputs', async () => {
      const user = userEvent.setup()
      renderComponent()
      
      // Open dialog
      const newProjectButton = screen.getByRole('button', { name: /new project/i })
      await user.click(newProjectButton)
      
      // Fill inputs
      const nameInput = screen.getByPlaceholderText('My WhatsApp Analysis')
      const descriptionTextarea = screen.getByTestId('textarea')
      
      await user.type(nameInput, 'New Test Project')
      await user.type(descriptionTextarea, 'New Test Description')
      
      // Submit
      const createButton = screen.getByRole('button', { name: 'Create Project' })
      await user.click(createButton)
      
      expect(mockLocalStorage.setItem).toHaveBeenCalled()
      expect(mockOnProjectSelect).toHaveBeenCalled()
    })

    test('should not create project with empty name', async () => {
      const user = userEvent.setup()
      renderComponent()
      
      // Clear mock calls from mount loadProjects()!
      mockLocalStorage.setItem.mockClear()
      mockOnProjectSelect.mockClear()

      // Open dialog
      const newProjectButton = screen.getByRole('button', { name: /new project/i })
      await user.click(newProjectButton)
      
      // Try to submit without name
      const createButton = screen.getByRole('button', { name: 'Create Project' })
      await user.click(createButton)
      
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
      expect(mockOnProjectSelect).not.toHaveBeenCalled()
    })

    test('should trim whitespace from project name', async () => {
      const user = userEvent.setup()
      renderComponent()
      
      // Clear mock calls from mount loadProjects()!
      mockLocalStorage.setItem.mockClear()

      // Open dialog
      const newProjectButton = screen.getByRole('button', { name: /new project/i })
      await user.click(newProjectButton)
      
      // Fill with whitespace
      const nameInput = screen.getByPlaceholderText('My WhatsApp Analysis')
      await user.type(nameInput, '  Trimmed Project  ')
      
      // Submit
      const createButton = screen.getByRole('button', { name: 'Create Project' })
      await user.click(createButton)
      
      const setItemCall = mockLocalStorage.setItem.mock.calls[0]
      const savedProjects = JSON.parse(setItemCall[1])
      const trimmedProject = savedProjects.find((p: any) => p.name === 'Trimmed Project')
      expect(trimmedProject).toBeDefined()
    })

    test('should handle storage errors during project creation', async () => {
      const user = userEvent.setup()
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage full')
      })
      mockConsole.error.mockImplementation(() => {})
      
      renderComponent()
      
      // Open dialog and create project
      const newProjectButton = screen.getByRole('button', { name: /new project/i })
      await user.click(newProjectButton)
      
      const nameInput = screen.getByPlaceholderText('My WhatsApp Analysis')
      await user.type(nameInput, 'Test Project')
      
      const createButton = screen.getByRole('button', { name: 'Create Project' })
      await user.click(createButton)
      
      expect(mockConsole.error).toHaveBeenCalled()
    })
  })

  describe('Project Selection', () => {
    test('should select project when clicked', async () => {
      const user = userEvent.setup()
      const storedProjects = JSON.stringify([mockProject])
      mockLocalStorage.getItem.mockReturnValue(storedProjects)
      
      renderComponent()
      
      const projectCard = screen.getByText('Test Project').closest('[data-testid="card"]')
      await user.click(projectCard!)
      
      expect(mockOnProjectSelect).toHaveBeenCalledWith(mockProject)
    })

    test('should show selected state for current project', () => {
      const storedProjects = JSON.stringify([mockProject])
      mockLocalStorage.getItem.mockReturnValue(storedProjects)
      
      renderComponent(mockProject)
      
      const projectCard = screen.getByText('Test Project').closest('[data-testid="card"]')
      expect(projectCard).toHaveClass('ring-2')
    })

    test('should display project statistics correctly', () => {
      const storedProjects = JSON.stringify([mockProject])
      mockLocalStorage.getItem.mockReturnValue(storedProjects)
      
      renderComponent()
      
      expect(screen.getByText('100 messages')).toBeInTheDocument()
    })
  })

  describe('Project Deletion', () => {
    test('should show delete button for projects', () => {
      const storedProjects = JSON.stringify([mockProject])
      mockLocalStorage.getItem.mockReturnValue(storedProjects)
      
      renderComponent()
      
      expect(screen.getByTestId('trash-icon')).toBeInTheDocument()
    })

    test('should delete project when confirmed', async () => {
      const user = userEvent.setup()
      const storedProjects = JSON.stringify([mockProject])
      mockLocalStorage.getItem.mockReturnValue(storedProjects)
      ;(window.confirm as jest.Mock).mockReturnValue(true)
      
      renderComponent(mockProject)
      
      const deleteButton = screen.getByTestId('trash-icon').closest('button')
      await user.click(deleteButton!)
      
      expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this project?')
      expect(mockLocalStorage.setItem).toHaveBeenCalled()
      expect(mockOnProjectSelect).toHaveBeenCalledWith(null)
    })

    test('should not delete project when cancelled', async () => {
      const user = userEvent.setup()
      const storedProjects = JSON.stringify([mockProject])
      mockLocalStorage.getItem.mockReturnValue(storedProjects)
      ;(window.confirm as jest.Mock).mockReturnValue(false)
      
      renderComponent()
      
      const deleteButton = screen.getByTestId('trash-icon').closest('button')
      await user.click(deleteButton!)
      
      expect(window.confirm).toHaveBeenCalled()
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
      expect(mockOnProjectSelect).not.toHaveBeenCalled()
    })

    test('should deselect project if currently selected project is deleted', async () => {
      const user = userEvent.setup()
      const storedProjects = JSON.stringify([mockProject])
      mockLocalStorage.getItem.mockReturnValue(storedProjects)
      ;(window.confirm as jest.Mock).mockReturnValue(true)
      
      renderComponent(mockProject)
      
      const deleteButton = screen.getByTestId('trash-icon').closest('button')
      await user.click(deleteButton!)
      
      expect(mockOnProjectSelect).toHaveBeenCalledWith(null)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    test('should handle projects without analysis data', () => {
      const projectWithoutAnalysis = {
        ...mockProject,
        analysis: undefined
      }
      const storedProjects = JSON.stringify([projectWithoutAnalysis])
      mockLocalStorage.getItem.mockReturnValue(storedProjects)
      
      renderComponent()
      
      expect(screen.getByText('Test Project')).toBeInTheDocument()
      expect(screen.getByText('100 messages')).toBeInTheDocument()
    })

    test('should handle projects without participants', () => {
      const projectWithoutParticipants = {
        ...mockProject,
        participants: []
      }
      const storedProjects = JSON.stringify([projectWithoutParticipants])
      mockLocalStorage.getItem.mockReturnValue(storedProjects)
      
      renderComponent()
      
      expect(screen.getByText('Test Project')).toBeInTheDocument()
      expect(screen.getByText('100 messages')).toBeInTheDocument()
    })

    test('should handle very long project names', () => {
      const longNameProject = {
        ...mockProject,
        name: 'A'.repeat(100)
      }
      const storedProjects = JSON.stringify([longNameProject])
      mockLocalStorage.getItem.mockReturnValue(storedProjects)
      
      renderComponent()
      
      expect(screen.getByText('A'.repeat(100))).toBeInTheDocument()
    })

    test('should handle project creation with special characters', async () => {
      const user = userEvent.setup()
      renderComponent()
      
      // Open dialog
      const newProjectButton = screen.getByRole('button', { name: /new project/i })
      await user.click(newProjectButton)
      
      // Fill with special characters
      const nameInput = screen.getByPlaceholderText('My WhatsApp Analysis')
      await user.type(nameInput, '项目测试 @#$%^&*()')
      
      // Submit
      const createButton = screen.getByRole('button', { name: 'Create Project' })
      await user.click(createButton)
      
      expect(mockLocalStorage.setItem).toHaveBeenCalled()
    })

    test('should reset form after successful creation', async () => {
      const user = userEvent.setup()
      renderComponent()
      
      // Open dialog
      const newProjectButton = screen.getByRole('button', { name: /new project/i })
      await user.click(newProjectButton)
      
      // Fill inputs
      const nameInput = screen.getByPlaceholderText('My WhatsApp Analysis')
      const descriptionTextarea = screen.getByTestId('textarea')
      
      await user.type(nameInput, 'Test Project')
      await user.type(descriptionTextarea, 'Test Description')
      
      // Submit
      const createButton = screen.getByRole('button', { name: 'Create Project' })
      await user.click(createButton)
      
      // Check if form is reset (dialog should close)
      await waitFor(() => {
        expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
      })
    })
  })

  // Loading states are synchronous for localStorage operations

  describe('Accessibility', () => {
    test('should have proper ARIA labels', () => {
      renderComponent()
      
      const newProjectButton = screen.getByRole('button', { name: /new project/i })
      expect(newProjectButton).toBeInTheDocument()
    })

    test('should be keyboard navigable', async () => {
      const user = userEvent.setup()
      renderComponent()
      
      // Tab through elements
      await user.tab()
      expect(screen.getByRole('button', { name: /new project/i })).toHaveFocus()
    })

    test('should have proper semantic structure', () => {
      renderComponent()
      
      expect(screen.getByTestId('card-title')).toBeInTheDocument()
      expect(screen.getByTestId('card-content')).toBeInTheDocument()
    })
  })
}) 